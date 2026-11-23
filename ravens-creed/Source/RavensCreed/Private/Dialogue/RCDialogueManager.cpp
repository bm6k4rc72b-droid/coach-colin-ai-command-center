#include "Dialogue/RCDialogueManager.h"
#include "Dialogue/RCDialogueAsset.h"
#include "Core/RCWorldStateSubsystem.h"
#include "Core/RCAlignmentSubsystem.h"
#include "Social/RCSocialSubsystem.h"
#include "Weather/RCWeatherSubsystem.h"
#include "Quest/RCQuestSubsystem.h"
#include "Kismet/GameplayStatics.h"
#include "RavensCreed.h"

namespace RCDialogue
{
	static const FName Player(TEXT("Player"));
	static const FName NPC(TEXT("NPC"));
}

bool URCDialogueManager::StartDialogue(URCDialogueAsset* InAsset, FName NPCId, APawn* Player)
{
	if (!InAsset || IsInDialogue()) return false;
	for (const FRCDialogueEntry& E : InAsset->Graph.Entries)
	{
		if (EvaluateAll(E.Conditions, NPCId))
		{
			Asset = InAsset;
			PlayerPawn = Player;
			CurrentNPC = NPCId;
			EnterNode(E.Node);
			return true;
		}
	}
	UE_LOG(LogRavensCreed, Warning, TEXT("Dialogue %s: no entry passes for %s"), *InAsset->GetName(), *NPCId.ToString());
	return false;
}

void URCDialogueManager::EnterNode(FName NodeId)
{
	const FRCDialogueNode* Node = Asset ? Asset->FindNode(NodeId) : nullptr;
	if (!Node) { EndDialogue(); return; }
	CurrentNode = NodeId;

	ApplyAll(Node->OnEnter, CurrentNPC, Asset->Graph.Id);

	FRCDialogueLineEvent L;
	L.NodeId = Node->Id;
	L.Speaker = Node->Speaker == RCDialogue::NPC ? CurrentNPC : Node->Speaker;
	L.Line = Node->Line;
	L.VoiceLineId = Node->VoiceLineId;
	L.Voice = Node->Voice;
	L.Emote = Node->Emote;
	if (const URCSocialSubsystem* Social = GetWorld()->GetSubsystem<URCSocialSubsystem>())
	{
		if (const FRCNPCRecord* R = Social->FindRecord(L.Speaker)) L.SpeakerName = R->DisplayName;
	}
	if (L.SpeakerName.IsEmpty()) L.SpeakerName = FText::FromName(L.Speaker == RCDialogue::Player ? FName(TEXT("Bjorn")) : L.Speaker);
	if (bAutoPlayVoice && !Node->Voice.IsNull())
	{
		if (USoundBase* Sound = Node->Voice.LoadSynchronous()) UGameplayStatics::PlaySound2D(this, Sound);
	}
	OnLine.Broadcast(L);

	// Build the visible choice list. Effects of the node may have changed flags, so evaluate now.
	VisibleChoiceMap.Reset();
	TArray<FRCChoiceView> Views;
	for (int32 i = 0; i < Node->Choices.Num(); ++i)
	{
		const FRCDialogueChoice& C = Node->Choices[i];
		const bool bOk = EvaluateAll(C.Conditions, CurrentNPC);
		if (!bOk && !C.bShowWhenLocked) continue;
		FRCChoiceView V;
		V.Index = Views.Num();
		V.Text = C.Text;
		V.Tone = C.Tone;
		V.bAvailable = bOk;
		V.RequirementHint = C.RequirementHint;
		V.bPointOfNoReturn = C.bPointOfNoReturn;
		Views.Add(V);
		VisibleChoiceMap.Add(i);
	}
	if (Views.Num() > 0) OnChoices.Broadcast(Views);
}

void URCDialogueManager::Advance()
{
	const FRCDialogueNode* Node = Asset ? Asset->FindNode(CurrentNode) : nullptr;
	if (!Node) return;
	if (Node->Choices.Num() > 0 && VisibleChoiceMap.Num() > 0) return; // waiting for a choice
	if (Node->Next.IsNone()) EndDialogue(); else EnterNode(Node->Next);
}

void URCDialogueManager::SelectChoice(int32 Index)
{
	const FRCDialogueNode* Node = Asset ? Asset->FindNode(CurrentNode) : nullptr;
	if (!Node || !VisibleChoiceMap.IsValidIndex(Index)) return;
	const FRCDialogueChoice& C = Node->Choices[VisibleChoiceMap[Index]];
	if (!EvaluateAll(C.Conditions, CurrentNPC)) return;

	ApplyAll(C.Effects, CurrentNPC, Asset->Graph.Id);
	if (C.Next.IsNone()) EndDialogue(); else EnterNode(C.Next);
}

void URCDialogueManager::EndDialogue()
{
	if (!Asset) return;
	Asset = nullptr;
	PlayerPawn = nullptr;
	CurrentNPC = NAME_None;
	CurrentNode = NAME_None;
	VisibleChoiceMap.Reset();
	OnEnded.Broadcast();
}

bool URCDialogueManager::EvaluateAll(const TArray<FRCCondition>& Conditions, FName NPCId) const
{
	for (const FRCCondition& C : Conditions)
	{
		if (Evaluate(C, NPCId) == C.bNot) return false;
	}
	return true;
}

