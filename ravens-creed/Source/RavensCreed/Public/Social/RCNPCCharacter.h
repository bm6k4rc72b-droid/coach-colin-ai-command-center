// Raven's Creed: base character for every named NPC.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/RCTypes.h"
#include "RCNPCCharacter.generated.h"

class URCNPCComponent;

UCLASS()
class RAVENSCREED_API ARCNPCCharacter : public ACharacter, public IRCDamageable
{
	GENERATED_BODY()

public:
	ARCNPCCharacter();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NPC")
	TObjectPtr<URCNPCComponent> NPC;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
	float MaxHealth = 100.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
	float MaxPoise = 50.f;

	UPROPERTY(BlueprintReadOnly, Category = "NPC")
	float Health = 100.f;

	UPROPERTY(BlueprintReadOnly, Category = "NPC")
	float Poise = 50.f;

	/** Stagger animation played when poise breaks. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "NPC")
	TObjectPtr<UAnimMontage> StaggerMontage;

	virtual void ReceiveRCDamage_Implementation(const FRCDamage& Damage) override;
	virtual bool IsAlive_Implementation() const override { return Health > 0.f; }

protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	void Die(const FRCDamage& Killing);
};
