#include "Player/RCCombatComponent.h"
#include "Player/RCPlayerCharacter.h"
#include "Social/RCNPCComponent.h"
#include "Social/RCSocialSubsystem.h"
#include "Weather/RCWeatherSubsystem.h"
#include "Core/RCAlignmentSubsystem.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "MotionWarpingComponent.h"
#include "Engine/OverlapResult.h"

URCCombatComponent::URCCombatComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void URCCombatComponent::BeginPlay()
{
	Super::BeginPlay();
	Character = Cast<ACharacter>(GetOwner());
}

bool URCCombatComponent::Spend(float Amount) const
{
	ARCPlayerCharacter* Player = Cast<ARCPlayerCharacter>(Character);
	return !Player || Player->ConsumeStamina(Amount);
}

void URCCombatComponent::LightAttack()
{
	if (!Weapon || !Weapon->LightCombo) return;
	if (bAttacking)
	{
		// Buffered input: chains into the next section when the combo window opens.
		bQueuedLight = true;
		return;
	}
	if (!Spend(Weapon->LightStamina)) return;
	bAttacking = true;
	ComboIndex = 0;
	Character->PlayAnimMontage(Weapon->LightCombo, 1.f, FName(*FString::Printf(TEXT("Light%d"), ComboIndex + 1)));
}

void URCCombatComponent::OpenComboWindow()
{
	bComboWindow = true;
	if (bQueuedLight && Weapon && ComboIndex + 1 < Weapon->ComboLength && Spend(Weapon->LightStamina))
	{
		bQueuedLight = false;
		bComboWindow = false;
		++ComboIndex;
		Character->PlayAnimMontage(Weapon->LightCombo, 1.f, FName(*FString::Printf(TEXT("Light%d"), ComboIndex + 1)));
	}
}

void URCCombatComponent::HeavyAttack()
{
	if (!Weapon || !Weapon->HeavyAttack || bAttacking || !Spend(Weapon->HeavyStamina)) return;
	bAttacking = true;
	Character->PlayAnimMontage(Weapon->HeavyAttack);
}

void URCCombatComponent::BeginHitWindow(bool bHeavy)
{
	bHitWindow = true;
	bHeavyWindow = bHeavy;
	HitThisSwing.Reset();
	if (const USkeletalMeshComponent* Mesh = Character->GetMesh())
	{
		LastStart = Mesh->GetSocketLocation(Weapon->TraceStartSocket);
		LastEnd = Mesh->GetSocketLocation(Weapon->TraceEndSocket);
	}
}

void URCCombatComponent::EndHitWindow()
{
	bHitWindow = false;
	bAttacking = false; // recovery frames are handled by the montage blend-out; input reopens here
	bComboWindow = false;
	bQueuedLight = false;
}

void URCCombatComponent::SweepWeapon()
{
	const USkeletalMeshComponent* Mesh = Character->GetMesh();
	if (!Mesh || !Weapon) return;
	const FVector Start = Mesh->GetSocketLocation(Weapon->TraceStartSocket);
	const FVector End = Mesh->GetSocketLocation(Weapon->TraceEndSocket);

	// Sweep the blade from last frame's pose to this frame's, so fast swings never skip a target.
	TArray<FHitResult> Hits;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(RCWeaponSweep), false, Character);
	for (int32 i = 0; i <= 3; ++i)
	{
		const float T = i / 3.f;
		const FVector From = FMath::Lerp(LastStart, LastEnd, T);
		const FVector To = FMath::Lerp(Start, End, T);
		GetWorld()->SweepMultiByChannel(Hits, From, To, FQuat::Identity, ECC_Pawn, FCollisionShape::MakeSphere(8.f), Params);
		for (const FHitResult& H : Hits)
		{
			AActor* A = H.GetActor();
			if (!A || HitThisSwing.Contains(A) || !A->Implements<URCDamageable>()) continue;
			HitThisSwing.Add(A);
			FRCDamage D;
			D.Amount = bHeavyWindow ? Weapon->HeavyDamage : Weapon->LightDamage * (1.f + 0.15f * ComboIndex);
			D.PoiseDamage = Weapon->PoiseDamage * (bHeavyWindow ? 2.f : 1.f);
			D.Type = Weapon->DamageType;
			D.Instigator = Character;
			D.HitDirection = (A->GetActorLocation() - Character->GetActorLocation()).GetSafeNormal();
			IRCDamageable::Execute_ReceiveRCDamage(A, D);
		}
	}
	LastStart = Start;
	LastEnd = End;
}

void URCCombatComponent::BlockPressed()
{
	bBlocking = bHasShield;
	ParryTimer = ParryWindow;
}

void URCCombatComponent::BlockReleased()
{
	bBlocking = false;
}

void URCCombatComponent::Dodge()
{
	if (!Spend(DodgeStamina)) return;
	UCharacterMovementComponent* Move = Character->GetCharacterMovement();
	FVector Dir = Move->GetLastInputVector().GetSafeNormal2D();
	if (Dir.IsNearlyZero()) Dir = -Character->GetActorForwardVector();
	// Wet ground: dodges slide further but you keep less control (handled by friction below).
	const URCWeatherSubsystem* Weather = GetWorld()->GetSubsystem<URCWeatherSubsystem>();
	const float Grip = Weather ? Weather->GetSurfaceGrip() : 1.f;
	Move->GroundFriction = FMath::Lerp(3.f, 8.f, Grip);
	Character->LaunchCharacter(Dir * DodgeImpulse * FMath::Lerp(1.15f, 1.f, Grip), true, false);
	if (DodgeMontage) Character->PlayAnimMontage(DodgeMontage);
	IFrameTimer = DodgeIFrames;
	bAttacking = false;
}

