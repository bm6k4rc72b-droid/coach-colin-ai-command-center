// Raven's Creed: dialogue graph asset with JSON import for writers working outside the editor.
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "Dialogue/RCDialogueTypes.h"
#include "RCDialogueAsset.generated.h"

UCLASS(BlueprintType)
class RAVENSCREED_API URCDialogueAsset : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Dialogue")
	FRCDialogueGraph Graph;

	/** Path to a JSON file with the FRCDialogueGraph layout (see Content/Data/Dialogue/DLG_DrownedOath.json). */
	UPROPERTY(EditAnywhere, Category = "Import", meta = (FilePathFilter = "json"))
	FFilePath JsonSource;

	/** Editor button: replaces Graph with the JSON file's contents, then validates links. */
	UFUNCTION(CallInEditor, Category = "Import")
	void ImportFromJson();

	const FRCDialogueNode* FindNode(FName NodeId) const;

	/** Returns human-readable problems: missing nodes, unreachable nodes, dead ends with choices. */
	UFUNCTION(BlueprintCallable, Category = "Dialogue")
	TArray<FString> Validate() const;

#if WITH_EDITOR
	virtual EDataValidationResult IsDataValid(class FDataValidationContext& Context) const override;
#endif
};
