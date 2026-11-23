#include "Player/RCPlayerCharacter.h"
#include "Player/RCParkourComponent.h"
#include "Player/RCCombatComponent.h"
#include "Player/RCRavenSightComponent.h"
#include "Social/RCNPCComponent.h"
#include "Social/RCSocialSubsystem.h"
#include "Dialogue/RCDialogueManager.h"
#include "Weather/RCWeatherSubsystem.h"
#include "Core/RCWorldStateSubsystem.h"

#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputActionValue.h"
#include "MotionWarpingComponent.h"

ARCPlayerCharacter::ARCPlayerCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->TargetArmLength = 380.f;
	CameraBoom->SocketOffset = FVector(0.f, 55.f, 65.f); // over-the-shoulder framing
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bEnableCameraLag = true;
	CameraBoom->CameraLagSpeed = 12.f;
	CameraBoom->ProbeSize = 14.f; // collision probe keeps the camera out of walls and thatch

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;

	MotionWarping = CreateDefaultSubobject<UMotionWarpingComponent>(TEXT("MotionWarping"));
	Parkour = CreateDefaultSubobject<URCParkourComponent>(TEXT("Parkour"));
	Combat = CreateDefaultSubobject<URCCombatComponent>(TEXT("Combat"));
	RavenSight = CreateDefaultSubobject<URCRavenSightComponent>(TEXT("RavenSight"));

	bUseControllerRotationYaw = false;
	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->bOrientRotationToMovement = true;
	Move->RotationRate = FRotator(0.f, 540.f, 0.f);
	Move->MaxWalkSpeed = 420.f;
	Move->MaxWalkSpeedCrouched = 220.f;
	Move->GetNavAgentPropertiesRef().bCanCrouch = true;
	Move->JumpZVelocity = 520.f;
	Move->AirControl = 0.25f;
}

void ARCPlayerCharacter::BeginPlay()
{
	Super::BeginPlay();
	Health = MaxHealth;
	Stamina = MaxStamina;
	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (DefaultContext) Sub->AddMappingContext(DefaultContext, 0);
		}
	}
}

void ARCPlayerCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	UEnhancedInputComponent* In = CastChecked<UEnhancedInputComponent>(PlayerInputComponent);
	if (MoveAction) In->BindAction(MoveAction, ETriggerEvent::Triggered, this, &ARCPlayerCharacter::Move);
	if (LookAction) In->BindAction(LookAction, ETriggerEvent::Triggered, this, &ARCPlayerCharacter::Look);
	if (JumpAction) In->BindAction(JumpAction, ETriggerEvent::Started, this, &ARCPlayerCharacter::JumpOrTraverse);
	if (JumpAction) In->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
	if (SprintAction) In->BindAction(SprintAction, ETriggerEvent::Started, this, &ARCPlayerCharacter::SprintStart);
	if (SprintAction) In->BindAction(SprintAction, ETriggerEvent::Completed, this, &ARCPlayerCharacter::SprintStop);
	if (CrouchAction) In->BindAction(CrouchAction, ETriggerEvent::Started, this, &ARCPlayerCharacter::ToggleStealth);
	if (InteractAction) In->BindAction(InteractAction, ETriggerEvent::Started, this, &ARCPlayerCharacter::Interact);
	if (LightAttackAction) In->BindAction(LightAttackAction, ETriggerEvent::Started, Combat.Get(), &URCCombatComponent::LightAttack);
	if (HeavyAttackAction) In->BindAction(HeavyAttackAction, ETriggerEvent::Started, Combat.Get(), &URCCombatComponent::HeavyAttack);
	if (BlockAction) In->BindAction(BlockAction, ETriggerEvent::Started, Combat.Get(), &URCCombatComponent::BlockPressed);
	if (BlockAction) In->BindAction(BlockAction, ETriggerEvent::Completed, Combat.Get(), &URCCombatComponent::BlockReleased);
	if (DodgeAction) In->BindAction(DodgeAction, ETriggerEvent::Started, Combat.Get(), &URCCombatComponent::Dodge);
	if (AssassinateAction) In->BindAction(AssassinateAction, ETriggerEvent::Started, Combat.Get(), &URCCombatComponent::TryAssassinate);
	if (RavenSightAction) In->BindAction(RavenSightAction, ETriggerEvent::Started, RavenSight.Get(), &URCRavenSightComponent::Pulse);
}

