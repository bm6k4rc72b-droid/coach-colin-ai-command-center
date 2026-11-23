#include "Social/RCSocialSubsystem.h"
#include "Social/RCNPCComponent.h"
#include "Core/RCSaveGame.h"
#include "Core/RCWorldStateSubsystem.h"
#include "Weather/RCWeatherSubsystem.h"
#include "RavensCreed.h"

namespace RCSocial
{
	/** Base reaction to each act when the witness is neutral to the victim: opinion, fear, trust. */
	struct FReaction { float Opinion; float Fear; float Trust; };

	FReaction BaseReaction(ERCMemoryKind Kind)
	{
		switch (Kind)
		{
		case ERCMemoryKind::Helped:         return { 10.f, 0.f, 6.f };
		case ERCMemoryKind::Gifted:         return { 8.f, 0.f, 3.f };
		case ERCMemoryKind::Spared:         return { 12.f, 4.f, 8.f };
		case ERCMemoryKind::Defended:       return { 15.f, 2.f, 10.f };
		case ERCMemoryKind::KeptOath:       return { 8.f, 0.f, 15.f };
		case ERCMemoryKind::Insulted:       return { -6.f, 0.f, -2.f };
		case ERCMemoryKind::Threatened:     return { -8.f, 12.f, -5.f };
		case ERCMemoryKind::Stole:          return { -12.f, 0.f, -15.f };
		case ERCMemoryKind::Lied:           return { -6.f, 0.f, -20.f };
		case ERCMemoryKind::BrokeOath:      return { -15.f, 4.f, -30.f };
		case ERCMemoryKind::Harmed:         return { -15.f, 15.f, -10.f };
		case ERCMemoryKind::Killed:         return { -25.f, 30.f, -15.f };
		case ERCMemoryKind::Desecrated:     return { -20.f, 8.f, -10.f };
		case ERCMemoryKind::Betrayed:       return { -35.f, 5.f, -45.f };
		case ERCMemoryKind::WitnessedCrime: return { -5.f, 5.f, -5.f };
		default:                            return { 0.f, 0.f, 0.f };
		}
	}

	bool IsHarmful(ERCMemoryKind Kind) { return BaseReaction(Kind).Opinion < 0.f; }

	/** Base sight radius in cm for an act of severity 1 in clear daylight. */
	constexpr float WitnessRadius = 3500.f;
}

void URCSocialSubsystem::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);
	WorldState = InWorld.GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>();
	Weather = InWorld.GetSubsystem<URCWeatherSubsystem>();
	if (WorldState)
	{
		WorldState->OnHourPassed.AddDynamic(this, &URCSocialSubsystem::OnHourPassed);
	}
}

void URCSocialSubsystem::RegisterNPC(URCNPCComponent* Component)
{
	if (!Component || Component->NPCId.IsNone()) return;
	const FName Id = Component->NPCId;
	if (!Records.Contains(Id))
	{
		FRCNPCRecord& Rec = Records.Add(Id);
		Rec.NPCId = Id;
		Rec.DisplayName = Component->DisplayName;
		Rec.Faction = Component->Faction;
		Rec.Personality = Component->Personality;
		Rec.Bonds = Component->DefaultBonds;
		Rec.Opinion = Component->StartingOpinion;
		Rec.HomeRegion = Component->HomeRegion;
	}
	Live.Add(Id, Component);

	// A streamed-in actor for someone who died while it was unloaded must not walk around.
	if (!Records[Id].bAlive)
	{
		Component->OnRecordedDead();
	}
}

void URCSocialSubsystem::UnregisterNPC(URCNPCComponent* Component)
{
	if (Component) Live.Remove(Component->NPCId);
}

FRCNPCRecord* URCSocialSubsystem::FindRecord(FName NPCId) { return Records.Find(NPCId); }
const FRCNPCRecord* URCSocialSubsystem::FindRecord(FName NPCId) const { return Records.Find(NPCId); }

