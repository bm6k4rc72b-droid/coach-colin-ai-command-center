// Raven's Creed: Bjorn, the player character.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/RCTypes.h"
#include "Social/RCNPCComponent.h"
#include "RCPlayerCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UInputAction;
class UInputMappingContext;
class UMotionWarpingComponent;
class URCParkourComponent;
class URCCombatComponent;
class URCRavenSightComponent;
struct FInputActionValue;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FRCOnInteractTargetChanged, AActor*, Target, const TArray<ERCInteraction>&, Options);

UCLASS()
class RAVENSCREED_API ARCPlayerCharacter : public ACharacter, public IRCDamageable
{
	GENERATED_BODY()

public:
	ARCPlayerCharacter();

	// --- components ---
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera") TObjectPtr<USpringArmComponent> CameraBoom;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera") TObjectPtr<UCameraComponent> FollowCamera;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Traversal") TObjectPtr<UMotionWarpingComponent> MotionWarping;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Traversal") TObjectPtr<URCParkourComponent> Parkour;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Combat") TObjectPtr<URCCombatComponent> Combat;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Senses") TObjectPtr<URCRavenSightComponent> RavenSight;

	// --- input (assign in the Blueprint subclass) ---
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputMappingContext> DefaultContext;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> MoveAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> LookAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> JumpAction;      // also climb/vault (context)
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> SprintAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> CrouchAction;    // stealth stance
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> LightAttackAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> HeavyAttackAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> BlockAction;     // hold = block, tap = parry
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> DodgeAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> AssassinateAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> InteractAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> RavenSightAction;

	// --- stats ---
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats") float MaxHealth = 200.f;
	UPROPERTY(BlueprintReadOnly, Category = "Stats") float Health = 200.f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats") float MaxStamina = 100.f;
	UPROPERTY(BlueprintReadOnly, Category = "Stats") float Stamina = 100.f;

	/** 0..1 from worn gear (furs ~0.9, waxed leather ~0.5). Feeds cold exposure. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats") float Insulation = 0.6f;

	UPROPERTY(BlueprintReadOnly, Category = "Stealth") bool bStealthStance = false;

	/** Interaction trace target (NPC in front of the camera within 2.5 m). */
	UPROPERTY(BlueprintReadOnly, Category = "Interaction") TObjectPtr<AActor> InteractTarget;

	UPROPERTY(BlueprintAssignable, Category = "Interaction")
	FRCOnInteractTargetChanged OnInteractTargetChanged;

	UFUNCTION(BlueprintCallable, Category = "Stats")
	bool ConsumeStamina(float Amount);

	/** Performs an interaction from the radial menu (UI calls this with the chosen option). */
	UFUNCTION(BlueprintCallable, Category = "Interaction")
	void PerformInteraction(ERCInteraction Option);

	/** How loud Bjorn is right now (0..1), before weather masking. AI hearing reads this. */
	UFUNCTION(BlueprintPure, Category = "Stealth")
	float GetNoiseLevel() const;

	virtual void ReceiveRCDamage_Implementation(const FRCDamage& Damage) override;
	virtual bool IsAlive_Implementation() const override { return Health > 0.f; }

protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	void Move(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);
	void JumpOrTraverse();
	void SprintStart();
	void SprintStop();
	void ToggleStealth();
	void Interact();

private:
	void UpdateInteractTarget();
	void TickWeatherExposure(float DeltaSeconds);

	float StaminaRegenDelay = 0.f;
	float ExposureTimer = 0.f;
	bool bSprinting = false;
};
