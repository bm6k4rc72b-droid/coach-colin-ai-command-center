// Raven's Creed: melee combat, parry, dodge, poise and assassinations.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Engine/DataAsset.h"
#include "Core/RCTypes.h"
#include "RCCombatComponent.generated.h"

class UAnimMontage;
class ACharacter;

UENUM(BlueprintType)
enum class ERCWeaponClass : uint8 { DaneAxe, Seax, DualAxes, Spear, Sword, Shield, Bow };

UCLASS(BlueprintType)
class RAVENSCREED_API URCWeaponData : public UPrimaryDataAsset
{
	GENERATED_BODY()
public:
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") FText DisplayName;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") ERCWeaponClass Class = ERCWeaponClass::DaneAxe;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") float LightDamage = 18.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") float HeavyDamage = 38.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") float PoiseDamage = 20.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") float Reach = 170.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") float LightStamina = 8.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") float HeavyStamina = 20.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") ERCDamageType DamageType = ERCDamageType::Slash;
	/** Montage with sections Light1..LightN; combo index selects the section. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") TObjectPtr<UAnimMontage> LightCombo;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") TObjectPtr<UAnimMontage> HeavyAttack;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") int32 ComboLength = 4;
	/** Socket names on the weapon mesh for the hit sweep. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") FName TraceStartSocket = TEXT("Base");
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Weapon") FName TraceEndSocket = TEXT("Tip");
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnAssassination, AActor*, Victim, bool, bWitnessed);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FRCOnPerfectParry);

UCLASS(ClassGroup = (RavensCreed), meta = (BlueprintSpawnableComponent))
class RAVENSCREED_API URCCombatComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	URCCombatComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat") TObjectPtr<URCWeaponData> Weapon;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat") bool bHasShield = true;

	UPROPERTY(EditAnywhere, Category = "Combat|Animation") TObjectPtr<UAnimMontage> DodgeMontage;
	UPROPERTY(EditAnywhere, Category = "Combat|Animation") TObjectPtr<UAnimMontage> ParryMontage;
	UPROPERTY(EditAnywhere, Category = "Combat|Animation") TObjectPtr<UAnimMontage> AssassinateGroundMontage;
	UPROPERTY(EditAnywhere, Category = "Combat|Animation") TObjectPtr<UAnimMontage> AssassinateAirMontage;

	UPROPERTY(EditAnywhere, Category = "Combat|Tuning") float ParryWindow = 0.2f;
	UPROPERTY(EditAnywhere, Category = "Combat|Tuning") float DodgeIFrames = 0.35f;
	UPROPERTY(EditAnywhere, Category = "Combat|Tuning") float DodgeStamina = 15.f;
	UPROPERTY(EditAnywhere, Category = "Combat|Tuning") float DodgeImpulse = 900.f;
	UPROPERTY(EditAnywhere, Category = "Combat|Tuning") float AssassinateRange = 160.f;
	UPROPERTY(EditAnywhere, Category = "Combat|Tuning") float AirAssassinateHeight = 250.f;
	UPROPERTY(EditAnywhere, Category = "Combat|Tuning") float BlockReduction = 0.75f;

	UFUNCTION(BlueprintCallable, Category = "Combat") void LightAttack();
	UFUNCTION(BlueprintCallable, Category = "Combat") void HeavyAttack();
	UFUNCTION(BlueprintCallable, Category = "Combat") void BlockPressed();
	UFUNCTION(BlueprintCallable, Category = "Combat") void BlockReleased();
	UFUNCTION(BlueprintCallable, Category = "Combat") void Dodge();
	UFUNCTION(BlueprintCallable, Category = "Combat") void TryAssassinate();

	/** Anim notify state on attack montages calls these to open/close the damage window. */
	UFUNCTION(BlueprintCallable, Category = "Combat") void BeginHitWindow(bool bHeavy);
	UFUNCTION(BlueprintCallable, Category = "Combat") void EndHitWindow();
	/** Anim notify near the end of each combo section: input after this point chains the next section. */
	UFUNCTION(BlueprintCallable, Category = "Combat") void OpenComboWindow();

	/** Applies block, parry and i-frames to incoming damage; returns the damage that gets through. */
	float FilterIncomingDamage(const FRCDamage& Incoming);

	UFUNCTION(BlueprintPure, Category = "Combat") bool IsAttacking() const { return bAttacking; }

	/** Can the actor be assassinated right now? Requires the victim to be unaware (low suspicion) and approached from behind or above. */
	UFUNCTION(BlueprintPure, Category = "Combat") bool CanAssassinate(const AActor* Victim, bool& bAir) const;

	UPROPERTY(BlueprintAssignable, Category = "Combat") FRCOnAssassination OnAssassination;
	UPROPERTY(BlueprintAssignable, Category = "Combat") FRCOnPerfectParry OnPerfectParry;

protected:
	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	void SweepWeapon();
	AActor* FindAssassinationTarget(bool& bAir) const;
	bool Spend(float Amount) const;

	UPROPERTY() TObjectPtr<ACharacter> Character;
	TSet<TWeakObjectPtr<AActor>> HitThisSwing;

	int32 ComboIndex = 0;
	bool bAttacking = false;
	bool bComboWindow = false;
	bool bQueuedLight = false;
	bool bHitWindow = false;
	bool bHeavyWindow = false;
	bool bBlocking = false;
	float ParryTimer = 0.f;
	float IFrameTimer = 0.f;
	FVector LastStart, LastEnd;
};
