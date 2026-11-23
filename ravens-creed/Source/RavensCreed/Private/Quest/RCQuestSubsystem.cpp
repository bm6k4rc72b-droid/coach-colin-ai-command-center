#include "Quest/RCQuestSubsystem.h"
#include "Core/RCSaveGame.h"
#include "Core/RCWorldStateSubsystem.h"
#include "Dialogue/RCDialogueManager.h"
#include "RavensCreed.h"

void URCQuestSubsystem::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);
	if (URCWorldStateSubsystem* World = InWorld.GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>())
	{
		World->OnFlagChanged.AddDynamic(this, &URCQuestSubsystem::OnFlagChanged);
	}
}

void URCQuestSubsystem::RegisterQuest(URCQuestAsset* Quest)
{
	if (Quest && !Quest->QuestId.IsNone()) Definitions.Add(Quest->QuestId, Quest);
}

void URCQuestSubsystem::StartQuest(FName QuestId)
{
	FRCQuestRuntime& Q = Runtime.FindOrAdd(QuestId);
	if (Q.Status != ERCQuestStatus::NotStarted) return;
	Q.QuestId = QuestId;
	Q.Status = ERCQuestStatus::Active;
	Q.Stage = 0;
	if (URCWorldStateSubsystem* World = GetWorld()->GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>())
	{
		World->SetFlag(FName(*FString::Printf(TEXT("QUEST_%s"), *QuestId.ToString())), 1, QuestId);
	}
	OnQuestUpdated.Broadcast(QuestId, Q.Status, Q.Stage);
	Reevaluate(QuestId);
}

void URCQuestSubsystem::SetStage(FName QuestId, int32 Stage)
{
	FRCQuestRuntime* Q = Runtime.Find(QuestId);
	if (!Q || Q->Status != ERCQuestStatus::Active || Q->Stage == Stage) return;
	Q->Stage = Stage;
	if (URCWorldStateSubsystem* World = GetWorld()->GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>())
	{
		World->SetFlag(FName(*FString::Printf(TEXT("QUEST_%s_STAGE"), *QuestId.ToString())), Stage, QuestId);
	}
	OnQuestUpdated.Broadcast(QuestId, Q->Status, Q->Stage);
	Reevaluate(QuestId);
}

void URCQuestSubsystem::CompleteQuest(FName QuestId, FName Outcome)
{
	FRCQuestRuntime* Q = Runtime.Find(QuestId);
	if (!Q || Q->Status != ERCQuestStatus::Active) return;
	URCDialogueManager* Rules = GetWorld()->GetSubsystem<URCDialogueManager>();
	const URCQuestAsset* Def = Definitions.FindRef(QuestId);

	const FRCQuestOutcome* Chosen = nullptr;
	if (Def)
	{
		for (const FRCQuestOutcome& O : Def->Outcomes)
		{
			if ((!Outcome.IsNone() && O.Outcome == Outcome) || (Outcome.IsNone() && Rules && Rules->EvaluateAll(O.Conditions, NAME_None)))
			{
				Chosen = &O;
				break;
			}
		}
	}
	Q->Status = ERCQuestStatus::Completed;
	Q->Outcome = Chosen ? Chosen->Outcome : Outcome;
	if (Chosen && Rules) Rules->ApplyAll(Chosen->Effects, NAME_None, QuestId);
	if (URCWorldStateSubsystem* World = GetWorld()->GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>())
	{
		World->SetFlag(FName(*FString::Printf(TEXT("QUEST_%s"), *QuestId.ToString())), 2, QuestId);
		World->SetFlag(FName(*FString::Printf(TEXT("OUTCOME_%s_%s"), *QuestId.ToString(), *Q->Outcome.ToString())), 1, QuestId);
	}
	OnQuestUpdated.Broadcast(QuestId, Q->Status, Q->Stage);
}

void URCQuestSubsystem::FailQuest(FName QuestId)
{
	FRCQuestRuntime* Q = Runtime.Find(QuestId);
	if (!Q || Q->Status != ERCQuestStatus::Active) return;
	Q->Status = ERCQuestStatus::Failed;
	if (URCWorldStateSubsystem* World = GetWorld()->GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>())
	{
		World->SetFlag(FName(*FString::Printf(TEXT("QUEST_%s"), *QuestId.ToString())), 3, QuestId);
	}
	OnQuestUpdated.Broadcast(QuestId, Q->Status, Q->Stage);
}

FRCQuestRuntime URCQuestSubsystem::GetQuest(FName QuestId) const
{
	return Runtime.FindRef(QuestId);
}

void URCQuestSubsystem::OnFlagChanged(FName Flag, int32 OldValue, int32 NewValue)
{
	if (bReevaluating) return; // stage changes write flags; avoid recursion
	TArray<FName> Active;
	for (const TPair<FName, FRCQuestRuntime>& P : Runtime) if (P.Value.Status == ERCQuestStatus::Active) Active.Add(P.Key);
	for (const FName& Id : Active) Reevaluate(Id);
}

void URCQuestSubsystem::Reevaluate(FName QuestId)
{
	const URCQuestAsset* Def = Definitions.FindRef(QuestId);
	FRCQuestRuntime* Q = Runtime.Find(QuestId);
	URCDialogueManager* Rules = GetWorld()->GetSubsystem<URCDialogueManager>();
	if (!Def || !Q || !Rules || Q->Status != ERCQuestStatus::Active) return;

	TGuardValue<bool> Guard(bReevaluating, true);
	for (const FRCCondition& C : Def->FailWhenAny)
	{
		if (Rules->EvaluateAll({ C }, NAME_None)) { FailQuest(QuestId); return; }
	}
	for (int32 Safety = 0; Safety < 16; ++Safety)
	{
		const FRCQuestStage* Stage = Def->Stages.FindByPredicate([Q](const FRCQuestStage& S) { return S.Stage == Q->Stage; });
		if (!Stage || Stage->AdvanceTo < 0 || Stage->AdvanceWhen.Num() == 0 || !Rules->EvaluateAll(Stage->AdvanceWhen, NAME_None)) break;
		Q->Stage = Stage->AdvanceTo;
		OnQuestUpdated.Broadcast(QuestId, Q->Status, Q->Stage);
	}
}

void URCQuestSubsystem::WriteToSave(URCSaveGame& Save) const
{
	Save.Quests.Reset();
	for (const TPair<FName, FRCQuestRuntime>& P : Runtime) Save.Quests.Add(P.Value);
}

void URCQuestSubsystem::ReadFromSave(const URCSaveGame& Save)
{
	Runtime.Reset();
	for (const FRCQuestRuntime& Q : Save.Quests) Runtime.Add(Q.QuestId, Q);
}
