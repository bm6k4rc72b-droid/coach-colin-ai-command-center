#include "Player/RCRavenSightComponent.h"
#include "Social/RCNPCComponent.h"
#include "Social/RCSocialSubsystem.h"
#include "Weather/RCWeatherSubsystem.h"
#include "Engine/OverlapResult.h"
#include "Components/PrimitiveComponent.h"

URCRavenSightComponent::URCRavenSightComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.1f;
}

ERCSightMark URCRavenSightComponent::Classify(const AActor* Actor) const
{
	if (Actor->ActorHasTag(TEXT("QuestTarget"))) return ERCSightMark::Target;
	if (Actor->ActorHasTag(TEXT("Loot"))) return ERCSightMark::Loot;
	if (Actor->ActorHasTag(TEXT("Clue"))) return ERCSightMark::Clue;
	if (const URCNPCComponent* NPC = Actor->FindComponentByClass<URCNPCComponent>())
	{
		if (NPC->IsDead()) return ERCSightMark::Clue;
		const URCSocialSubsystem* Social = GetWorld()->GetSubsystem<URCSocialSubsystem>();
		const ERCDisposition D = Social ? Social->GetDisposition(NPC->NPCId) : ERCDisposition::Neutral;
		if (D == ERCDisposition::Hostile || NPC->Faction == TEXT("GullbrandCircle")) return ERCSightMark::Threat;
		if (D >= ERCDisposition::Friendly) return ERCSightMark::Ally;
	}
	return ERCSightMark::None;
}

void URCRavenSightComponent::Pulse()
{
	if (CooldownTimer > 0.f) return;
	ClearMarks();

	const URCWeatherSubsystem* Weather = GetWorld()->GetSubsystem<URCWeatherSubsystem>();
	const float Visibility = Weather ? Weather->GetVisibilityMultiplier() : 1.f;
	const float Radius = BaseRadius * FMath::Lerp(Visibility, 1.f, FogPiercing);

	TArray<FOverlapResult> Overlaps;
	FCollisionObjectQueryParams Objects;
	Objects.AddObjectTypesToQuery(ECC_Pawn);
	Objects.AddObjectTypesToQuery(ECC_WorldDynamic);
	GetWorld()->OverlapMultiByObjectType(Overlaps, GetOwner()->GetActorLocation(), FQuat::Identity, Objects, FCollisionShape::MakeSphere(Radius));

	for (const FOverlapResult& O : Overlaps)
	{
		AActor* A = O.GetActor();
		if (!A || A == GetOwner()) continue;
		const ERCSightMark Mark = Classify(A);
		if (Mark == ERCSightMark::None) continue;
		TArray<UPrimitiveComponent*> Prims;
		A->GetComponents<UPrimitiveComponent>(Prims);
		for (UPrimitiveComponent* P : Prims)
		{
			if (!P->IsVisible()) continue;
			P->SetRenderCustomDepth(true);
			P->SetCustomDepthStencilValue(static_cast<int32>(Mark));
			Marked.Add(P);
		}
	}
	ActiveTimer = Duration;
	CooldownTimer = Cooldown + Duration;
	OnPulse.Broadcast(Radius);
}

void URCRavenSightComponent::ClearMarks()
{
	for (const TWeakObjectPtr<UPrimitiveComponent>& P : Marked)
	{
		if (P.IsValid())
		{
			P->SetRenderCustomDepth(false);
			P->SetCustomDepthStencilValue(0);
		}
	}
	Marked.Reset();
}

void URCRavenSightComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	CooldownTimer = FMath::Max(0.f, CooldownTimer - DeltaTime);
	if (ActiveTimer > 0.f)
	{
		ActiveTimer -= DeltaTime;
		if (ActiveTimer <= 0.f) ClearMarks();
	}
}
