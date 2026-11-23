// Raven's Creed: quest state machine driven by world flags.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Core/RCTypes.h"
#include "Quest/RCQuestTypes.h"
#include "RCQuestSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FRCOnQuestUpdated, FName, QuestId, ERCQuestStatus, Status, int32, Stage);

UCLASS()
class RAVENSCREED_API URCQuestSubsystem : public UWorldSubsystem, public IRCSaveable
{
	GENERATED_BODY()

public:
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;

	/** Quest assets are registered by a level/startup asset list (or the asset manager scan of /Game/Quests). */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void RegisterQuest(URCQuestAsset* Quest);

	UFUNCTION(BlueprintCallable, Category = "Quest")
	void StartQuest(FName QuestId);

	UFUNCTION(BlueprintCallable, Category = "Quest")
	void SetStage(FName QuestId, int32 Stage);

	/** Outcome None = pick the first outcome whose conditions pass. */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void CompleteQuest(FName QuestId, FName Outcome);

	UFUNCTION(BlueprintCallable, Category = "Quest")
	void FailQuest(FName QuestId);

	UFUNCTION(BlueprintPure, Category = "Quest")
	FRCQuestRuntime GetQuest(FName QuestId) const;

	UPROPERTY(BlueprintAssignable, Category = "Quest")
	FRCOnQuestUpdated OnQuestUpdated;

	virtual void WriteToSave(URCSaveGame& Save) const override;
	virtual void ReadFromSave(const URCSaveGame& Save) override;

private:
	UFUNCTION()
	void OnFlagChanged(FName Flag, int32 OldValue, int32 NewValue);
	void Reevaluate(FName QuestId);

	UPROPERTY()
	TMap<FName, TObjectPtr<URCQuestAsset>> Definitions;

	TMap<FName, FRCQuestRuntime> Runtime;
	bool bReevaluating = false;
};
