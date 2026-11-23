#include "Weather/RCWeatherSubsystem.h"
#include "Core/RCSaveGame.h"
#include "Core/RCWorldStateSubsystem.h"
#include "RavensCreed.h"

#include "Components/ExponentialHeightFogComponent.h"
#include "Engine/ExponentialHeightFog.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialParameterCollection.h"
#include "Materials/MaterialParameterCollectionInstance.h"
#include "NiagaraComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "GameFramework/Character.h"
#include "Engine/OverlapResult.h"

namespace RCWeather
{
	static const FName P_Wetness(TEXT("RC_Wetness"));
	static const FName P_Snow(TEXT("RC_Snow"));
	static const FName P_Rain(TEXT("RC_Rain"));
	static const FName P_WindX(TEXT("RC_WindX"));
	static const FName P_WindY(TEXT("RC_WindY"));
	static const FName P_WindSpeed(TEXT("RC_WindSpeed"));
	static const FName P_Cloud(TEXT("RC_Cloud"));
	static const FName P_Fog(TEXT("RC_Fog"));
	static const FName P_Aurora(TEXT("RC_Aurora"));
	static const FName P_Lightning(TEXT("RC_Lightning"));
	static const FName TagConductive(TEXT("Conductive"));

	FRCWeatherState Lerp(const FRCWeatherState& A, const FRCWeatherState& B, float T)
	{
		FRCWeatherState R = A;
		R.CloudCoverage = FMath::Lerp(A.CloudCoverage, B.CloudCoverage, T);
		R.Precipitation = FMath::Lerp(A.Precipitation, B.Precipitation, T);
		R.PrecipitationType = T < 0.5f ? A.PrecipitationType : B.PrecipitationType;
		R.WindDirection = FMath::Lerp(A.WindDirection, B.WindDirection, T).GetSafeNormal();
		R.WindSpeed = FMath::Lerp(A.WindSpeed, B.WindSpeed, T);
		R.FogDensity = FMath::Lerp(A.FogDensity, B.FogDensity, T);
		R.TemperatureOffset = FMath::Lerp(A.TemperatureOffset, B.TemperatureOffset, T);
		R.LightningPerMinute = FMath::Lerp(A.LightningPerMinute, B.LightningPerMinute, T);
		R.Aurora = FMath::Lerp(A.Aurora, B.Aurora, T);
		// Wetness and snow are integrated separately, never blended.
		R.Wetness = A.Wetness;
		R.SnowCover = A.SnowCover;
		return R;
	}

	/** Console: rc.Weather Thunderstorm */
	static FAutoConsoleCommandWithWorldAndArgs CmdWeather(
		TEXT("rc.Weather"), TEXT("Force weather: rc.Weather <Clear|Overcast|Fog|Drizzle|Rain|Thunderstorm|Snow|Blizzard|AuroraNight> [blendHours]"),
		FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
		{
			if (!World || Args.Num() == 0) return;
			const UEnum* Enum = StaticEnum<ERCWeatherType>();
			const int64 Value = Enum->GetValueByNameString(Args[0]);
			if (Value == INDEX_NONE) return;
			if (URCWeatherSubsystem* W = World->GetSubsystem<URCWeatherSubsystem>())
			{
				W->RequestWeather(static_cast<ERCWeatherType>(Value), Args.Num() > 1 ? FCString::Atof(*Args[1]) : 0.05f);
			}
		}));
}

void URCWeatherSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	const URCWeatherSettings* Settings = GetDefault<URCWeatherSettings>();
	Presets = Settings->PresetTable.LoadSynchronous();
	if (!Presets)
	{
		UE_LOG(LogRavensCreed, Warning, TEXT("Weather: no preset table set in Project Settings > Raven's Creed Weather"));
	}
}