bool URCSocialSubsystem::GetRecord(FName NPCId, FRCNPCRecord& Out) const
{
	if (const FRCNPCRecord* R = FindRecord(NPCId)) { Out = *R; return true; }
	return false;
}

bool URCSocialSubsystem::IsAlive(FName NPCId) const
{
	const FRCNPCRecord* R = FindRecord(NPCId);
	return R ? R->bAlive : true; // unknown NPCs have not been met, so they are alive
}

ERCDisposition URCSocialSubsystem::GetDisposition(FName NPCId) const
{
	const FRCNPCRecord* R = FindRecord(NPCId);
	if (!R) return ERCDisposition::Neutral;
	// Fear makes people civil but not friendly; very high fear with low opinion is still hostile.
	const float Score = R->Opinion + 0.15f * R->Fear;
	if (R->Opinion < -50.f) return ERCDisposition::Hostile;
	if (Score < -15.f) return ERCDisposition::Wary;
	if (Score < 25.f) return ERCDisposition::Neutral;
	if (Score < 65.f) return ERCDisposition::Friendly;
	return ERCDisposition::Devoted;
}

bool URCSocialSubsystem::Remembers(FName NPCId, ERCMemoryKind Kind, FName Victim) const
{
	if (const FRCNPCRecord* R = FindRecord(NPCId))
	{
		for (const FRCMemory& M : R->Memories)
		{
			if (M.Kind == Kind && M.Instigator == TEXT("Player") && (Victim.IsNone() || M.Victim == Victim) && M.Intensity > 0.1f) return true;
		}
	}
	return false;
}

bool URCSocialSubsystem::CanSee(const URCNPCComponent* Witness, const FVector& Location, float Range) const
{
	const AActor* Owner = Witness ? Witness->GetOwner() : nullptr;
	if (!Owner || !Witness->IsAwake()) return false;
	const FVector Eye = Owner->GetActorLocation() + FVector(0, 0, 70);
	if (FVector::DistSquared(Eye, Location) > FMath::Square(Range)) return false;

	// Wide but not 360-degree awareness: behind-the-back acts are only heard at close range.
	const FVector To = (Location - Eye).GetSafeNormal();
	const bool bInView = FVector::DotProduct(Owner->GetActorForwardVector(), To) > -0.2f;
	if (!bInView && FVector::DistSquared(Eye, Location) > FMath::Square(400.f)) return false;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(RCWitness), false, Owner);
	return !GetWorld()->LineTraceTestByChannel(Eye, Location + FVector(0, 0, 50), ECC_Visibility, Params);
}