float URCCombatComponent::FilterIncomingDamage(const FRCDamage& Incoming)
{
	if (IFrameTimer > 0.f) return 0.f;
	const bool bFromFront = !Incoming.Instigator ||
		FVector::DotProduct(Character->GetActorForwardVector(), (Incoming.Instigator->GetActorLocation() - Character->GetActorLocation()).GetSafeNormal()) > 0.3f;
	if (ParryTimer > 0.f && bFromFront)
	{
		if (ParryMontage) Character->PlayAnimMontage(ParryMontage);
		// A perfect parry breaks the attacker's poise, opening a finisher.
		if (Incoming.Instigator && Incoming.Instigator->Implements<URCDamageable>())
		{
			FRCDamage Riposte;
			Riposte.PoiseDamage = 1000.f;
			Riposte.Instigator = Character;
			IRCDamageable::Execute_ReceiveRCDamage(Incoming.Instigator, Riposte);
		}
		OnPerfectParry.Broadcast();
		return 0.f;
	}
	if (bBlocking && bFromFront)
	{
		Spend(Incoming.PoiseDamage * 0.3f);
		return Incoming.Amount * (1.f - BlockReduction);
	}
	return Incoming.Amount;
}

bool URCCombatComponent::CanAssassinate(const AActor* Victim, bool& bAir) const
{
	bAir = false;
	if (!Victim) return false;
	const URCNPCComponent* NPC = Victim->FindComponentByClass<URCNPCComponent>();
	if (!NPC || !NPC->CanBeKilled() || NPC->Suspicion > 0.6f) return false;

	const FVector Delta = Victim->GetActorLocation() - Character->GetActorLocation();
	bAir = Delta.Z < -AirAssassinateHeight && FVector::Dist2D(Victim->GetActorLocation(), Character->GetActorLocation()) < 400.f && !Character->GetCharacterMovement()->IsMovingOnGround();
	if (bAir) return true;
	if (Delta.Size() > AssassinateRange) return false;
	// From behind (or from cover while the victim looks away): the victim's forward points away from us.
	return FVector::DotProduct(Victim->GetActorForwardVector(), Delta.GetSafeNormal()) > 0.25f;
}

AActor* URCCombatComponent::FindAssassinationTarget(bool& bAir) const
{
	TArray<FOverlapResult> Overlaps;
	GetWorld()->OverlapMultiByChannel(Overlaps, Character->GetActorLocation() - FVector(0, 0, 200), FQuat::Identity, ECC_Pawn, FCollisionShape::MakeSphere(450.f));
	AActor* Best = nullptr;
	float BestDist = TNumericLimits<float>::Max();
	for (const FOverlapResult& O : Overlaps)
	{
		AActor* A = O.GetActor();
		bool bThisAir = false;
		if (!A || A == Character || !CanAssassinate(A, bThisAir)) continue;
		const float D = FVector::DistSquared(A->GetActorLocation(), Character->GetActorLocation());
		if (D < BestDist) { BestDist = D; Best = A; bAir = bThisAir; }
	}
	return Best;
}

void URCCombatComponent::TryAssassinate()
{
	bool bAir = false;
	AActor* Victim = FindAssassinationTarget(bAir);
	if (!Victim) return;

	if (UMotionWarpingComponent* Warp = Character->FindComponentByClass<UMotionWarpingComponent>())
	{
		const FVector Behind = Victim->GetActorLocation() - Victim->GetActorForwardVector() * 70.f;
		Warp->AddOrUpdateWarpTargetFromLocationAndRotation(TEXT("AssassinTarget"), bAir ? Victim->GetActorLocation() : Behind, Victim->GetActorRotation());
	}
	if (UAnimMontage* M = bAir ? AssassinateAirMontage : AssassinateGroundMontage) Character->PlayAnimMontage(M);

	FRCDamage D;
	D.bAssassination = true;
	D.Amount = 10000.f;
	D.Type = ERCDamageType::Pierce;
	D.Instigator = Character;
	IRCDamageable::Execute_ReceiveRCDamage(Victim, D);

	// Shadow work: an unseen kill nudges Cunning; witnesses are handled by the NPC's death report.
	if (URCAlignmentSubsystem* Align = GetWorld()->GetGameInstance()->GetSubsystem<URCAlignmentSubsystem>())
	{
		Align->ApplyDelta(ERCAlignmentAxis::Cunning, 1.5f, TEXT("Assassination"));
	}
	OnAssassination.Broadcast(Victim, false);
}

void URCCombatComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	ParryTimer = FMath::Max(0.f, ParryTimer - DeltaTime);
	IFrameTimer = FMath::Max(0.f, IFrameTimer - DeltaTime);
	if (bHitWindow) SweepWeapon();
	if (Character && IFrameTimer <= 0.f) Character->GetCharacterMovement()->GroundFriction = 8.f;
}