void URCWeatherSubsystem::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);
	WorldState = InWorld.GetGameInstance() ? InWorld.GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>() : nullptr;

	const URCWeatherSettings* Settings = GetDefault<URCWeatherSettings>();
	if (UMaterialParameterCollection* MPC = Settings->WeatherParameters.LoadSynchronous())
	{
		ParamInstance = InWorld.GetParameterCollectionInstance(MPC);
	}
	for (TActorIterator<AExponentialHeightFog> It(&InWorld); It; ++It)
	{
		HeightFog = It->GetComponent();
		break;
	}
	BlendFrom = BlendTo = Current;
	RequestWeather(TargetType, 0.01f);
}

void URCWeatherSubsystem::RequestWeather(ERCWeatherType Type, float BlendHoursOverride)
{
	const FRCWeatherPreset* Preset = FindPreset(Type);
	const ERCWeatherType Old = TargetType;
	TargetType = Type;
	BlendFrom = Current;
	BlendTo = Preset ? Preset->Target : Current;
	BlendHours = BlendHoursOverride > 0.f ? BlendHoursOverride : (Preset ? Preset->BlendHours : 1.f);
	BlendAlpha = 0.f;
	HoursUntilChange = Preset ? FMath::FRandRange(Preset->DurationHours.X, Preset->DurationHours.Y) + BlendHours : 4.f;
	if (Old != Type) OnWeatherChanged.Broadcast(Old, Type);
}

const FRCWeatherPreset* URCWeatherSubsystem::FindPreset(ERCWeatherType Type) const
{
	if (!Presets) return nullptr;
	const FRCWeatherPreset* Fallback = nullptr;
	for (const TPair<FName, uint8*>& Row : Presets->GetRowMap())
	{
		const FRCWeatherPreset* P = reinterpret_cast<const FRCWeatherPreset*>(Row.Value);
		if (P->Type != Type) continue;
		if (P->Region == Region) return P;
		if (P->Region.IsNone()) Fallback = P;
	}
	return Fallback;
}

void URCWeatherSubsystem::AdvanceMarkovChain()
{
	const FRCWeatherPreset* Now = FindPreset(TargetType);
	if (!Now || Now->Transitions.Num() == 0) return;

	const int32 Season = WorldState ? static_cast<int32>(WorldState->GetSeason()) : 1;
	TArray<TPair<ERCWeatherType, float>> Options;
	float Total = 0.f;
	for (const FRCWeatherTransition& T : Now->Transitions)
	{
		const FRCWeatherPreset* Next = FindPreset(T.To);
		if (!Next) continue;
		if (Next->bNightOnly && !IsNight()) continue;
		const float W = T.Weight * Next->SeasonWeights[Season];
		if (W <= 0.f) continue;
		Options.Emplace(T.To, W);
		Total += W;
	}
	if (Total <= 0.f) return;

	float Roll = FMath::FRand() * Total;
	for (const TPair<ERCWeatherType, float>& O : Options)
	{
		Roll -= O.Value;
		if (Roll <= 0.f) { RequestWeather(O.Key); return; }
	}
}

void URCWeatherSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
	const URCWeatherSettings* Settings = GetDefault<URCWeatherSettings>();
	const float DeltaHours = DeltaTime * 24.f / (Settings->DayLengthMinutes * 60.f);

	if (WorldState) WorldState->AdvanceTime(DeltaHours);

	HoursUntilChange -= DeltaHours;
	if (HoursUntilChange <= 0.f && !bLocked_) AdvanceMarkovChain();

	BlendState(DeltaHours);
	IntegrateSurfaces(DeltaHours);
	TickLightning(DeltaTime);
	PushToRendering();
	UpdatePrecipitationEffects();
}

void URCWeatherSubsystem::BlendState(float DeltaHours)
{
	if (BlendAlpha >= 1.f) return;
	BlendAlpha = FMath::Min(1.f, BlendAlpha + DeltaHours / FMath::Max(BlendHours, 0.01f));
	// Smoothstep so fronts arrive and leave gently rather than linearly.
	const float T = FMath::SmoothStep(0.f, 1.f, BlendAlpha);
	const float Wet = Current.Wetness, Snow = Current.SnowCover;
	Current = RCWeather::Lerp(BlendFrom, BlendTo, T);
	Current.Wetness = Wet;
	Current.SnowCover = Snow;
}

