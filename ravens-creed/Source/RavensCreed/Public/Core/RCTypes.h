// Raven's Creed: shared enums and structs used across gameplay systems.
#pragma once

#include "CoreMinimal.h"
#include "RCTypes.generated.h"

class URCSaveGame;

/** The four alignment axes ("the four winds"). Each runs -100..100. */
UENUM(BlueprintType)
enum class ERCAlignmentAxis : uint8
{
	Honor,     // + Oathkeeper / - Oathbreaker
	Cunning,   // + Night-Fox  / - Open Blade
	Piety,     // + God-Touched / - Godless
	Ambition,  // + Ring-Giver / - Wanderer
	Count UMETA(Hidden)
};
ENUM_RANGE_BY_COUNT(ERCAlignmentAxis, ERCAlignmentAxis::Count);

USTRUCT(BlueprintType)
struct FRCAlignmentDelta
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Alignment")
	ERCAlignmentAxis Axis = ERCAlignmentAxis::Honor;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Alignment")
	float Amount = 0.f;
};

UENUM(BlueprintType)
enum class ERCCompanionState : uint8
{
	Unmet,
	Recruited,
	Left,
	Dead,
	Betrayed
};

/** Damage types. Weather-driven damage (cold, lightning) uses the same path as weapons. */
UENUM(BlueprintType)
enum class ERCDamageType : uint8
{
	Slash, Blunt, Pierce, Fire, Cold, Lightning, Fall
};

USTRUCT(BlueprintType)
struct FRCDamage
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Damage")
	float Amount = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Damage")
	float PoiseDamage = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Damage")
	ERCDamageType Type = ERCDamageType::Slash;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Damage")
	TObjectPtr<AActor> Instigator = nullptr;

	/** Assassinations kill outright and are reported to the social simulation as unseen if nobody witnessed them. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Damage")
	bool bAssassination = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Damage")
	FVector HitDirection = FVector::ZeroVector;
};

/** One line in the consequence ledger: used for debugging branches and for ending slides. */
USTRUCT(BlueprintType)
struct FRCConsequenceRecord
{
	GENERATED_BODY()

	UPROPERTY(SaveGame, BlueprintReadOnly, Category = "Consequence")
	FName Flag;

	UPROPERTY(SaveGame, BlueprintReadOnly, Category = "Consequence")
	int32 Value = 0;

	UPROPERTY(SaveGame, BlueprintReadOnly, Category = "Consequence")
	FName Source;

	UPROPERTY(SaveGame, BlueprintReadOnly, Category = "Consequence")
	int32 Day = 0;
};

/** Anything that persists into a save implements this. Subsystems are gathered by URCSaveSubsystem. */
UINTERFACE(MinimalAPI, NotBlueprintable)
class URCSaveable : public UInterface
{
	GENERATED_BODY()
};

class IRCSaveable
{
	GENERATED_BODY()
public:
	virtual void WriteToSave(URCSaveGame& Save) const = 0;
	virtual void ReadFromSave(const URCSaveGame& Save) = 0;
};

/** Anything that can take damage from weapons, weather or falls. */
UINTERFACE(MinimalAPI, BlueprintType)
class URCDamageable : public UInterface
{
	GENERATED_BODY()
};

class IRCDamageable
{
	GENERATED_BODY()
public:
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Damage")
	void ReceiveRCDamage(const FRCDamage& Damage);

	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Damage")
	bool IsAlive() const;
};

/** Thatch, sails, carts: things lightning and fire arrows can ignite. */
UINTERFACE(MinimalAPI, BlueprintType)
class URCFlammable : public UInterface
{
	GENERATED_BODY()
};

class IRCFlammable
{
	GENERATED_BODY()
public:
	/** Wetness 0..1 from the weather system; implementations should refuse to ignite when soaked. */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Fire")
	bool TryIgnite(float SurfaceWetness, AActor* Source);
};