int32 URCSocialSubsystem::ReportEvent(const FRCSocialEvent& Event)
{
	const FName EventId(*FString::Printf(TEXT("EV_%d_%d"), WorldState ? WorldState->GetDay() : 0, ++EventCounter));
	const float Visibility = Weather ? Weather->GetVisibilityMultiplier() : 1.f;
	const float Noise = Weather ? Weather->GetNoiseMultiplier() : 1.f;
	// Violent acts are loud; quiet acts (theft, lies) rely on sight.
	const bool bLoud = Event.Kind == ERCMemoryKind::Killed || Event.Kind == ERCMemoryKind::Harmed;
	const float Range = RCSocial::WitnessRadius * FMath::Lerp(0.3f, 1.f, Event.Severity) * (bLoud ? FMath::Max(Visibility, Noise) : Visibility);

	int32 Witnesses = 0;
	TArray<FName> Seen = Event.GuaranteedWitnesses;
	for (const TPair<FName, TWeakObjectPtr<URCNPCComponent>>& Pair : Live)
	{
		if (Pair.Key == Event.Victim || Pair.Key == Event.Instigator || Seen.Contains(Pair.Key)) continue;
		if (CanSee(Pair.Value.Get(), Event.Location, Range)) Seen.Add(Pair.Key);
	}

	for (const FName& WitnessId : Seen)
	{
		FRCNPCRecord* Rec = FindRecord(WitnessId);
		if (!Rec || !Rec->bAlive) continue;
		FRCMemory M;
		M.EventId = EventId;
		M.Kind = Event.Kind;
		M.Instigator = Event.Instigator;
		M.Victim = Event.Victim;
		M.Day = WorldState ? WorldState->GetDay() : 0;
		M.Intensity = FMath::Clamp(0.4f + 0.6f * Event.Severity, 0.f, 1.f);
		M.bFirstHand = true;
		AddMemory(*Rec, M);
		ApplyMemoryToAttitude(*Rec, M, BondStrength(*Rec, Event.Victim));
		if (URCNPCComponent* C = Live.FindRef(WitnessId).Get()) C->ReactToWitnessedEvent(Event);
		++Witnesses;
	}

	// The victim always remembers what was done to them.
	if (FRCNPCRecord* Victim = FindRecord(Event.Victim))
	{
		if (Victim->bAlive)
		{
			FRCMemory M;
			M.EventId = EventId; M.Kind = Event.Kind; M.Instigator = Event.Instigator; M.Victim = Event.Victim;
			M.Day = WorldState ? WorldState->GetDay() : 0; M.Intensity = 1.f;
			AddMemory(*Victim, M);
			ApplyMemoryToAttitude(*Victim, M, 1.f);
		}
		// Faction-level consequences for harm against members.
		if (RCSocial::IsHarmful(Event.Kind) && Event.Instigator == TEXT("Player"))
		{
			ModifyFactionReputation(Victim->Faction, RCSocial::BaseReaction(Event.Kind).Opinion * (Witnesses > 0 ? 0.5f : 0.1f));
		}
	}
	return Witnesses;
}

void URCSocialSubsystem::AddMemory(FRCNPCRecord& Rec, const FRCMemory& Memory)
{
	for (const FRCMemory& Existing : Rec.Memories)
	{
		if (Existing.EventId == Memory.EventId) return;
	}
	Rec.Memories.Add(Memory);
	if (Rec.Memories.Num() > MaxMemories)
	{
		Rec.Memories.Sort([](const FRCMemory& A, const FRCMemory& B) { return A.Intensity > B.Intensity; });
		Rec.Memories.SetNum(MaxMemories);
	}
	OnMemoryAdded.Broadcast(Rec.NPCId, Memory);
}

float URCSocialSubsystem::BondStrength(const FRCNPCRecord& From, FName To) const
{
	if (To.IsNone()) return 0.f;
	if (To == From.NPCId) return 1.f;
	for (const FRCBond& B : From.Bonds)
	{
		if (B.Other == To) return B.Strength;
	}
	// Same faction members care a little about each other.
	const FRCNPCRecord* Other = FindRecord(To);
	return (Other && Other->Faction == From.Faction) ? 0.15f : 0.f;
}

void URCSocialSubsystem::ApplyMemoryToAttitude(FRCNPCRecord& Rec, const FRCMemory& Memory, float BondToVictim)
{
	if (Memory.Instigator != TEXT("Player")) return;
	RCSocial::FReaction R = RCSocial::BaseReaction(Memory.Kind);

	// Harm to someone they hate pleases them; harm to someone they love enrages them.
	if (RCSocial::IsHarmful(Memory.Kind) && !Memory.Victim.IsNone())
	{
		const float Care = BondToVictim;
		R.Opinion *= Care >= 0.f ? (0.5f + Care * 1.5f) : Care * 1.2f; // negative bond flips the sign
		// Moral NPCs judge more harshly regardless of bond; greedy ones shrug at theft.
		R.Opinion *= 0.6f + 0.8f * Rec.Personality.Morality;
		if (Memory.Kind == ERCMemoryKind::Stole) R.Opinion *= 1.2f - Rec.Personality.Greed;
		if (Memory.Kind == ERCMemoryKind::Desecrated) R.Opinion *= 0.4f + 1.2f * Rec.Personality.Piety;
		R.Fear *= 1.3f - Rec.Personality.Bravery;
	}
	const float Scale = Memory.Intensity * (Memory.bFirstHand ? 1.f : 0.6f);
	Rec.Opinion = FMath::Clamp(Rec.Opinion + R.Opinion * Scale, -100.f, 100.f);
	Rec.Fear = FMath::Clamp(Rec.Fear + R.Fear * Scale, 0.f, 100.f);
	Rec.Trust = FMath::Clamp(Rec.Trust + R.Trust * Scale, 0.f, 100.f);
}