void ARCPlayerCharacter::Move(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	if (Parkour->IsClimbing())
	{
		Parkour->ClimbInput(Axis);
		return;
	}
	const FRotator Yaw(0.f, GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), Axis.Y);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), Axis.X);
}

void ARCPlayerCharacter::Look(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X);
	AddControllerPitchInput(Axis.Y);
}

void ARCPlayerCharacter::JumpOrTraverse()
{
	// Context action: climb/vault/mantle/plunge if the parkour scan finds something, otherwise jump.
	if (!Parkour->TryTraverse()) Jump();
}

void ARCPlayerCharacter::SprintStart()
{
	bSprinting = true;
	GetCharacterMovement()->MaxWalkSpeed = 680.f;
	if (bIsCrouched) UnCrouch();
	bStealthStance = false;
}

void ARCPlayerCharacter::SprintStop()
{
	bSprinting = false;
	GetCharacterMovement()->MaxWalkSpeed = 420.f;
}

void ARCPlayerCharacter::ToggleStealth()
{
	bStealthStance = !bStealthStance;
	if (bStealthStance) Crouch(); else UnCrouch();
}

bool ARCPlayerCharacter::ConsumeStamina(float Amount)
{
	if (Stamina < Amount) return false;
	Stamina -= Amount;
	StaminaRegenDelay = 1.f;
	return true;
}

float ARCPlayerCharacter::GetNoiseLevel() const
{
	const float Speed = GetVelocity().Size2D();
	float Noise = FMath::GetMappedRangeValueClamped(FVector2D(0, 680), FVector2D(0, 1), Speed);
	if (bStealthStance) Noise *= 0.3f;
	if (Combat->IsAttacking()) Noise = FMath::Max(Noise, 0.9f);
	return Noise;
}

void ARCPlayerCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Stamina: no regen while climbing or sprinting; faster regen standing still.
	StaminaRegenDelay -= DeltaSeconds;
	if (bSprinting && GetVelocity().Size2D() > 50.f) Stamina = FMath::Max(0.f, Stamina - 8.f * DeltaSeconds);
	else if (StaminaRegenDelay <= 0.f && !Parkour->IsClimbing())
	{
		Stamina = FMath::Min(MaxStamina, Stamina + (GetVelocity().IsNearlyZero() ? 30.f : 18.f) * DeltaSeconds);
	}
	if (bSprinting && Stamina <= 0.f) SprintStop();

	UpdateInteractTarget();
	TickWeatherExposure(DeltaSeconds);
}

void ARCPlayerCharacter::TickWeatherExposure(float DeltaSeconds)
{
	ExposureTimer += DeltaSeconds;
	if (ExposureTimer < 1.f) return;
	ExposureTimer = 0.f;
	URCWeatherSubsystem* Weather = GetWorld()->GetSubsystem<URCWeatherSubsystem>();
	if (!Weather) return;
	const bool bSheltered = !Weather->IsExposedToSky(GetActorLocation() + FVector(0, 0, 100));
	// Fires are actors tagged "Fire" with an overlap sphere; the cheap check here is a tagged-overlap count.
	TArray<AActor*> Overlapping;
	GetOverlappingActors(Overlapping);
	const bool bNearFire = Overlapping.ContainsByPredicate([](const AActor* A) { return A && A->ActorHasTag(TEXT("Fire")); });
	const float Cold = Weather->GetColdDamagePerSecond(Insulation, bSheltered, bNearFire);
	if (Cold > 0.f)
	{
		FRCDamage D;
		D.Amount = Cold;
		D.Type = ERCDamageType::Cold;
		Execute_ReceiveRCDamage(this, D);
	}
}

