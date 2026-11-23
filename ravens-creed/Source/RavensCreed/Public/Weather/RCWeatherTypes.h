// Raven's Creed: weather data types.
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "Engine/DeveloperSettings.h"
#include "RCWeatherTypes.generated.h"

class UMaterialParameterCollection;
class UNiagaraSystem;
class USoundBase;

UENUM(BlueprintType)
enum class ERCWeatherType : uint8
{
	Clear, Overcast, Fog, Drizzle, Rain, Thunderstorm, Snow, Blizzard, AuroraNight
};

UENUM(BlueprintType)
enum class ERCPrecipitation : uint8 { None, Rain, Snow, Sleet };

/** The live, continuously blended weather state. Every value is pushed to materials and read by gameplay. */
USTRUCT(BlueprintType)
struct FRCWeatherState
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather", meta = (ClampMin = 0, ClampMax = 1))
	float CloudCoverage = 0.3f;

	/** 0..1 precipitation intensity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather", meta = (ClampMin = 0, ClampMax = 1))
	float Precipitation = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather")
	ERCPrecipitation PrecipitationType = ERCPrecipitation::None;

	/** World-space wind direction (XY, normalised). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather")
	FVector2D WindDirection = FVector2D(1.f, 0.f);

	/** Mean wind speed in m/s (gusts are added on top procedurally). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather", meta = (ClampMin = 0, ClampMax = 40))
	float WindSpeed = 3.f;

	/** Exponential height fog density driven by weather. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather", meta = (ClampMin = 0, ClampMax = 1))
	float FogDensity = 0.02f;

	/** Offset from the seasonal baseline temperature, in degrees C. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather")
	float TemperatureOffset = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather", meta = (ClampMin = 0))
	float LightningPerMinute = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "Weather", meta = (ClampMin = 0, ClampMax = 1))
	float Aurora = 0.f;

	// --- accumulated surface state (integrated over time, not blended) ---

	/** Global surface wetness 0..1; drives material darkening, puddles and grip. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, SaveGame, Category = "Weather")
	float Wetness = 0.f;

	/** Snow cover 0..1 on up-facing surfaces. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, SaveGame, Category = "Weather")
	float SnowCover = 0.f;
};

USTRUCT(BlueprintType)
struct FRCWeatherTransition
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	ERCWeatherType To = ERCWeatherType::Clear;

	/** Relative weight; multiplied by the season weight of the destination preset. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather", meta = (ClampMin = 0))
	float Weight = 1.f;
};

/** One row per weather type and region. Designers tune these in a data table. */
USTRUCT(BlueprintType)
struct FRCWeatherPreset : public FTableRowBase
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	ERCWeatherType Type = ERCWeatherType::Clear;

	/** Region this row applies to (e.g. "WesternFjords", "Wessex"). None = all regions. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	FName Region;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	FRCWeatherState Target;

	/** In-game hours the weather lasts once fully blended in. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	FVector2D DurationHours = FVector2D(2.f, 6.f);

	/** How many in-game hours it takes to blend from the previous weather. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather", meta = (ClampMin = 0.1))
	float BlendHours = 1.f;

	/** Likelihood multipliers per season: Spring, Summer, Autumn, Winter. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	FVector4 SeasonWeights = FVector4(1, 1, 1, 1);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	TArray<FRCWeatherTransition> Transitions;

	/** Aurora presets only roll at night. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	bool bNightOnly = false;
};

/** Project settings: Edit > Project Settings > Game > Raven's Creed Weather. */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Raven's Creed Weather"))
class RAVENSCREED_API URCWeatherSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UPROPERTY(Config, EditAnywhere, Category = "Data")
	TSoftObjectPtr<UDataTable> PresetTable;

	/** Global material parameters: RC_Wetness, RC_Snow, RC_Rain, RC_WindX, RC_WindY, RC_WindSpeed, RC_Cloud, RC_Fog, RC_Aurora, RC_Lightning. */
	UPROPERTY(Config, EditAnywhere, Category = "Rendering")
	TSoftObjectPtr<UMaterialParameterCollection> WeatherParameters;

	UPROPERTY(Config, EditAnywhere, Category = "Effects")
	TSoftObjectPtr<UNiagaraSystem> RainSystem;

	UPROPERTY(Config, EditAnywhere, Category = "Effects")
	TSoftObjectPtr<UNiagaraSystem> SnowSystem;

	UPROPERTY(Config, EditAnywhere, Category = "Effects")
	TSoftObjectPtr<UNiagaraSystem> LightningSystem;

	UPROPERTY(Config, EditAnywhere, Category = "Effects")
	TSoftObjectPtr<USoundBase> ThunderSound;

	/** Real minutes per in-game day. */
	UPROPERTY(Config, EditAnywhere, Category = "Time", meta = (ClampMin = 1))
	float DayLengthMinutes = 48.f;

	/** Seasonal baseline temperature (C) for Spring, Summer, Autumn, Winter in the fjords. */
	UPROPERTY(Config, EditAnywhere, Category = "Climate")
	FVector4 SeasonTemperatures = FVector4(6, 15, 7, -6);

	/** Accessibility cap on visible lightning flashes per second. */
	UPROPERTY(Config, EditAnywhere, Category = "Accessibility", meta = (ClampMin = 0.1))
	float MaxFlashesPerSecond = 3.f;

	virtual FName GetCategoryName() const override { return TEXT("Game"); }
};
