// Raven's Creed: runs conversations, evaluates conditions, applies consequences, fires voice and UI hooks.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Dialogue/RCDialogueTypes.h"
#include "RCDialogueManager.generated.h"

class URCDialogueAsset;

USTRUCT(BlueprintType)
struct FRCDialogueLineEvent
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") FName NodeId;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") FName Speaker;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") FText SpeakerName;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") FText Line;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") FName VoiceLineId;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") TSoftObjectPtr<USoundBase> Voice;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") FName Emote;
};

USTRUCT(BlueprintType)
struct FRCChoiceView
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") int32 Index = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") FText Text;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") ERCTone Tone = ERCTone::Neutral;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") bool bAvailable = true;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") FText RequirementHint;
	UPROPERTY(BlueprintReadOnly, Category = "Dialogue") bool bPointOfNoReturn = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FRCOnDialogueLine, const FRCDialogueLineEvent&, Line);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FRCOnDialogueChoices, const TArray<FRCChoiceView>&, Choices);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FRCOnDialogueEvent, FName, EventName);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FRCOnDialogueEnded);

UCLASS()
class RAVENSCREED_API URCDialogueManager : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	/** Starts a conversation with an NPC. Picks the first entry whose conditions pass. */
	UFUNCTION(BlueprintCallable, Category = "Dialogue")
	bool StartDialogue(URCDialogueAsset* Asset, FName NPCId, APawn* Player);

	/** Continue a node without choices (UI "next" button or voice line finished). */
	UFUNCTION(BlueprintCallable, Category = "Dialogue")
	void Advance();

	/** Index into the views from OnChoices. Locked choices are ignored. */
	UFUNCTION(BlueprintCallable, Category = "Dialogue")
	void SelectChoice(int32 Index);

	UFUNCTION(BlueprintCallable, Category = "Dialogue")
	void EndDialogue();

	UFUNCTION(BlueprintPure, Category = "Dialogue")
	bool IsInDialogue() const { return Asset != nullptr; }

	/** Shared with quests and AI: evaluate any condition list in the context of an NPC. */
	bool EvaluateAll(const TArray<FRCCondition>& Conditions, FName NPCId) const;
	void ApplyAll(const TArray<FRCEffect>& Effects, FName NPCId, FName Source);

	UPROPERTY(BlueprintAssignable, Category = "Dialogue")
	FRCOnDialogueLine OnLine;

	UPROPERTY(BlueprintAssignable, Category = "Dialogue")
	FRCOnDialogueChoices OnChoices;

	/** Scripted beats requested by a node or choice (cinematic, fight, poison swap). */
	UPROPERTY(BlueprintAssignable, Category = "Dialogue")
	FRCOnDialogueEvent OnDialogueEvent;

	UPROPERTY(BlueprintAssignable, Category = "Dialogue")
	FRCOnDialogueEnded OnEnded;

	/** Play the node's voice asset automatically (turn off when a VO middleware handles VoiceLineId). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Dialogue")
	bool bAutoPlayVoice = true;

private:
	void EnterNode(FName NodeId);
	bool Evaluate(const FRCCondition& C, FName NPCId) const;
	void Apply(const FRCEffect& E, FName NPCId, FName Source);
	FName ResolveNPC(FName Key, FName Fallback) const { return Key.IsNone() ? Fallback : Key; }

	UPROPERTY()
	TObjectPtr<URCDialogueAsset> Asset;

	UPROPERTY()
	TObjectPtr<APawn> PlayerPawn;

	FName CurrentNPC;
	FName CurrentNode;
	TArray<int32> VisibleChoiceMap; // view index -> node choice index
};
