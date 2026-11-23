// Raven's Creed: free-climbing, vault, mantle, ledge climb-up and Raven's Plunge, with weather-dependent grip.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "RCParkourComponent.generated.h"

class ACharacter;
class UAnimMontage;
class URCWeatherSubsystem;

UENUM(BlueprintType)
enum class ERCTraversal : uint8 { None, Vault, Mantle, ClimbStart, ClimbUp, Plunge };

/** Result of the obstacle scan in front of the character. */
USTRUCT(BlueprintType)
struct FRCObstacle
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Parkour") bool bFound = false;
	UPROPERTY(BlueprintReadOnly, Category = "Parkour") FVector WallPoint = FVector::ZeroVector;
	UPROPERTY(BlueprintReadOnly, Category = "Parkour") FVector WallNormal = FVector::ZeroVector;
	UPROPERTY(BlueprintReadOnly, Category = "Parkour") FVector LedgePoint = FVector::ZeroVector;
	UPROPERTY(BlueprintReadOnly, Category = "Parkour") float Height = 0.f;   // ledge height above the feet, cm
	UPROPERTY(BlueprintReadOnly, Category = "Parkour") float Depth = 0.f;    // thickness of the obstacle, cm (for vaults)
	UPROPERTY(BlueprintReadOnly, Category = "Parkour") bool bClimbable = false;
	UPROPERTY(BlueprintReadOnly, Category = "Parkour") bool bIcy = false;
};

UCLASS(ClassGroup = (RavensCreed), meta = (BlueprintSpawnableComponent))
class RAVENSCREED_API URCParkourComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	URCParkourComponent();

	/** Context action: vault, mantle, start climbing or plunge. Returns false when nothing applies (caller jumps). */
	UFUNCTION(BlueprintCallable, Category = "Parkour")
	bool TryTraverse();

	/** 2D input while climbing: X = sideways, Y = up/down. */
	void ClimbInput(const FVector2D& Axis);

	UFUNCTION(BlueprintCallable, Category = "Parkour")
	void StopClimbing();

	/** Knocked off the wall (lightning, heavy hit, slip). */
	UFUNCTION(BlueprintCallable, Category = "Parkour")
	void ForceFall();

	UFUNCTION(BlueprintPure, Category = "Parkour")
	bool IsClimbing() const { return bClimbing; }

	UFUNCTION(BlueprintCallable, Category = "Parkour")
	FRCObstacle ScanObstacle() const;

	// --- tuning ---
	UPROPERTY(EditAnywhere, Category = "Parkour|Tuning") float ScanDistance = 90.f;
	UPROPERTY(EditAnywhere, Category = "Parkour|Tuning") float MaxVaultHeight = 120.f;
	UPROPERTY(EditAnywhere, Category = "Parkour|Tuning") float MaxVaultDepth = 80.f;
	UPROPERTY(EditAnywhere, Category = "Parkour|Tuning") float MaxMantleHeight = 230.f;
	UPROPERTY(EditAnywhere, Category = "Parkour|Tuning") float ClimbSpeed = 90.f;
	UPROPERTY(EditAnywhere, Category = "Parkour|Tuning") float ClimbStaminaPerSecond = 6.f;
	/** Slip checks happen once per second while climbing below this stamina fraction on wet rock. */
	UPROPERTY(EditAnywhere, Category = "Parkour|Tuning") float SlipStaminaThreshold = 0.35f;
	/** Plunge targets are actors tagged "PlungeTarget" (hay carts, deep water volumes, snowdrifts). */
	UPROPERTY(EditAnywhere, Category = "Parkour|Tuning") float PlungeSearchDepth = 4000.f;

	// --- animation (root-motion montages with a "ParkourTarget" motion-warp window) ---
	UPROPERTY(EditAnywhere, Category = "Parkour|Animation") TObjectPtr<UAnimMontage> VaultMontage;
	UPROPERTY(EditAnywhere, Category = "Parkour|Animation") TObjectPtr<UAnimMontage> MantleMontage;
	UPROPERTY(EditAnywhere, Category = "Parkour|Animation") TObjectPtr<UAnimMontage> ClimbUpMontage;
	UPROPERTY(EditAnywhere, Category = "Parkour|Animation") TObjectPtr<UAnimMontage> PlungeMontage;
	UPROPERTY(EditAnywhere, Category = "Parkour|Animation") TObjectPtr<UAnimMontage> SlipMontage;

	static const FName WarpTargetName;

protected:
	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	void StartClimbing(const FRCObstacle& Obstacle);
	bool PlayWarped(UAnimMontage* Montage, const FVector& Location, const FRotator& Rotation);
	bool TryPlunge();
	bool TraceWall(FVector& OutPoint, FVector& OutNormal) const;
	float CurrentGrip(bool bIcy) const;

	UPROPERTY()
	TObjectPtr<ACharacter> Character;

	UPROPERTY()
	TObjectPtr<URCWeatherSubsystem> Weather;

	bool bClimbing = false;
	bool bOnIce = false;
	FVector WallNormal = FVector::ZeroVector;
	FVector2D PendingInput = FVector2D::ZeroVector;
	float SlipTimer = 0.f;
};
