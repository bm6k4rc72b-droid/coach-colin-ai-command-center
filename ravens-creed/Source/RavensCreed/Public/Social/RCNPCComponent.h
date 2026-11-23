// Raven's Creed: per-NPC brain glue. Identity, schedule, utility-driven activity choice and the interaction menu.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Engine/DataAsset.h"
#include "Social/RCSocialTypes.h"
#include "RCNPCComponent.generated.h"

class URCDialogueAsset;
class URCSocialSubsystem;
class URCWeatherSubsystem;
class URCWorldStateSubsystem;

UENUM(BlueprintType)
enum class ERCInteraction : uint8
{
	Talk, Follow, Pickpocket, Recruit, Bribe, Intimidate, Assassinate, Trade
};

/** One block of an NPC's day. The utility layer may override it (shelter from storms, flee danger, mourn). */
USTRUCT(BlueprintType)
struct FRCScheduleEntry
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Schedule", meta = (ClampMin = 0, ClampMax = 24))
	float StartHour = 8.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Schedule", meta = (ClampMin = 0, ClampMax = 24))
	float EndHour = 17.f;

	/** Activity name read by the behaviour tree / StateTree (Work, Eat, Sleep, Pray, Socialise, Patrol, Trade). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Schedule")
	FName Activity = TEXT("Work");

	/** Matches ARCActivitySpot::SpotTag in the level: "Smithy_Skaldby", "Hall_Valdrheim_Benches". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Schedule")
	FName SpotTag;

	/** Outdoor activities are dropped in heavy weather unless this is a duty (guards, sailors). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Schedule")
	bool bOutdoors = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Schedule")
	bool bDuty = false;
};

UCLASS(BlueprintType)
class RAVENSCREED_API URCScheduleAsset : public UPrimaryDataAsset
{
	GENERATED_BODY()
public:
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Schedule")
	TArray<FRCScheduleEntry> Entries;

	/** Optional winter variant (shorter outdoor hours). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Schedule")
	TArray<FRCScheduleEntry> WinterEntries;
};

/** Needs drive the utility layer. 0 = satisfied, 1 = urgent. */
USTRUCT(BlueprintType)
struct FRCNeeds
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Needs") float Hunger = 0.2f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Needs") float Rest = 0.2f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Needs") float Social = 0.3f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Needs") float Warmth = 0.f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Needs") float Safety = 0.f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnActivityChanged, FName, Activity, FName, SpotTag);

UCLASS(ClassGroup = (RavensCreed), meta = (BlueprintSpawnableComponent))
class RAVENSCREED_API URCNPCComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	URCNPCComponent();

	// --- identity (defaults for the persistent record) ---
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Identity")
	FName NPCId;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Identity")
	FText DisplayName;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Identity")
	FName Faction;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Identity")
	FName HomeRegion = TEXT("WesternFjords");

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Identity")
	FRCPersonality Personality;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Identity")
	TArray<FRCBond> DefaultBonds;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Identity")
	float StartingOpinion = 0.f;

	// --- content ---
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Content")
	TObjectPtr<URCDialogueAsset> Dialogue;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Content")
	TObjectPtr<URCScheduleAsset> Schedule;

	/** Silver carried; pickpocketing takes a share of it (and any quest items flagged as pocketable). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Content")
	int32 Silver = 12;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Content")
	bool bRecruitable = false;

	/** Essential NPCs cannot be killed before their story flag clears (avoids soft-locks; the knife is stopped by a companion). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Content")
	FName EssentialUntilFlag;

	// --- live state ---
	UPROPERTY(BlueprintReadOnly, Category = "State")
	FRCNeeds Needs;

	UPROPERTY(BlueprintReadOnly, Category = "State")
	FName CurrentActivity;

	UPROPERTY(BlueprintReadOnly, Category = "State")
	FName CurrentSpotTag;

	/** 0..1 suspicion of the player (stealth). Raised by sight, noise and witnessed acts. */
	UPROPERTY(BlueprintReadOnly, Category = "State")
	float Suspicion = 0.f;

	UPROPERTY(BlueprintAssignable, Category = "State")
	FRCOnActivityChanged OnActivityChanged;

	// --- API ---
	UFUNCTION(BlueprintCallable, Category = "Interaction")
	TArray<ERCInteraction> GetInteractionOptions(const APawn* Player) const;

	/** Chance in 0..1 shown in the UI before the attempt. */
	UFUNCTION(BlueprintPure, Category = "Interaction")
	float GetPickpocketChance(const APawn* Player) const;

	/** Rolls the chance; on success transfers silver; on failure reports a public theft and raises suspicion. */
	UFUNCTION(BlueprintCallable, Category = "Interaction")
	bool TryPickpocket(APawn* Player, int32& OutSilver);

	UFUNCTION(BlueprintPure, Category = "Interaction")
	bool CanBeKilled() const;

	UFUNCTION(BlueprintPure, Category = "State")
	bool IsAwake() const { return CurrentActivity != TEXT("Sleep") && !bDead; }

	UFUNCTION(BlueprintPure, Category = "State")
	bool IsDead() const { return bDead; }

	/** Effective sight range in cm right now (weather, night, alertness). AI perception config reads this. */
	UFUNCTION(BlueprintPure, Category = "State")
	float GetSightRange() const;

	void ReactToWitnessedEvent(const FRCSocialEvent& Event);
	void OnRecordedDead();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	void UpdateNeeds(float DeltaHours);
	void ChooseActivity();
	const FRCScheduleEntry* FindScheduledEntry(float Hour) const;
	void PushToBlackboard();

	UPROPERTY()
	TObjectPtr<URCSocialSubsystem> Social;

	UPROPERTY()
	TObjectPtr<URCWeatherSubsystem> Weather;

	UPROPERTY()
	TObjectPtr<URCWorldStateSubsystem> WorldState;

	float ThinkTimer = 0.f;
	float LastHour = -1.f;
	bool bDead = false;

	static constexpr float BaseSight = 3000.f;
	static constexpr float ThinkInterval = 2.f;
};
