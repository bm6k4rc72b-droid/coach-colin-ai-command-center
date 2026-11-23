// Raven's Creed: save/load that gathers every IRCSaveable system into one URCSaveGame.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "RCSaveSubsystem.generated.h"

class URCSaveGame;
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnSaveFinished, const FString&, Slot, bool, bSuccess);

UCLASS()
class RAVENSCREED_API URCSaveSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	/** Snapshots all systems on the game thread, then writes asynchronously. */
	UFUNCTION(BlueprintCallable, Category = "Save")
	void SaveGame(const FString& Slot, int32 UserIndex = 0);

	/** Loads synchronously and pushes state into every system. Call after the target world has loaded. */
	UFUNCTION(BlueprintCallable, Category = "Save")
	bool LoadGame(const FString& Slot, int32 UserIndex = 0);

	UPROPERTY(BlueprintAssignable, Category = "Save")
	FRCOnSaveFinished OnSaveFinished;

	static constexpr int32 CurrentVersion = 1;

private:
	void GatherSaveables(TArray<class IRCSaveable*>& Out) const;
	void MigrateIfNeeded(URCSaveGame& Save) const;
};
