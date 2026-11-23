// Raven's Creed: Raven Sight. A pulse that marks targets, threats, allies and loot through walls, partly piercing fog.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "RCRavenSightComponent.generated.h"

/** Custom-depth stencil values read by the PP_RavenSight post-process material. */
UENUM(BlueprintType)
enum class ERCSightMark : uint8
{
	None = 0,
	Threat = 1,   // red
	Target = 2,   // gold (actors tagged "QuestTarget" or matching the active quest's markers)
	Ally = 3,     // blue
	Loot = 4,     // white
	Clue = 5      // teal (footprints, blood, Circle sigils)
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FRCOnSightPulse, float, Radius);

UCLASS(ClassGroup = (RavensCreed), meta = (BlueprintSpawnableComponent))
class RAVENSCREED_API URCRavenSightComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	URCRavenSightComponent();

	UFUNCTION(BlueprintCallable, Category = "Raven Sight")
	void Pulse();

	/** Base radius in cm (60 m); Rune perks raise it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Raven Sight") float BaseRadius = 6000.f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Raven Sight") float Duration = 8.f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Raven Sight") float Cooldown = 4.f;
	/** Fraction of weather visibility loss that Raven Sight ignores (0.5 = pierces half the fog). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Raven Sight") float FogPiercing = 0.5f;

	UPROPERTY(BlueprintAssignable, Category = "Raven Sight") FRCOnSightPulse OnPulse;

protected:
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	ERCSightMark Classify(const AActor* Actor) const;
	void ClearMarks();

	TArray<TWeakObjectPtr<UPrimitiveComponent>> Marked;
	float ActiveTimer = 0.f;
	float CooldownTimer = 0.f;
};
