// Raven's Creed: branching dialogue graph data. Authored in the editor or imported from JSON (see Content/Data/Dialogue).
#pragma once

#include "CoreMinimal.h"
#include "Core/RCTypes.h"
#include "Social/RCSocialTypes.h"
#include "Weather/RCWeatherTypes.h"
#include "RCDialogueTypes.generated.h"

UENUM(BlueprintType)
enum class ERCConditionType : uint8
{
	FlagAtLeast,        // Flags[Key] >= Value
	FlagBelow,          // Flags[Key] < Value
	AlignmentAtLeast,   // Alignment[Axis] >= Value
	AlignmentBelow,     // Alignment[Axis] < Value
	OpinionAtLeast,     // NPC (Key or current) opinion >= Value
	NPCAlive,           // NPC Key is alive
	NPCDead,            // NPC Key is dead
	Remembers,          // NPC (current) remembers Memory done by the player
	WeatherIs,          // current weather == Weather
	IsNight,
	CompanionIs,        // Flags["COMPANION_<Key>"] == (int)Companion
	SilverAtLeast       // Flags["SILVER"] >= Value
};

USTRUCT(BlueprintType)
struct FRCCondition
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Condition")
	ERCConditionType Type = ERCConditionType::FlagAtLeast;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Condition")
	FName Key;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Condition")
	float Value = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Condition")
	ERCAlignmentAxis Axis = ERCAlignmentAxis::Honor;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Condition")
	ERCMemoryKind Memory = ERCMemoryKind::Helped;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Condition")
	ERCWeatherType Weather = ERCWeatherType::Clear;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Condition")
	ERCCompanionState Companion = ERCCompanionState::Recruited;

	/** Inverts the result. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Condition")
	bool bNot = false;
};

UENUM(BlueprintType)
enum class ERCEffectType : uint8
{
	SetFlag,            // Flags[Key] = Value
	AddFlag,            // Flags[Key] += Value
	Alignment,          // Alignment[Axis] += Value
	Opinion,            // NPC (Key or current) opinion += Value
	Fear,               // NPC fear += Value
	Trust,              // NPC trust += Value
	Remember,           // NPC (Key or current) remembers Memory, victim = Victim
	FactionRep,         // Reputation[Key] += Value
	CompanionApproval,  // Flags["APPROVAL_<Key>"] += Value (companion must be present)
	SetCompanion,       // Flags["COMPANION_<Key>"] = (int)Companion
	StartQuest,         // quest Key
	SetQuestStage,      // quest Key -> stage Value
	CompleteQuest,      // quest Key, outcome Victim (as the outcome name)
	Silver,             // Flags["SILVER"] += Value
	Event,              // broadcast OnDialogueEvent(Key): cinematics, combat start, scripted kills
	Weather             // request weather type (omens, a völva's call)
};

USTRUCT(BlueprintType)
struct FRCEffect
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Effect")
	ERCEffectType Type = ERCEffectType::SetFlag;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Effect")
	FName Key;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Effect")
	float Value = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Effect")
	ERCAlignmentAxis Axis = ERCAlignmentAxis::Honor;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Effect")
	ERCMemoryKind Memory = ERCMemoryKind::Helped;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Effect")
	FName Victim;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Effect")
	ERCCompanionState Companion = ERCCompanionState::Recruited;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Effect")
	ERCWeatherType Weather = ERCWeatherType::Clear;
};

/** Tone tags drive the dialogue wheel icon (Oath, Shadow, Rune, Crown) and voice delivery. */
UENUM(BlueprintType)
enum class ERCTone : uint8 { Neutral, Oath, Shadow, Rune, Crown, Threat };

USTRUCT(BlueprintType)
struct FRCDialogueChoice
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FText Text;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	ERCTone Tone = ERCTone::Neutral;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FName Next;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	TArray<FRCCondition> Conditions;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	TArray<FRCEffect> Effects;

	/** Shown greyed with RequirementHint when conditions fail, so players see the road not taken. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	bool bShowWhenLocked = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FText RequirementHint;

	/** Point of no return: raven-feather icon in the UI. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	bool bPointOfNoReturn = false;
};

USTRUCT(BlueprintType)
struct FRCDialogueNode
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FName Id;

	/** "NPC" = the conversation owner, "Player" = Bjorn, or a specific NPC/companion id. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FName Speaker = TEXT("NPC");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue", meta = (MultiLine = true))
	FText Line;

	/** Voice hook: the localisation/VO pipeline keys recordings by this id (defaults to <Graph>.<Node>). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FName VoiceLineId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	TSoftObjectPtr<USoundBase> Voice;

	/** Facial/body animation cue for the conversation camera (e.g. "Grim", "Laugh", "LeanIn"). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FName Emote;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	TArray<FRCEffect> OnEnter;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	TArray<FRCDialogueChoice> Choices;

	/** Used when there are no choices: continue automatically. None = end of conversation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FName Next;
};

/** An entry point picked by conditions, so the same NPC greets you differently after you killed their brother. */
USTRUCT(BlueprintType)
struct FRCDialogueEntry
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FName Node;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	TArray<FRCCondition> Conditions;
};

USTRUCT(BlueprintType)
struct FRCDialogueGraph
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	FName Id;

	/** Checked in order; the first entry whose conditions pass starts the conversation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	TArray<FRCDialogueEntry> Entries;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	TArray<FRCDialogueNode> Nodes;
};