void ARCPlayerCharacter::UpdateInteractTarget()
{
	const FVector Start = FollowCamera->GetComponentLocation();
	const FVector End = Start + FollowCamera->GetForwardVector() * (CameraBoom->TargetArmLength + 250.f);
	FCollisionQueryParams Params(SCENE_QUERY_STAT(RCInteract), false, this);
	FHitResult Hit;
	AActor* NewTarget = nullptr;
	if (GetWorld()->SweepSingleByChannel(Hit, Start, End, FQuat::Identity, ECC_Pawn, FCollisionShape::MakeSphere(30.f), Params))
	{
		if (Hit.GetActor() && Hit.GetActor()->FindComponentByClass<URCNPCComponent>() && FVector::Dist(Hit.ImpactPoint, GetActorLocation()) < 250.f)
		{
			NewTarget = Hit.GetActor();
		}
	}
	if (NewTarget != InteractTarget)
	{
		InteractTarget = NewTarget;
		TArray<ERCInteraction> Options;
		if (const URCNPCComponent* NPC = NewTarget ? NewTarget->FindComponentByClass<URCNPCComponent>() : nullptr) Options = NPC->GetInteractionOptions(this);
		OnInteractTargetChanged.Broadcast(InteractTarget, Options);
	}
}

void ARCPlayerCharacter::Interact()
{
	PerformInteraction(ERCInteraction::Talk);
}

void ARCPlayerCharacter::PerformInteraction(ERCInteraction Option)
{
	URCNPCComponent* NPC = InteractTarget ? InteractTarget->FindComponentByClass<URCNPCComponent>() : nullptr;
	if (!NPC || !NPC->GetInteractionOptions(this).Contains(Option)) return;
	URCSocialSubsystem* Social = GetWorld()->GetSubsystem<URCSocialSubsystem>();
	URCWorldStateSubsystem* World = GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>();

	switch (Option)
	{
	case ERCInteraction::Talk:
		if (URCDialogueManager* Dialogue = GetWorld()->GetSubsystem<URCDialogueManager>()) Dialogue->StartDialogue(NPC->Dialogue, NPC->NPCId, this);
		break;
	case ERCInteraction::Pickpocket:
	{
		int32 Taken = 0;
		if (NPC->TryPickpocket(this, Taken) && World) World->AddToFlag(TEXT("SILVER"), Taken, TEXT("Pickpocket"));
		break;
	}
	case ERCInteraction::Intimidate:
		if (Social)
		{
			FRCSocialEvent E;
			E.Kind = ERCMemoryKind::Threatened; E.Victim = NPC->NPCId; E.Location = GetActorLocation(); E.Severity = 0.4f;
			Social->ReportEvent(E);
		}
		break;
	case ERCInteraction::Bribe:
		if (World && World->GetFlag(TEXT("SILVER")) >= 5 && Social)
		{
			World->AddToFlag(TEXT("SILVER"), -5, TEXT("Bribe"));
			Social->ModifyAttitude(NPC->NPCId, 6.f * (0.5f + NPC->Personality.Greed), 0.f, -2.f);
		}
		break;
	case ERCInteraction::Recruit:
		if (Social && World)
		{
			Social->SetRecruited(NPC->NPCId, true);
			World->SetFlag(FName(*FString::Printf(TEXT("RECRUIT_%s"), *NPC->NPCId.ToString())), 1, TEXT("Recruit"));
		}
		break;
	case ERCInteraction::Assassinate:
		Combat->TryAssassinate();
		break;
	case ERCInteraction::Follow:
		// Tailing: the UI starts a "keep within range, stay unseen" objective tracked by NPC suspicion.
		break;
	default:
		break;
	}
}

void ARCPlayerCharacter::ReceiveRCDamage_Implementation(const FRCDamage& Damage)
{
	if (Health <= 0.f) return;
	float Amount = Damage.Amount;
	if (Damage.Type != ERCDamageType::Cold && Damage.Type != ERCDamageType::Lightning) Amount = Combat->FilterIncomingDamage(Damage);
	Health = FMath::Max(0.f, Health - Amount);
	if (Damage.Type == ERCDamageType::Lightning) Parkour->ForceFall(); // a strike knocks you off a wall
	if (Health <= 0.f)
	{
		// Death returns to the last autosave; the saga continues from there (no permadeath).
		DisableInput(Cast<APlayerController>(GetController()));
	}
}
