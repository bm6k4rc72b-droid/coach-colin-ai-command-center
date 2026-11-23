// Raven's Creed: the world-flag ledger. Every quest outcome, death and decision writes here; everything that reacts reads here.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Core/RCTypes.h"
#include "RCWorldStateSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FRCOnFlagChanged, FName, Flag, int32, OldValue, int32, NewValue);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnTimeAdvanced, int32, Day, float, Hour);

UENUM(BlueprintType)
enum class ERCSeason : uint8 { Spring, Summer, Autumn, Winter };

UCLASS()
class RAVENSCREED_API URCWorldStateSubsystem : public UGameInstanceSubsystem, public IRCSaveable
{
	GENERATED_BODY()

public:
	// --- flags ---
	UFUNCTION(BlueprintCallable, Category = "World State")
	void SetFlag(FName Flag, int32 Value = 1, FName Source = NAME_None);

	UFUNCTION(BlueprintCallable, Category = "World State")
	void AddToFlag(FName Flag, int32 Delta, FName Source = NAME_None);

	UFUNCTION(BlueprintPure, Category = "World State")
	int32 GetFlag(FName Flag) const;

	UFUNCTION(BlueprintPure, Category = "World State")
	bool HasFlag(FName Flag) const { return GetFlag(Flag) != 0; }

	UFUNCTION(BlueprintPure, Category = "World State")
	const TArray<FRCConsequenceRecord>& GetLedger() const { return Ledger; }

	// --- calendar ---
	/** Called by the weather/time system; fires OnTimeAdvanced once per in-game hour boundary. */
	void AdvanceTime(float Hours);

	UFUNCTION(BlueprintPure, Category = "World State")
	int32 GetDay() const { return Day; }

	UFUNCTION(BlueprintPure, Category = "World State")
	float GetHour() const { return Hour; }

	UFUNCTION(BlueprintPure, Category = "World State")
	ERCSeason GetSeason() const;

	/** 0..1 within the current season, for smooth seasonal blends (foliage colour, snow line). */
	UFUNCTION(BlueprintPure, Category = "World State")
	float GetSeasonProgress() const;

	UPROPERTY(BlueprintAssignable, Category = "World State")
	FRCOnFlagChanged OnFlagChanged;

	UPROPERTY(BlueprintAssignable, Category = "World State")
	FRCOnTimeAdvanced OnHourPassed;

	/** In-game days per season. 4 seasons x 12 days = a 48-day saga year. */
	static constexpr int32 DaysPerSeason = 12;

	virtual void WriteToSave(URCSaveGame& Save) const override;
	virtual void ReadFromSave(const URCSaveGame& Save) override;

private:
	UPROPERTY()
	TMap<FName, int32> Flags;

	UPROPERTY()
	TArray<FRCConsequenceRecord> Ledger;

	int32 Day = 0;
	float Hour = 8.f;
};