void URCWeatherSubsystem::IntegrateSurfaces(float DeltaHours)
{
	const float Temp = GetTemperature();
	const bool bRain = Current.PrecipitationType == ERCPrecipitation::Rain || Current.PrecipitationType == ERCPrecipitation::Sleet;
	const bool bSnow = Current.PrecipitationType == ERCPrecipitation::Snow || Current.PrecipitationType == ERCPrecipitation::Sleet;

	// Rain soaks surfaces within ~30 game minutes at full intensity; drying depends on warmth, wind and sun.
	if (bRain && Current.Precipitation > 0.05f)
	{
		Current.Wetness += Current.Precipitation * 2.f * DeltaHours;
	}
	else
	{
		const float Sun = IsNight() ? 0.2f : (1.f - Current.CloudCoverage);
		const float DryRate = 0.08f + 0.02f * FMath::Max(Temp, 0.f) + 0.01f * Current.WindSpeed + 0.15f * Sun;
		Current.Wetness -= DryRate * DeltaHours;
	}
	// Snow accumulates below ~1 C and melts above, feeding wetness as it melts.
	if (bSnow && Temp < 1.f)
	{
		Current.SnowCover += Current.Precipitation * 0.6f * DeltaHours;
	}
	else if (Temp > 1.f && Current.SnowCover > 0.f)
	{
		const float Melt = 0.05f * (Temp - 1.f) * DeltaHours;
		Current.SnowCover -= Melt;
		Current.Wetness += Melt * 0.5f;
	}
	Current.Wetness = FMath::Clamp(Current.Wetness, 0.f, 1.f);
	Current.SnowCover = FMath::Clamp(Current.SnowCover, 0.f, 1.f);
}

void URCWeatherSubsystem::PushToRendering()
{
	if (ParamInstance)
	{
		ParamInstance->SetScalarParameterValue(RCWeather::P_Wetness, Current.Wetness);
		ParamInstance->SetScalarParameterValue(RCWeather::P_Snow, Current.SnowCover);
		ParamInstance->SetScalarParameterValue(RCWeather::P_Rain, Current.PrecipitationType == ERCPrecipitation::Rain ? Current.Precipitation : 0.f);
		ParamInstance->SetScalarParameterValue(RCWeather::P_WindX, Current.WindDirection.X);
		ParamInstance->SetScalarParameterValue(RCWeather::P_WindY, Current.WindDirection.Y);
		ParamInstance->SetScalarParameterValue(RCWeather::P_WindSpeed, Current.WindSpeed);
		ParamInstance->SetScalarParameterValue(RCWeather::P_Cloud, Current.CloudCoverage);
		ParamInstance->SetScalarParameterValue(RCWeather::P_Fog, Current.FogDensity);
		ParamInstance->SetScalarParameterValue(RCWeather::P_Aurora, IsNight() ? Current.Aurora : 0.f);
		ParamInstance->SetScalarParameterValue(RCWeather::P_Lightning, FlashIntensity);
	}
	if (HeightFog)
	{
		HeightFog->SetFogDensity(Current.FogDensity);
		// Volumetric fog scattering scales with precipitation so rain shafts read in lamp light.
		HeightFog->SetVolumetricFogScatteringDistribution(0.2f + 0.5f * Current.Precipitation);
	}
}