void URCSocialSubsystem::ModifyAttitude(FName NPCId, float OpinionDelta, float FearDelta, float TrustDelta)
{
	if (FRCNPCRecord* R = FindRecord(NPCId))
	{
		R->Opinion = FMath::Clamp(R->Opinion + OpinionDelta, -100.f, 100.f);
		R->Fear = FMath::Clamp(R->Fear + FearDelta, 0.f, 100.f);
		R->Trust = FMath::Clamp(R->Trust + TrustDelta, 0.f, 100.f);
	}
}

void URCSocialSubsystem::NotifyNPCKilled(FName Victim, FName Killer, bool bWitnessed)
{
	FRCNPCRecord* Rec = FindRecord(Victim);
	if (!Rec || !Rec->bAlive) return;
	Rec->bAlive = false;
	Rec->KilledBy = Killer;

	if (WorldState)
	{
		WorldState->SetFlag(FName(*FString::Printf(TEXT("DEAD_%s"), *Victim.ToString())), 1, TEXT("Social"));
		if (Killer == TEXT("Player"))
		{
			WorldState->SetFlag(FName(*FString::Printf(TEXT("KILLED_BY_PLAYER_%s"), *Victim.ToString())), 1, TEXT("Social"));
		}
	}

	// Ripples: kin and close friends learn of the death within the day even if unwitnessed (bodies are found).
	// They learn who did it only if someone saw it; otherwise suspicion falls on the player's faction rep later.
	for (TPair<FName, FRCNPCRecord>& Pair : Records)
	{
		FRCNPCRecord& Other = Pair.Value;
		if (!Other.bAlive || Other.NPCId == Victim) continue;
		const float Bond = BondStrength(Other, Victim);
		if (Bond < 0.5f) continue;

		FRCMemory M;
		M.EventId = FName(*FString::Printf(TEXT("DEATH_%s"), *Victim.ToString()));
		M.Kind = ERCMemoryKind::Killed;
		M.Instigator = bWitnessed ? Killer : NAME_None;
		M.Victim = Victim;
		M.Day = WorldState ? WorldState->GetDay() : 0;
		M.Intensity = Bond;
		M.bFirstHand = false;
		AddMemory(Other, M);
		ApplyMemoryToAttitude(Other, M, Bond);

		// Blood feud: kin who know the killer may seek vengeance (quests and ambush encounters read this flag).
		if (bWitnessed && Killer == TEXT("Player") && Other.Personality.Bravery > 0.4f && WorldState)
		{
			WorldState->SetFlag(FName(*FString::Printf(TEXT("VENGEANCE_%s"), *Other.NPCId.ToString())), 1, TEXT("Social"));
		}
	}
	if (URCNPCComponent* C = Live.FindRef(Victim).Get()) C->OnRecordedDead();
	OnNPCDied.Broadcast(Victim, Killer);
}

void URCSocialSubsystem::SetRecruited(FName NPCId, bool bRecruited)
{
	if (FRCNPCRecord* R = FindRecord(NPCId)) R->bRecruited = bRecruited;
}

float URCSocialSubsystem::GetFactionReputation(FName Faction) const
{
	return FactionRep.FindRef(Faction);
}

void URCSocialSubsystem::ModifyFactionReputation(FName Faction, float Delta)
{
	if (Faction.IsNone()) return;
	float& Rep = FactionRep.FindOrAdd(Faction);
	Rep = FMath::Clamp(Rep + Delta, -100.f, 100.f);
	if (WorldState) WorldState->SetFlag(FName(*FString::Printf(TEXT("REP_%s"), *Faction.ToString())), FMath::RoundToInt(Rep), TEXT("Social"));
}

