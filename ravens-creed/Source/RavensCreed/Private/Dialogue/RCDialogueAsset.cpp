#include "Dialogue/RCDialogueAsset.h"
#include "JsonObjectConverter.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "RavensCreed.h"
#if WITH_EDITOR
#include "Misc/DataValidation.h"
#endif

#define LOCTEXT_NAMESPACE "RCDialogue"

void URCDialogueAsset::ImportFromJson()
{
	FString Json;
	const FString Path = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir(), JsonSource.FilePath);
	if (!FFileHelper::LoadFileToString(Json, *Path))
	{
		UE_LOG(LogRavensCreed, Error, TEXT("Dialogue import: cannot read %s"), *Path);
		return;
	}
	FRCDialogueGraph Parsed;
	if (!FJsonObjectConverter::JsonObjectStringToUStruct(Json, &Parsed, 0, 0))
	{
		UE_LOG(LogRavensCreed, Error, TEXT("Dialogue import: %s is not a valid dialogue graph"), *Path);
		return;
	}
	Modify();
	Graph = MoveTemp(Parsed);
	for (FRCDialogueNode& N : Graph.Nodes)
	{
		if (N.VoiceLineId.IsNone()) N.VoiceLineId = FName(*FString::Printf(TEXT("%s.%s"), *Graph.Id.ToString(), *N.Id.ToString()));
	}
	for (const FString& Problem : Validate()) UE_LOG(LogRavensCreed, Warning, TEXT("Dialogue %s: %s"), *GetName(), *Problem);
	UE_LOG(LogRavensCreed, Log, TEXT("Dialogue import: %d nodes into %s"), Graph.Nodes.Num(), *GetName());
}

const FRCDialogueNode* URCDialogueAsset::FindNode(FName NodeId) const
{
	return Graph.Nodes.FindByPredicate([NodeId](const FRCDialogueNode& N) { return N.Id == NodeId; });
}

TArray<FString> URCDialogueAsset::Validate() const
{
	TArray<FString> Problems;
	TSet<FName> Ids, Reached;
	for (const FRCDialogueNode& N : Graph.Nodes)
	{
		if (Ids.Contains(N.Id)) Problems.Add(FString::Printf(TEXT("duplicate node id %s"), *N.Id.ToString()));
		Ids.Add(N.Id);
	}
	auto Check = [&](FName Target, const FString& From)
	{
		if (Target.IsNone()) return;
		if (!Ids.Contains(Target)) Problems.Add(FString::Printf(TEXT("%s points to missing node %s"), *From, *Target.ToString()));
		Reached.Add(Target);
	};
	for (const FRCDialogueEntry& E : Graph.Entries) Check(E.Node, TEXT("entry"));
	for (const FRCDialogueNode& N : Graph.Nodes)
	{
		Check(N.Next, N.Id.ToString());
		for (const FRCDialogueChoice& C : N.Choices) Check(C.Next, N.Id.ToString());
	}
	for (const FName& Id : Ids)
	{
		if (!Reached.Contains(Id)) Problems.Add(FString::Printf(TEXT("node %s is unreachable"), *Id.ToString()));
	}
	if (Graph.Entries.Num() == 0) Problems.Add(TEXT("graph has no entries"));
	return Problems;
}

#if WITH_EDITOR
EDataValidationResult URCDialogueAsset::IsDataValid(FDataValidationContext& Context) const
{
	const TArray<FString> Problems = Validate();
	for (const FString& P : Problems) Context.AddError(FText::FromString(P));
	return Problems.Num() ? EDataValidationResult::Invalid : EDataValidationResult::Valid;
}
#endif

#undef LOCTEXT_NAMESPACE
