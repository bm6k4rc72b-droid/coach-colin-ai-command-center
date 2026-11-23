// Raven's Creed: quest definitions and runtime state.
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "Dialogue/RCDialogueTypes.h"
#include "RCQuestTypes.generated.h"

UENUM(BlueprintType)
enum class ERCQuestStatus : uint8 { NotStarted, Active, Completed, Failed };

USTRUCT(BlueprintType)
struct FRCQuestStage
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	int32 Stage = 0;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	FText JournalText;

	/** Raven Sight / map markers for this stage (actor tags in the level). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	TArray<FName> MarkerTags;

	/** When all conditions pass, the quest advances to AdvanceTo automatically (driven by world-flag changes). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	TArray<FRCCondition> AdvanceWhen;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	int32 AdvanceTo = -1;
};

/** A named resolution. Its conditions are checked when the quest completes; its effects write lasting consequences. */
USTRUCT(BlueprintType)
struct FRCQuestOutcome
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	FName Outcome;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	FText Summary;

	/** If the quest completes without an explicit outcome, the first outcome whose conditions pass is used. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	TArray<FRCCondition> Conditions;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	TArray<FRCEffect> Effects;
};

UCLASS(BlueprintType)
class RAVENSCREED_API URCQuestAsset : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	FName QuestId;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	FText Title;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	TArray<FRCQuestStage> Stages;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	TArray<FRCQuestOutcome> Outcomes;

	/** Fail automatically if any of these become true (e.g. the quest giver dies). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Quest")
	TArray<FRCCondition> FailWhenAny;
};

USTRUCT(BlueprintType)
struct FRCQuestRuntime
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Quest")
	FName QuestId;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Quest")
	ERCQuestStatus Status = ERCQuestStatus::NotStarted;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Quest")
	int32 Stage = 0;

	UPROPERTY(BlueprintReadOnly, SaveGame, Category = "Quest")
	FName Outcome;
};