void URCSocialSubsystem::OnHourPassed(int32 Day, float Hour)
{
	SpreadRumours();
	if (FMath::FloorToInt(Hour) == 4) DecayMemories(); // overnight forgetting
}

void URCSocialSubsystem::SpreadRumours()
{
	// Each NPC with a strong, unshared memory about the player tells bonded NPCs; gossips tell more people.
	// Runs on records, not actors, so news travels between towns even when nobody is loaded.
	TArray<TPair<FName, FRCMemory>> Outgoing;
	for (TPair<FName, FRCNPCRecord>& Pair : Records)
	{
		FRCNPCRecord& Teller = Pair.Value;
		if (!Teller.bAlive) continue;
		for (FRCMemory& M : Teller.Memories)
		{
			if (M.bShared || M.Intensity < 0.35f || M.Instigator != TEXT("Player")) continue;
			for (const FRCBond& B : Teller.Bonds)
			{
				const float Chance = FMath::Clamp(0.25f + 0.6f * Teller.Personality.Gossip, 0.f, 1.f) * FMath::Abs(B.Strength);
				if (FMath::FRand() > Chance) continue;
				FRCMemory Rumour = M;
				Rumour.bFirstHand = false;
				Rumour.bShared = false;
				Rumour.Intensity = M.Intensity * 0.6f;
				// Embellishment: an enemy tells it worse.
				if (B.Strength < 0.f && RCSocial::IsHarmful(M.Kind)) Rumour.Intensity = FMath::Min(1.f, Rumour.Intensity * 1.4f);
				Outgoing.Emplace(B.Other, Rumour);
			}
			M.bShared = true;
		}
	}
	for (const TPair<FName, FRCMemory>& O : Outgoing)
	{
		if (FRCNPCRecord* Listener = FindRecord(O.Key))
		{
			if (!Listener->bAlive) continue;
			const int32 Before = Listener->Memories.Num();
			AddMemory(*Listener, O.Value);
			if (Listener->Memories.Num() != Before) ApplyMemoryToAttitude(*Listener, O.Value, BondStrength(*Listener, O.Value.Victim));
		}
	}
}

void URCSocialSubsystem::DecayMemories()
{
	for (TPair<FName, FRCNPCRecord>& Pair : Records)
	{
		for (FRCMemory& M : Pair.Value.Memories)
		{
			// Killings and betrayals are never really forgotten; small slights fade within days.
			const bool bGrave = M.Kind == ERCMemoryKind::Killed || M.Kind == ERCMemoryKind::Betrayed || M.Kind == ERCMemoryKind::BrokeOath;
			M.Intensity = FMath::Max(bGrave ? 0.3f : 0.f, M.Intensity * (bGrave ? 0.98f : 0.85f));
		}
		Pair.Value.Memories.RemoveAll([](const FRCMemory& M) { return M.Intensity < 0.05f; });
	}
}

void URCSocialSubsystem::WriteToSave(URCSaveGame& Save) const
{
	Save.NPCs.Reset(Records.Num());
	for (const TPair<FName, FRCNPCRecord>& Pair : Records) Save.NPCs.Add(Pair.Value);
	Save.FactionReputation = FactionRep;
}

void URCSocialSubsystem::ReadFromSave(const URCSaveGame& Save)
{
	Records.Reset();
	for (const FRCNPCRecord& R : Save.NPCs) Records.Add(R.NPCId, R);
	FactionRep = Save.FactionReputation;
	for (const TPair<FName, TWeakObjectPtr<URCNPCComponent>>& Pair : Live)
	{
		const FRCNPCRecord* R = FindRecord(Pair.Key);
		if (R && !R->bAlive && Pair.Value.IsValid()) Pair.Value->OnRecordedDead();
	}
}
