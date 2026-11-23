#include "Social/RCNPCCharacter.h"
#include "Social/RCNPCComponent.h"
#include "Social/RCSocialSubsystem.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"

ARCNPCCharacter::ARCNPCCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	NPC = CreateDefaultSubobject<URCNPCComponent>(TEXT("NPC"));
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
}

void ARCNPCCharacter::BeginPlay()
{
	Super::BeginPlay();
	Health = MaxHealth;
	Poise = MaxPoise;
}

void ARCNPCCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Poise = FMath::Min(MaxPoise, Poise + DeltaSeconds * 8.f);
}

void ARCNPCCharacter::ReceiveRCDamage_Implementation(const FRCDamage& Damage)
{
	if (Health <= 0.f) return;
	if (!NPC->CanBeKilled() && Health - Damage.Amount <= 0.f)
	{
		Health = 1.f; // essential: knocked down, not killed
		return;
	}
	Health = Damage.bAssassination ? 0.f : Health - Damage.Amount;
	Poise -= Damage.PoiseDamage;
	if (Poise <= 0.f && StaggerMontage)
	{
		PlayAnimMontage(StaggerMontage);
		Poise = MaxPoise;
	}
	if (Health <= 0.f) Die(Damage);
}

void ARCNPCCharacter::Die(const FRCDamage& Killing)
{
	const bool bByPlayer = Killing.Instigator && Killing.Instigator->IsA<ACharacter>() && Cast<ACharacter>(Killing.Instigator)->IsPlayerControlled();
	const FName Killer = bByPlayer ? FName(TEXT("Player")) : (Killing.Type == ERCDamageType::Lightning ? FName(TEXT("Storm")) : NAME_None);

	if (URCSocialSubsystem* Social = GetWorld()->GetSubsystem<URCSocialSubsystem>())
	{
		int32 Witnesses = 0;
		if (bByPlayer)
		{
			FRCSocialEvent E;
			E.Kind = ERCMemoryKind::Killed;
			E.Victim = NPC->NPCId;
			E.Location = GetActorLocation();
			E.Severity = Killing.bAssassination ? 0.7f : 1.f;
			Witnesses = Social->ReportEvent(E);
		}
		Social->NotifyNPCKilled(NPC->NPCId, Killer, Witnesses > 0);
	}

	GetCharacterMovement()->DisableMovement();
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	GetMesh()->SetCollisionProfileName(TEXT("Ragdoll"));
	GetMesh()->SetSimulatePhysics(true);
	if (!Killing.HitDirection.IsNearlyZero()) GetMesh()->AddImpulse(Killing.HitDirection * 6000.f, NAME_None, true);
	DetachFromControllerPendingDestroy();
}
