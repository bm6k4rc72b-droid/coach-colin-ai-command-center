#include "Social/RCNPCComponent.h"
#include "Social/RCSocialSubsystem.h"
#include "Weather/RCWeatherSubsystem.h"
#include "Core/RCWorldStateSubsystem.h"
#include "AIController.h"
#include "BehaviorTree/BlackboardComponent.h"
#include "GameFramework/Pawn.h"

namespace RCNPC
{
	static const FName BB_Activity(TEXT("Activity"));
	static const FName BB_Spot(TEXT("SpotTag"));
	static const FName BB_Suspicion(TEXT("Suspicion"));
	static const FName Shelter(TEXT("Shelter"));
	static const FName Flee(TEXT("Flee"));
	static const FName Sleep(TEXT("Sleep"));
	static const FName Eat(TEXT("Eat"));
	static const FName Warm(TEXT("WarmByFire"));
}

URCNPCComponent::URCNPCComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	// Brains think every couple of seconds; animation and movement run on the character.
	PrimaryComponentTick.TickInterval = 0.25f;
}

void URCNPCComponent::BeginPlay()
{
	Super::BeginPlay();
	UWorld* World = GetWorld();
	Social = World->GetSubsystem<URCSocialSubsystem>();
	Weather = World->GetSubsystem<URCWeatherSubsystem>();
	WorldState = World->GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>();
	if (Social) Social->RegisterNPC(this);
	ThinkTimer = FMath::FRand() * ThinkInterval; // spread brains across frames
	ChooseActivity();
}

void URCNPCComponent::EndPlay(const EEndPlayReason::Type Reason)
{
	if (Social) Social->UnregisterNPC(this);
	Super::EndPlay(Reason);
}

void URCNPCComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (bDead || !WorldState) return;

	const float Hour = WorldState->GetHour();
	float DeltaHours = LastHour < 0.f ? 0.f : Hour - LastHour;
	if (DeltaHours < 0.f) DeltaHours += 24.f;
	LastHour = Hour;
	UpdateNeeds(DeltaHours);

	Suspicion = FMath::Max(0.f, Suspicion - DeltaTime * 0.05f);
	ThinkTimer -= DeltaTime;
	if (ThinkTimer <= 0.f)
	{
		ThinkTimer = ThinkInterval;
		ChooseActivity();
	}
}

void URCNPCComponent::UpdateNeeds(float DeltaHours)
{
	if (DeltaHours <= 0.f) return;
	const bool bEating = CurrentActivity == RCNPC::Eat;
	const bool bSleeping = CurrentActivity == RCNPC::Sleep;
	Needs.Hunger = FMath::Clamp(Needs.Hunger + (bEating ? -0.8f : 0.06f) * DeltaHours, 0.f, 1.f);
	Needs.Rest = FMath::Clamp(Needs.Rest + (bSleeping ? -0.15f : 0.045f) * DeltaHours, 0.f, 1.f);
	Needs.Social = FMath::Clamp(Needs.Social + (CurrentActivity == TEXT("Socialise") ? -0.3f : 0.03f) * DeltaHours, 0.f, 1.f);

	// Warmth need grows with cold exposure while outdoors.
	if (Weather && GetOwner())
	{
		const bool bSheltered = !Weather->IsExposedToSky(GetOwner()->GetActorLocation() + FVector(0, 0, 100));
		const float Cold = Weather->GetColdDamagePerSecond(0.5f, bSheltered, CurrentActivity == RCNPC::Warm);
		Needs.Warmth = FMath::Clamp(Needs.Warmth + (Cold > 0.f ? 0.4f : -0.3f) * DeltaHours, 0.f, 1.f);
	}
	Needs.Safety = FMath::Max(0.f, Needs.Safety - 0.2f * DeltaHours);
}

const FRCScheduleEntry* URCNPCComponent::FindScheduledEntry(float Hour) const
{
	if (!Schedule) return nullptr;
	const bool bWinter = WorldState && WorldState->GetSeason() == ERCSeason::Winter && Schedule->WinterEntries.Num() > 0;
	const TArray<FRCScheduleEntry>& Entries = bWinter ? Schedule->WinterEntries : Schedule->Entries;
	for (const FRCScheduleEntry& E : Entries)
	{
		const bool bWraps = E.EndHour < E.StartHour; // e.g. Sleep 22 -> 6
		const bool bIn = bWraps ? (Hour >= E.StartHour || Hour < E.EndHour) : (Hour >= E.StartHour && Hour < E.EndHour);
		if (bIn) return &E;
	}
	return nullptr;
}

void URCNPCComponent::ChooseActivity()
{
	// Utility scoring: the schedule proposes, urgent needs and the weather dispose.
	const float Hour = WorldState ? WorldState->GetHour() : 12.f;
	const FRCScheduleEntry* Planned = FindScheduledEntry(Hour);

	struct FOption { FName Activity; FName Spot; float Score; };
	TArray<FOption> Options;
	if (Planned) Options.Add({ Planned->Activity, Planned->SpotTag, Planned->bDuty ? 0.75f : 0.55f });

	Options.Add({ RCNPC::Eat, TEXT("Eat"), Needs.Hunger * 0.9f });
	Options.Add({ RCNPC::Sleep, TEXT("Bed"), Needs.Rest * Needs.Rest * 1.2f });
	Options.Add({ RCNPC::Warm, TEXT("Hearth"), Needs.Warmth * 0.95f });
	Options.Add({ RCNPC::Flee, TEXT("Hide"), Needs.Safety * (1.2f - Personality.Bravery) });

	// Storms empty the streets: outdoor plans lose value with precipitation, wind and lightning; duty resists.
	if (Weather && Planned && Planned->bOutdoors)
	{
		const FRCWeatherState& W = Weather->GetState();
		const float Misery = FMath::Clamp(W.Precipitation * 0.7f + W.WindSpeed / 40.f + W.LightningPerMinute * 0.1f, 0.f, 1.f);
		Options[0].Score *= 1.f - Misery * (Planned->bDuty ? 0.3f : 0.85f);
		Options.Add({ RCNPC::Shelter, TEXT("Shelter"), Misery * 0.7f });
	}

	const FOption* Best = &Options[0];
	for (const FOption& O : Options) if (O.Score > Best->Score) Best = &O;

	if (Best->Activity != CurrentActivity || Best->Spot != CurrentSpotTag)
	{
		CurrentActivity = Best->Activity;
		CurrentSpotTag = Best->Spot;
		OnActivityChanged.Broadcast(CurrentActivity, CurrentSpotTag);
		PushToBlackboard();
	}
}