void URCWeatherSubsystem::UpdatePrecipitationEffects()
{
	ACharacter* Player = UGameplayStatics::GetPlayerCharacter(GetWorld(), 0);
	if (!Player) return;
	const URCWeatherSettings* Settings = GetDefault<URCWeatherSettings>();

	auto Ensure = [&](TObjectPtr<UNiagaraComponent>& Comp, const TSoftObjectPtr<UNiagaraSystem>& Asset)
	{
		if (!Comp)
		{
			if (UNiagaraSystem* Sys = Asset.LoadSynchronous())
			{
				Comp = UNiagaraFunctionLibrary::SpawnSystemAttached(Sys, Player->GetRootComponent(), NAME_None,
					FVector(0, 0, 800), FRotator::ZeroRotator, EAttachLocation::KeepRelativeOffset, false);
			}
		}
		return Comp.Get();
	};

	const FVector Wind = GetWindAt(Player->GetActorLocation());
	const bool bSheltered = !IsExposedToSky(Player->GetActorLocation() + FVector(0, 0, 100));
	const float Rain = Current.PrecipitationType == ERCPrecipitation::Rain || Current.PrecipitationType == ERCPrecipitation::Sleet ? Current.Precipitation : 0.f;
	const float Snow = Current.PrecipitationType == ERCPrecipitation::Snow || Current.PrecipitationType == ERCPrecipitation::Sleet ? Current.Precipitation : 0.f;

	if (UNiagaraComponent* R = Ensure(RainComponent, Settings->RainSystem))
	{
		R->SetVariableFloat(TEXT("User.Intensity"), Rain);
		R->SetVariableVec3(TEXT("User.Wind"), Wind);
		// Under a roof we keep the drip/sheet effects but drop the camera-facing streaks.
		R->SetVariableBool(TEXT("User.Sheltered"), bSheltered);
	}
	if (UNiagaraComponent* S = Ensure(SnowComponent, Settings->SnowSystem))
	{
		S->SetVariableFloat(TEXT("User.Intensity"), Snow);
		S->SetVariableVec3(TEXT("User.Wind"), Wind);
		S->SetVariableBool(TEXT("User.Sheltered"), bSheltered);
	}
}

void URCWeatherSubsystem::TickLightning(float DeltaSeconds)
{
	const URCWeatherSettings* Settings = GetDefault<URCWeatherSettings>();
	FlashIntensity = FMath::Max(0.f, FlashIntensity - DeltaSeconds * 6.f);
	FlashBudget = FMath::Min(Settings->MaxFlashesPerSecond, FlashBudget + DeltaSeconds * Settings->MaxFlashesPerSecond);

	if (Current.LightningPerMinute <= 0.01f) return;
	LightningCooldown -= DeltaSeconds;
	if (LightningCooldown > 0.f) return;

	// Poisson process: exponential waiting time between strikes.
	const float Rate = Current.LightningPerMinute / 60.f;
	LightningCooldown = -FMath::Loge(FMath::Max(FMath::FRand(), KINDA_SMALL_NUMBER)) / Rate;
	StrikeLightning();
}

AActor* URCWeatherSubsystem::PickLightningTarget(const FVector& Around, FVector& OutStrikePoint) const
{
	UWorld* World = GetWorld();
	const float Radius = FMath::FRandRange(150.f, 1500.f) * 100.f;
	const FVector2D Dir = FVector2D(FMath::FRandRange(-1.f, 1.f), FMath::FRandRange(-1.f, 1.f)).GetSafeNormal();
	const FVector Candidate = Around + FVector(Dir * Radius, 0.f);

	// Prefer tall, conductive, exposed things near the candidate (towers, masts, a warrior on a summit holding an axe).
	TArray<FOverlapResult> Overlaps;
	World->OverlapMultiByObjectType(Overlaps, Candidate, FQuat::Identity, FCollisionObjectQueryParams(FCollisionObjectQueryParams::InitType::AllObjects),
		FCollisionShape::MakeSphere(4000.f));

	AActor* Best = nullptr;
	float BestScore = 0.f;
	for (const FOverlapResult& O : Overlaps)
	{
		AActor* A = O.GetActor();
		if (!A) continue;
		const bool bConductive = A->ActorHasTag(RCWeather::TagConductive);
		const FVector Top = A->GetComponentsBoundingBox().GetCenter() + FVector(0, 0, A->GetComponentsBoundingBox().GetExtent().Z);
		if (!IsExposedToSky(Top)) continue;
		const float Score = Top.Z * 0.001f + (bConductive ? 5.f : 0.f) + FMath::FRand();
		if (Score > BestScore) { BestScore = Score; Best = A; OutStrikePoint = Top; }
	}
	if (Best && BestScore > 3.f) return Best;

	// Otherwise strike the ground under the candidate.
	FHitResult Hit;
	if (World->LineTraceSingleByChannel(Hit, Candidate + FVector(0, 0, 200000), Candidate - FVector(0, 0, 200000), ECC_Visibility))
	{
		OutStrikePoint = Hit.ImpactPoint;
		return Hit.GetActor();
	}
	OutStrikePoint = Candidate;
	return nullptr;
}

