// Raven's Creed: the social simulation. Witnesses, memory, rumour, opinion, deaths and their ripples.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Core/RCTypes.h"
#include "Social/RCSocialTypes.h"
#include "RCSocialSubsystem.generated.h"

class URCNPCComponent;
class URCWorldStateSubsystem;
class URCWeatherSubsystem;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnMemoryAdded, FName, NPCId, const FRCMemory&, Memory);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnNPCDied, FName, NPCId, FName, KilledBy);

UCLASS()
class RAVENSCREED_API URCSocialSubsystem : public UWorldSubsystem, public IRCSaveable
{
	GENERATED_BODY()

public:
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;

	// --- registry ---
	/** Called by URCNPCComponent on BeginPlay. Creates the persistent record from the component defaults the first time. */
	void RegisterNPC(URCNPCComponent* Component);
	void UnregisterNPC(URCNPCComponent* Component);

	FRCNPCRecord* FindRecord(FName NPCId);
	const FRCNPCRecord* FindRecord(FName NPCId) const;

	UFUNCTION(BlueprintCallable, Category = "Social")
	bool GetRecord(FName NPCId, FRCNPCRecord& Out) const;

	UFUNCTION(BlueprintPure, Category = "Social")
	bool IsAlive(FName NPCId) const;

	UFUNCTION(BlueprintPure, Category = "Social")
	ERCDisposition GetDisposition(FName NPCId) const;

	UFUNCTION(BlueprintPure, Category = "Social")
	bool Remembers(FName NPCId, ERCMemoryKind Kind, FName Victim = NAME_None) const;

	// --- events ---
	/**
	 * Report an act. Witnesses are NPCs within a severity-scaled radius, awake, with line of sight, scaled by weather visibility.
	 * Each witness forms a first-hand memory and adjusts opinion based on their bond with the victim and their morality.
	 * Returns the number of witnesses (0 = an unseen act, which still leaves evidence for investigations).
	 */
	UFUNCTION(BlueprintCallable, Category = "Social")
	int32 ReportEvent(const FRCSocialEvent& Event);

	/** Direct opinion change (dialogue choices, gifts, quest rewards). */
	UFUNCTION(BlueprintCallable, Category = "Social")
	void ModifyAttitude(FName NPCId, float OpinionDelta, float FearDelta = 0.f, float TrustDelta = 0.f);

	/** Marks the NPC dead forever; notifies kin and friends, writes world flags (DEAD_<Id>, KILLED_BY_PLAYER_<Id>). */
	UFUNCTION(BlueprintCallable, Category = "Social")
	void NotifyNPCKilled(FName Victim, FName Killer, bool bWitnessed);

	UFUNCTION(BlueprintCallable, Category = "Social")
	void SetRecruited(FName NPCId, bool bRecruited);

	// --- factions ---
	UFUNCTION(BlueprintPure, Category = "Social")
	float GetFactionReputation(FName Faction) const;

	UFUNCTION(BlueprintCallable, Category = "Social")
	void ModifyFactionReputation(FName Faction, float Delta);

	UPROPERTY(BlueprintAssignable, Category = "Social")
	FRCOnMemoryAdded OnMemoryAdded;

	UPROPERTY(BlueprintAssignable, Category = "Social")
	FRCOnNPCDied OnNPCDied;

	const TMap<FName, TWeakObjectPtr<URCNPCComponent>>& GetLiveNPCs() const { return Live; }

	virtual void WriteToSave(URCSaveGame& Save) const override;
	virtual void ReadFromSave(const URCSaveGame& Save) override;

private:
	UFUNCTION()
	void OnHourPassed(int32 Day, float Hour);

	void AddMemory(FRCNPCRecord& Rec, const FRCMemory& Memory);
	void ApplyMemoryToAttitude(FRCNPCRecord& Rec, const FRCMemory& Memory, float BondToVictim);
	float BondStrength(const FRCNPCRecord& From, FName To) const;
	void SpreadRumours();
	void DecayMemories();
	bool CanSee(const URCNPCComponent* Witness, const FVector& Location, float Range) const;

	TMap<FName, FRCNPCRecord> Records;
	TMap<FName, TWeakObjectPtr<URCNPCComponent>> Live;
	TMap<FName, float> FactionRep;
	int32 EventCounter = 0;

	UPROPERTY()
	TObjectPtr<URCWorldStateSubsystem> WorldState;

	UPROPERTY()
	TObjectPtr<URCWeatherSubsystem> Weather;

	/** Upper bound on memories per NPC; the weakest are forgotten first. */
	static constexpr int32 MaxMemories = 48;
};