void URCNPCComponent::PushToBlackboard()
{
	const APawn* Pawn = Cast<APawn>(GetOwner());
	const AAIController* AI = Pawn ? Cast<AAIController>(Pawn->GetController()) : nullptr;
	if (UBlackboardComponent* BB = AI ? AI->GetBlackboardComponent() : nullptr)
	{
		BB->SetValueAsName(RCNPC::BB_Activity, CurrentActivity);
		BB->SetValueAsName(RCNPC::BB_Spot, CurrentSpotTag);
		BB->SetValueAsFloat(RCNPC::BB_Suspicion, Suspicion);
	}
}

float URCNPCComponent::GetSightRange() const
{
	const float Weathered = BaseSight * (Weather ? Weather->GetVisibilityMultiplier() : 1.f);
	const float Alert = 1.f + 0.5f * Suspicion;
	return IsAwake() ? Weathered * Alert : 0.f;
}

TArray<ERCInteraction> URCNPCComponent::GetInteractionOptions(const APawn* Player) const
{
	TArray<ERCInteraction> Out;
	if (bDead) return Out;
	const ERCDisposition Disp = Social ? Social->GetDisposition(NPCId) : ERCDisposition::Neutral;

	if (Dialogue && Disp != ERCDisposition::Hostile) Out.Add(ERCInteraction::Talk);
	Out.Add(ERCInteraction::Follow);
	if (Silver > 0) Out.Add(ERCInteraction::Pickpocket);
	if (bRecruitable && Disp >= ERCDisposition::Friendly) Out.Add(ERCInteraction::Recruit);
	if (Personality.Greed > 0.4f) Out.Add(ERCInteraction::Bribe);
	if (Personality.Bravery < 0.7f) Out.Add(ERCInteraction::Intimidate);
	if (CanBeKilled()) Out.Add(ERCInteraction::Assassinate);
	if (Faction == TEXT("Merchants")) Out.Add(ERCInteraction::Trade);
	return Out;
}

float URCNPCComponent::GetPickpocketChance(const APawn* Player) const
{
	if (!Player || !GetOwner()) return 0.f;
	// Behind and unaware is best; rain noise and crowds help; suspicion and facing the player hurt.
	const FVector ToPlayer = (Player->GetActorLocation() - GetOwner()->GetActorLocation()).GetSafeNormal();
	const float Behind = FMath::Clamp(-FVector::DotProduct(GetOwner()->GetActorForwardVector(), ToPlayer), 0.f, 1.f);
	const float Noise = Weather ? Weather->GetNoiseMultiplier() : 1.f;
	float Chance = 0.35f + 0.35f * Behind + 0.2f * (1.f - Noise) - 0.6f * Suspicion;
	if (!IsAwake()) Chance += 0.3f;
	return FMath::Clamp(Chance, 0.05f, 0.95f);
}

bool URCNPCComponent::TryPickpocket(APawn* Player, int32& OutSilver)
{
	OutSilver = 0;
	const bool bSuccess = FMath::FRand() < GetPickpocketChance(Player);
	if (bSuccess)
	{
		OutSilver = FMath::Max(1, FMath::RoundToInt(Silver * FMath::FRandRange(0.4f, 0.9f)));
		Silver -= OutSilver;
		// Unnoticed theft: still reported, but only those who can see it react (often nobody).
		FRCSocialEvent E;
		E.Kind = ERCMemoryKind::Stole; E.Victim = NAME_None; E.Location = Player->GetActorLocation(); E.Severity = 0.25f;
		if (Social) Social->ReportEvent(E);
	}
	else
	{
		Suspicion = 1.f;
		FRCSocialEvent E;
		E.Kind = ERCMemoryKind::Stole; E.Victim = NPCId; E.Location = Player->GetActorLocation(); E.Severity = 0.5f;
		if (Social) Social->ReportEvent(E);
		PushToBlackboard();
	}
	return bSuccess;
}

bool URCNPCComponent::CanBeKilled() const
{
	if (bDead) return false;
	return EssentialUntilFlag.IsNone() || (WorldState && WorldState->HasFlag(EssentialUntilFlag));
}

void URCNPCComponent::ReactToWitnessedEvent(const FRCSocialEvent& Event)
{
	if (Event.Instigator != TEXT("Player")) return;
	const bool bViolent = Event.Kind == ERCMemoryKind::Killed || Event.Kind == ERCMemoryKind::Harmed;
	Suspicion = FMath::Max(Suspicion, bViolent ? 1.f : 0.6f);
	if (bViolent) Needs.Safety = FMath::Clamp(Needs.Safety + 0.8f * (1.2f - Personality.Bravery), 0.f, 1.f);
	ChooseActivity();
	PushToBlackboard();
}

void URCNPCComponent::OnRecordedDead()
{
	bDead = true;
	CurrentActivity = NAME_None;
	SetComponentTickEnabled(false);
}