void URCWeatherSubsystem::StrikeLightning()
{
	ACharacter* Player = UGameplayStatics::GetPlayerCharacter(GetWorld(), 0);
	if (!Player) return;
	const URCWeatherSettings* Settings = GetDefault<URCWeatherSettings>();

	FVector Point;
	AActor* Hit = PickLightningTarget(Player->GetActorLocation(), Point);

	if (FlashBudget >= 1.f)
	{
		FlashBudget -= 1.f;
		FlashIntensity = 1.f;
	}
	if (UNiagaraSystem* Bolt = Settings->LightningSystem.LoadSynchronous())
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), Bolt, Point);
	}
	// Thunder arrives at the speed of sound (343 m/s); Unreal units are cm.
	if (USoundBase* Thunder = Settings->ThunderSound.LoadSynchronous())
	{
		const float Delay = FVector::Dist(Point, Player->GetActorLocation()) / 34300.f;
		FTimerHandle Handle;
		GetWorld()->GetTimerManager().SetTimer(Handle, FTimerDelegate::CreateWeakLambda(this, [this, Thunder, Point]()
		{
			UGameplayStatics::PlaySoundAtLocation(GetWorld(), Thunder, Point);
		}), FMath::Max(Delay, 0.01f), false);
	}

	if (Hit)
	{
		if (Hit->Implements<URCFlammable>())
		{
			IRCFlammable::Execute_TryIgnite(Hit, Current.Wetness, nullptr);
		}
		if (Hit->Implements<URCDamageable>())
		{
			FRCDamage D;
			D.Amount = 80.f;
			D.PoiseDamage = 100.f;
			D.Type = ERCDamageType::Lightning;
			IRCDamageable::Execute_ReceiveRCDamage(Hit, D);
		}
	}
	// Splash: characters standing within 6 m of the strike take side-flash damage.
	TArray<FOverlapResult> Near;
	GetWorld()->OverlapMultiByChannel(Near, Point, FQuat::Identity, ECC_Pawn, FCollisionShape::MakeSphere(600.f));
	for (const FOverlapResult& O : Near)
	{
		AActor* A = O.GetActor();
		if (A && A != Hit && A->Implements<URCDamageable>())
		{
			FRCDamage D;
			D.Amount = 25.f;
			D.PoiseDamage = 60.f;
			D.Type = ERCDamageType::Lightning;
			D.HitDirection = (A->GetActorLocation() - Point).GetSafeNormal();
			IRCDamageable::Execute_ReceiveRCDamage(A, D);
		}
	}
	OnLightningStrike.Broadcast(Point, Hit);
}

float URCWeatherSubsystem::GetTemperature() const
{
	const URCWeatherSettings* Settings = GetDefault<URCWeatherSettings>();
	float Base = 8.f;
	float Hour = 12.f;
	if (WorldState)
	{
		const int32 S = static_cast<int32>(WorldState->GetSeason());
		const int32 NextS = (S + 1) % 4;
		Base = FMath::Lerp(Settings->SeasonTemperatures[S], Settings->SeasonTemperatures[NextS], FMath::SmoothStep(0.6f, 1.f, WorldState->GetSeasonProgress()));
		Hour = WorldState->GetHour();
	}
	// Day/night swing peaking at 15:00; clouds damp the swing.
	const float Swing = 4.f * (1.f - 0.6f * Current.CloudCoverage);
	const float DayCurve = FMath::Cos((Hour - 15.f) / 24.f * 2.f * PI);
	return Base + Current.TemperatureOffset + Swing * DayCurve - 0.15f * Current.WindSpeed;
}

