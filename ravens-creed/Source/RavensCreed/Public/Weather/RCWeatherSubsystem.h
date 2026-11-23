// Raven's Creed: procedural weather, time of day and the weather-gameplay query API.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Core/RCTypes.h"
#include "Weather/RCWeatherTypes.h"
#include "RCWeatherSubsystem.generated.h"

class UNiagaraComponent;
class UMaterialParameterCollectionInstance;
class UExponentialHeightFogComponent;
class URCWorldStateSubsystem;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnWeatherChanged, ERCWeatherType, From, ERCWeatherType, To);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnLightningStrike, FVector, Location, AActor*, HitActor);

UCLASS()
class RAVENSCREED_API URCWeatherSubsystem : public UTickableWorldSubsystem, public IRCSaveable
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(URCWeatherSubsystem, STATGROUP_Tickables); }
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override { return WorldType == EWorldType::Game || WorldType == EWorldType::PIE; }

	// ---------------- control ----------------

	/** Starts blending toward a weather type (designer scripting, quests, debug console: rc.Weather <Type>). */
	UFUNCTION(BlueprintCallable, Category = "Weather")
	void RequestWeather(ERCWeatherType Type, float BlendHoursOverride = -1.f);

	/** Locks the current target for missions that need a guaranteed storm. Unlock resumes the Markov chain. */
	UFUNCTION(BlueprintCallable, Category = "Weather")
	void SetWeatherLocked(bool bLocked) { bLocked_ = bLocked; }

	UFUNCTION(BlueprintCallable, Category = "Weather")
	void SetRegion(FName InRegion) { Region = InRegion; }

	// ---------------- gameplay queries ----------------

	UFUNCTION(BlueprintPure, Category = "Weather")
	const FRCWeatherState& GetState() const { return Current; }

	UFUNCTION(BlueprintPure, Category = "Weather")
	ERCWeatherType GetWeatherType() const { return TargetType; }

	/** Air temperature in degrees C: seasonal baseline + weather offset + day/night swing. */
	UFUNCTION(BlueprintPure, Category = "Weather")
	float GetTemperature() const;

	/** Wind including gusts at a location (m/s, world space XY). Drives cloth, sails, foliage and particles. */
	UFUNCTION(BlueprintPure, Category = "Weather")
	FVector GetWindAt(const FVector& Location) const;

	/** 1 = dry grip; down to ~0.45 on soaked rock and ~0.3 on ice. Parkour and dodges scale by this. */
	UFUNCTION(BlueprintPure, Category = "Weather")
	float GetSurfaceGrip(bool bIcySurface = false) const;

	/** Multiplier on AI sight range (fog, rain, blizzard, night). Never below MinVisibility for readability. */
	UFUNCTION(BlueprintPure, Category = "Weather")
	float GetVisibilityMultiplier() const;

	/** Multiplier on how far footsteps and combat noise carry (rain and wind mask sound). */
	UFUNCTION(BlueprintPure, Category = "Weather")
	float GetNoiseMultiplier() const;

	/** Cold damage per second for an exposed character with the given insulation (0 = naked, 1 = full furs). */
	UFUNCTION(BlueprintPure, Category = "Weather")
	float GetColdDamagePerSecond(float Insulation, bool bSheltered, bool bNearFire) const;

	/** True when the location has no roof above it (cached line trace); used for rain, snow and lightning exposure. */
	UFUNCTION(BlueprintCallable, Category = "Weather")
	bool IsExposedToSky(const FVector& Location) const;

	UFUNCTION(BlueprintPure, Category = "Weather")
	bool IsNight() const;

	UPROPERTY(BlueprintAssignable, Category = "Weather")
	FRCOnWeatherChanged OnWeatherChanged;

	/** AI listens for fear/morale; audio for thunder; fire system for ignition. */
	UPROPERTY(BlueprintAssignable, Category = "Weather")
	FRCOnLightningStrike OnLightningStrike;

	virtual void WriteToSave(URCSaveGame& Save) const override;
	virtual void ReadFromSave(const URCSaveGame& Save) override;

	static constexpr float MinVisibility = 0.25f;

private:
	void AdvanceMarkovChain();
	const FRCWeatherPreset* FindPreset(ERCWeatherType Type) const;
	void BlendState(float DeltaHours);
	void IntegrateSurfaces(float DeltaHours);
	void PushToRendering();
	void UpdatePrecipitationEffects();
	void TickLightning(float DeltaSeconds);
	void StrikeLightning();
	AActor* PickLightningTarget(const FVector& Around, FVector& OutStrikePoint) const;

	UPROPERTY()
	TObjectPtr<UDataTable> Presets;

	UPROPERTY()
	TObjectPtr<UMaterialParameterCollectionInstance> ParamInstance;

	UPROPERTY()
	TObjectPtr<UNiagaraComponent> RainComponent;

	UPROPERTY()
	TObjectPtr<UNiagaraComponent> SnowComponent;

	UPROPERTY()
	TObjectPtr<UExponentialHeightFogComponent> HeightFog;

	UPROPERTY()
	TObjectPtr<URCWorldStateSubsystem> WorldState;

	FRCWeatherState Current;
	FRCWeatherState BlendFrom;
	FRCWeatherState BlendTo;
	ERCWeatherType TargetType = ERCWeatherType::Clear;
	float BlendAlpha = 1.f;
	float BlendHours = 1.f;
	float HoursUntilChange = 4.f;
	float LightningCooldown = 0.f;
	float FlashIntensity = 0.f;
	float FlashBudget = 0.f;
	FName Region = TEXT("WesternFjords");
	bool bLocked_ = false;
};
