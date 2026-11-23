// Raven's Creed: the single save object that persists all world state and decisions.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Core/RCTypes.h"
#include "Social/RCSocialTypes.h"
#include "Weather/RCWeatherTypes.h"
#include "Quest/RCQuestTypes.h"
#include "RCSaveGame.generated.h"

UCLASS()
class RAVENSCREED_API URCSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	/** Bumped when the layout changes; URCSaveSubsystem migrates older saves. */
	UPROPERTY(SaveGame)
	int32 SaveVersion = 1;

	UPROPERTY(SaveGame)
	FDateTime SavedAt;

	// --- world state ---
	UPROPERTY(SaveGame)
	TMap<FName, int32> Flags;

	UPROPERTY(SaveGame)
	TArray<FRCConsequenceRecord> Ledger;

	UPROPERTY(SaveGame)
	int32 Day = 0;

	UPROPERTY(SaveGame)
	float TimeOfDayHours = 8.f;

	// --- alignment ---
	UPROPERTY(SaveGame)
	TArray<float> Alignment;

	// --- social simulation ---
	UPROPERTY(SaveGame)
	TArray<FRCNPCRecord> NPCs;

	UPROPERTY(SaveGame)
	TMap<FName, float> FactionReputation;

	// --- quests ---
	UPROPERTY(SaveGame)
	TArray<FRCQuestRuntime> Quests;

	// --- weather ---
	UPROPERTY(SaveGame)
	FRCWeatherState Weather;

	UPROPERTY(SaveGame)
	ERCWeatherType WeatherTarget = ERCWeatherType::Clear;

	// --- player ---
	UPROPERTY(SaveGame)
	FTransform PlayerTransform;

	UPROPERTY(SaveGame)
	float PlayerHealth = 100.f;

	UPROPERTY(SaveGame)
	FName PlayerRegion;
};