bool URCDialogueManager::Evaluate(const FRCCondition& C, FName NPCId) const
{
	const URCWorldStateSubsystem* World = GetWorld()->GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>();
	const URCAlignmentSubsystem* Align = GetWorld()->GetGameInstance()->GetSubsystem<URCAlignmentSubsystem>();
	const URCSocialSubsystem* Social = GetWorld()->GetSubsystem<URCSocialSubsystem>();
	const URCWeatherSubsystem* Weather = GetWorld()->GetSubsystem<URCWeatherSubsystem>();

	switch (C.Type)
	{
	case ERCConditionType::FlagAtLeast:      return World && World->GetFlag(C.Key) >= C.Value;
	case ERCConditionType::FlagBelow:        return !World || World->GetFlag(C.Key) < C.Value;
	case ERCConditionType::AlignmentAtLeast: return Align && Align->GetValue(C.Axis) >= C.Value;
	case ERCConditionType::AlignmentBelow:   return Align && Align->GetValue(C.Axis) < C.Value;
	case ERCConditionType::OpinionAtLeast:
	{
		const FRCNPCRecord* R = Social ? Social->FindRecord(ResolveNPC(C.Key, NPCId)) : nullptr;
		return R && R->Opinion >= C.Value;
	}
	case ERCConditionType::NPCAlive:         return !Social || Social->IsAlive(C.Key);
	case ERCConditionType::NPCDead:          return Social && !Social->IsAlive(C.Key);
	case ERCConditionType::Remembers:        return Social && Social->Remembers(ResolveNPC(C.Key, NPCId), C.Memory);
	case ERCConditionType::WeatherIs:        return Weather && Weather->GetWeatherType() == C.Weather;
	case ERCConditionType::IsNight:          return Weather && Weather->IsNight();
	case ERCConditionType::CompanionIs:      return World && World->GetFlag(FName(*FString::Printf(TEXT("COMPANION_%s"), *C.Key.ToString()))) == static_cast<int32>(C.Companion);
	case ERCConditionType::SilverAtLeast:    return World && World->GetFlag(TEXT("SILVER")) >= C.Value;
	default:                                 return false;
	}
}

void URCDialogueManager::ApplyAll(const TArray<FRCEffect>& Effects, FName NPCId, FName Source)
{
	for (const FRCEffect& E : Effects) Apply(E, NPCId, Source);
}

void URCDialogueManager::Apply(const FRCEffect& E, FName NPCId, FName Source)
{
	URCWorldStateSubsystem* World = GetWorld()->GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>();
	URCAlignmentSubsystem* Align = GetWorld()->GetGameInstance()->GetSubsystem<URCAlignmentSubsystem>();
	URCSocialSubsystem* Social = GetWorld()->GetSubsystem<URCSocialSubsystem>();
	URCQuestSubsystem* Quests = GetWorld()->GetSubsystem<URCQuestSubsystem>();
	const int32 IntValue = FMath::RoundToInt(E.Value);

	switch (E.Type)
	{
	case ERCEffectType::SetFlag:   if (World) World->SetFlag(E.Key, IntValue, Source); break;
	case ERCEffectType::AddFlag:   if (World) World->AddToFlag(E.Key, IntValue, Source); break;
	case ERCEffectType::Alignment: if (Align) Align->ApplyDelta(E.Axis, E.Value, Source); break;
	case ERCEffectType::Opinion:   if (Social) Social->ModifyAttitude(ResolveNPC(E.Key, NPCId), E.Value); break;
	case ERCEffectType::Fear:      if (Social) Social->ModifyAttitude(ResolveNPC(E.Key, NPCId), 0.f, E.Value); break;
	case ERCEffectType::Trust:     if (Social) Social->ModifyAttitude(ResolveNPC(E.Key, NPCId), 0.f, 0.f, E.Value); break;
	case ERCEffectType::Remember:
		if (Social)
		{
			// Dialogue acts are heard by the conversation partner (and anyone named), not seen across the room.
			FRCSocialEvent Ev;
			Ev.Kind = E.Memory;
			Ev.Victim = E.Victim;
			Ev.Severity = FMath::Clamp(E.Value, 0.f, 1.f);
			Ev.Location = PlayerPawn ? PlayerPawn->GetActorLocation() : FVector::ZeroVector;
			Ev.GuaranteedWitnesses.Add(ResolveNPC(E.Key, NPCId));
			Social->ReportEvent(Ev);
		}
		break;
	case ERCEffectType::FactionRep: if (Social) Social->ModifyFactionReputation(E.Key, E.Value); break;
	case ERCEffectType::CompanionApproval:
		// Companions only approve or disapprove of what they are present for.
		if (World && World->GetFlag(FName(*FString::Printf(TEXT("PARTY_%s"), *E.Key.ToString()))) != 0)
		{
			World->AddToFlag(FName(*FString::Printf(TEXT("APPROVAL_%s"), *E.Key.ToString())), IntValue, Source);
		}
		break;
	case ERCEffectType::SetCompanion:
		if (World) World->SetFlag(FName(*FString::Printf(TEXT("COMPANION_%s"), *E.Key.ToString())), static_cast<int32>(E.Companion), Source);
		if (Social) Social->SetRecruited(E.Key, E.Companion == ERCCompanionState::Recruited);
		break;
	case ERCEffectType::StartQuest:    if (Quests) Quests->StartQuest(E.Key); break;
	case ERCEffectType::SetQuestStage: if (Quests) Quests->SetStage(E.Key, IntValue); break;
	case ERCEffectType::CompleteQuest: if (Quests) Quests->CompleteQuest(E.Key, E.Victim); break;
	case ERCEffectType::Silver:        if (World) World->AddToFlag(TEXT("SILVER"), IntValue, Source); break;
	case ERCEffectType::Event:         OnDialogueEvent.Broadcast(E.Key); break;
	case ERCEffectType::Weather:
		if (URCWeatherSubsystem* W = GetWorld()->GetSubsystem<URCWeatherSubsystem>()) W->RequestWeather(E.Weather, E.Value > 0.f ? E.Value : -1.f);
		break;
	default: break;
	}
}
