// Raven's Creed: social simulation data. Every named NPC persists as an FRCNPCRecord, alive or dead.
#pragma once

#include "CoreMinimal.h"
#include "RCSocialTypes.generated.h"

/** The kinds of acts NPCs remember. Each maps to opinion/fear/trust deltas tuned in URCSocialSubsystem. */
UENUM(BlueprintType)
enum class ERCMemoryKind : uint8
{
	Helped, Gifted, Spared, Defended, KeptOath,
	Insulted, Threatened, Stole, Lied, BrokeOath, Harmed, Killed, Desecrated, Betrayed,
	WitnessedCrime
};

UENUM(BlueprintType)
enum class ERCDisposition : uint8 { Hostile, Wary, Neutral, Friendly, Devoted };

/** Bond types between NPCs: how much one cares what happens to the other. */
UENUM(BlueprintType)
enum class ERCBondType : uint8 { Kin, Spouse, Friend, Lord, Sworn, Rival, Enemy };

USTRUCT(BlueprintType)
struct FRCBond
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social")
	FName Other;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social")
	ERCBondType Type = ERCBondType::Friend;

	/** -1 (hates) .. 1 (would die for). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social", meta = (ClampMin = -1, ClampMax = 1))
	float Strength = 0.5f;
};

USTRUCT(BlueprintType)
struct FRCMemory
{
	GENERATED_BODY()

	/** Unique per event so the same rumour is not stored twice. */
	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	FName EventId;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	ERCMemoryKind Kind = ERCMemoryKind::Helped;

	/** Who did it ("Player" for Bjorn). */
	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	FName Instigator;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	FName Victim;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	int32 Day = 0;

	/** 0..1. Decays over time; rumours start weaker than first-hand memories. */
	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	float Intensity = 1.f;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	bool bFirstHand = true;

	/** Already passed on as a rumour this cycle. */
	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	bool bShared = false;
};

/** Personality traits, 0..1. They weight reactions, rumour spreading and AI utility scores. */
USTRUCT(BlueprintType)
struct FRCPersonality
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social") float Bravery = 0.5f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social") float Greed = 0.3f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social") float Morality = 0.6f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social") float Gossip = 0.5f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social") float Piety = 0.5f;
};

/** The persistent record for one named NPC. Lives in the social subsystem even when the actor is streamed out or dead. */
USTRUCT(BlueprintType)
struct FRCNPCRecord
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social")
	FName NPCId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social")
	FText DisplayName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social")
	FName Faction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social")
	FRCPersonality Personality;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Social")
	TArray<FRCBond> Bonds;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	bool bAlive = true;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	FName KilledBy;

	/** -100..100: how much they like Bjorn. */
	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	float Opinion = 0.f;

	/** 0..100: how much they fear Bjorn (raises compliance, lowers trust). */
	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	float Fear = 0.f;

	/** 0..100: whether they believe what Bjorn says (persuasion, lies). */
	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	float Trust = 30.f;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	TArray<FRCMemory> Memories;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	bool bRecruited = false;

	/** Where they live now (settlements adopt NPCs; mourners may move away). */
	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Social")
	FName HomeRegion;
};

/** Something happened that NPCs could notice. Reported by combat, dialogue, theft, quests. */
USTRUCT(BlueprintType)
struct FRCSocialEvent
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Social")
	ERCMemoryKind Kind = ERCMemoryKind::Helped;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Social")
	FName Instigator = TEXT("Player");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Social")
	FName Victim;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Social")
	FVector Location = FVector::ZeroVector;

	/** 0..1: a shove is 0.1, a public murder 1. Scales witness radius and reactions. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Social")
	float Severity = 0.5f;

	/** Dialogue acts are heard by the people in the conversation regardless of line of sight. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Social")
	TArray<FName> GuaranteedWitnesses;
};