FVector URCWeatherSubsystem::GetWindAt(const FVector& Location) const
{
	const float T = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
	// Gusts: low-frequency noise travelling downwind, stronger with higher mean wind.
	const FVector2D Dir = Current.WindDirection;
	const float Along = FVector2D::DotProduct(FVector2D(Location.X, Location.Y) * 0.0005f, Dir);
	const float Gust = FMath::PerlinNoise1D(Along - T * 0.35f) * 0.5f + 0.5f;
	const float Speed = Current.WindSpeed * (0.75f + 0.6f * Gust);
	// Wind grows with altitude (cliffs and towers are windier): +25% per 100 m above sea level.
	const float AltitudeScale = 1.f + FMath::Max(Location.Z, 0.f) / 10000.f * 0.25f;
	return FVector(Dir * Speed * AltitudeScale, 0.f);
}

float URCWeatherSubsystem::GetSurfaceGrip(bool bIcySurface) const
{
	float Grip = FMath::Lerp(1.f, 0.45f, Current.Wetness);
	if (bIcySurface || (Current.SnowCover > 0.3f && GetTemperature() < -2.f)) Grip = FMath::Min(Grip, 0.3f);
	return Grip;
}

float URCWeatherSubsystem::GetVisibilityMultiplier() const
{
	float V = 1.f;
	V *= 1.f - 0.6f * FMath::Clamp(Current.FogDensity * 8.f, 0.f, 1.f);
	V *= 1.f - (Current.PrecipitationType == ERCPrecipitation::Snow ? 0.7f : 0.35f) * Current.Precipitation * FMath::Clamp(Current.WindSpeed / 15.f, 0.4f, 1.f);
	if (IsNight()) V *= 0.55f + 0.25f * (1.f - Current.CloudCoverage) + 0.2f * Current.Aurora;
	return FMath::Max(V, MinVisibility);
}

float URCWeatherSubsystem::GetNoiseMultiplier() const
{
	const float RainMask = Current.PrecipitationType == ERCPrecipitation::Rain ? 0.55f * Current.Precipitation : 0.f;
	const float WindMask = FMath::Clamp(Current.WindSpeed / 25.f, 0.f, 0.4f);
	const float SnowMuffle = 0.25f * Current.SnowCover;
	return FMath::Clamp(1.f - RainMask - WindMask - SnowMuffle, 0.3f, 1.f);
}

float URCWeatherSubsystem::GetColdDamagePerSecond(float Insulation, bool bSheltered, bool bNearFire) const
{
	if (bNearFire) return 0.f;
	// Wind chill and wet clothing both lower the felt temperature.
	const float Felt = GetTemperature() - (bSheltered ? 0.f : 0.3f * Current.WindSpeed) - 6.f * Current.Wetness * (bSheltered ? 0.3f : 1.f);
	const float Threshold = -2.f - 18.f * FMath::Clamp(Insulation, 0.f, 1.f);
	return Felt < Threshold ? (Threshold - Felt) * 0.15f : 0.f;
}

bool URCWeatherSubsystem::IsExposedToSky(const FVector& Location) const
{
	UWorld* World = GetWorld();
	if (!World) return true;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(RCSkyExposure), false);
	if (ACharacter* Player = UGameplayStatics::GetPlayerCharacter(World, 0)) Params.AddIgnoredActor(Player);
	// A 300 m upward trace is enough to find roofs, overhangs and cliff shelves.
	return !World->LineTraceTestByChannel(Location, Location + FVector(0, 0, 30000), ECC_Visibility, Params);
}

bool URCWeatherSubsystem::IsNight() const
{
	const float H = WorldState ? WorldState->GetHour() : 12.f;
	return H < 6.f || H > 20.5f;
}

void URCWeatherSubsystem::WriteToSave(URCSaveGame& Save) const
{
	Save.Weather = Current;
	Save.WeatherTarget = TargetType;
}

void URCWeatherSubsystem::ReadFromSave(const URCSaveGame& Save)
{
	Current = Save.Weather;
	RequestWeather(Save.WeatherTarget, 0.01f);
}
