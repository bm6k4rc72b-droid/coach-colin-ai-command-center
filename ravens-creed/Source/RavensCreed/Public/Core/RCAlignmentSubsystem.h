// Raven's Creed: the four-axis alignment (Honor, Cunning, Piety, Ambition).
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Core/RCTypes.h"
#include "RCAlignmentSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FRCOnAlignmentChanged, ERCAlignmentAxis, Axis, float, OldValue, float, NewValue);

UCLASS()
class RAVENSCREED_API URCAlignmentSubsystem : public UGameInstanceSubsystem, public IRCSaveable
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/**
	 * Applies a shift with diminishing returns: moving further toward an extreme costs more,
	 * moving back toward the centre is full strength. Returns the applied amount.
	 */
	UFUNCTION(BlueprintCallable, Category = "Alignment")
	float ApplyDelta(ERCAlignmentAxis Axis, float Amount, FName Source = NAME_None);

	UFUNCTION(BlueprintCallable, Category = "Alignment")
	void ApplyDeltas(const TArray<FRCAlignmentDelta>& Deltas, FName Source = NAME_None);

	UFUNCTION(BlueprintPure, Category = "Alignment")
	float GetValue(ERCAlignmentAxis Axis) const;

	/** The two axes furthest from zero (by absolute value), used by the ending selector and skald verses. */
	UFUNCTION(BlueprintPure, Category = "Alignment")
	void GetDominantAxes(ERCAlignmentAxis& First, ERCAlignmentAxis& Second) const;

	/** Short epithet NPCs use in greetings, e.g. "Oathkeeper" or "Night-Fox". Empty when no axis passes 40. */
	UFUNCTION(BlueprintPure, Category = "Alignment")
	FText GetTitle() const;

	UPROPERTY(BlueprintAssignable, Category = "Alignment")
	FRCOnAlignmentChanged OnAlignmentChanged;

	virtual void WriteToSave(URCSaveGame& Save) const override;
	virtual void ReadFromSave(const URCSaveGame& Save) override;

	static constexpr float MinValue = -100.f;
	static constexpr float MaxValue = 100.f;

private:
	float Values[static_cast<int32>(ERCAlignmentAxis::Count)] = {};
};
