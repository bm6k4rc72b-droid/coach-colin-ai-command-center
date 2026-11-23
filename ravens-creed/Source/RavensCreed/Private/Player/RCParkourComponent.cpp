#include "Player/RCParkourComponent.h"
#include "Player/RCPlayerCharacter.h"
#include "Weather/RCWeatherSubsystem.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "MotionWarpingComponent.h"
#include "PhysicalMaterials/PhysicalMaterial.h"

const FName URCParkourComponent::WarpTargetName(TEXT("ParkourTarget"));

namespace RCParkour
{
	static const FName TagClimbable(TEXT("Climbable"));
	static const FName TagNoClimb(TEXT("NoClimb"));
	static const FName TagIce(TEXT("Ice"));
	static const FName TagPlunge(TEXT("PlungeTarget"));
}

URCParkourComponent::URCParkourComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void URCParkourComponent::BeginPlay()
{
	Super::BeginPlay();
	Character = Cast<ACharacter>(GetOwner());
	Weather = GetWorld()->GetSubsystem<URCWeatherSubsystem>();
}

bool URCParkourComponent::TraceWall(FVector& OutPoint, FVector& OutNormal) const
{
	const FVector Start = Character->GetActorLocation() + FVector(0, 0, 40);
	const FVector End = Start + Character->GetActorForwardVector() * ScanDistance;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(RCParkourWall), false, Character);
	FHitResult Hit;
	if (!GetWorld()->SweepSingleByChannel(Hit, Start, End, FQuat::Identity, ECC_Visibility, FCollisionShape::MakeSphere(20.f), Params)) return false;
	// Only near-vertical faces count as walls.
	if (FMath::Abs(Hit.ImpactNormal.Z) > 0.35f) return false;
	OutPoint = Hit.ImpactPoint;
	OutNormal = Hit.ImpactNormal.GetSafeNormal2D();
	return true;
}

FRCObstacle URCParkourComponent::ScanObstacle() const
{
	FRCObstacle O;
	if (!Character) return O;
	FVector Point, Normal;
	if (!TraceWall(Point, Normal)) return O;
	O.bFound = true;
	O.WallPoint = Point;
	O.WallNormal = Normal;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(RCParkourLedge), true, Character);
	const float FeetZ = Character->GetActorLocation().Z - Character->GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
	const FVector Into = -Normal;

	// Ledge: trace down from above the wall, slightly inside it.
	FHitResult Top;
	const FVector TopStart = Point + Into * 25.f + FVector(0, 0, MaxMantleHeight + 60.f);
	if (GetWorld()->LineTraceSingleByChannel(Top, TopStart, FVector(TopStart.X, TopStart.Y, FeetZ), ECC_Visibility, Params) && Top.ImpactNormal.Z > 0.7f)
	{
		O.LedgePoint = Top.ImpactPoint;
		O.Height = Top.ImpactPoint.Z - FeetZ;
	}
	else
	{
		O.Height = TNumericLimits<float>::Max(); // taller than mantle range: a climbing wall
	}

	// Depth: from the far side, trace back toward the wall at ledge height to measure thickness (vault vs mantle).
	if (O.Height < MaxVaultHeight)
	{
		FHitResult Back;
		const FVector Far = Point + Into * (MaxVaultDepth + 40.f) + FVector(0, 0, O.Height - 10.f - (Point.Z - FeetZ));
		const FVector Near = Point + FVector(0, 0, O.Height - 10.f - (Point.Z - FeetZ));
		O.Depth = GetWorld()->LineTraceSingleByChannel(Back, Far, Near, ECC_Visibility, Params) ? FVector::Dist2D(Back.ImpactPoint, Point) : MaxVaultDepth + 40.f;
	}

	// Climbability: component/actor tags, or a physical material named PM_Climb* (rock, timber, rigging).
	FHitResult Surface;
	FCollisionQueryParams SurfaceParams(SCENE_QUERY_STAT(RCParkourSurface), false, Character);
	SurfaceParams.bReturnPhysicalMaterial = true;
	GetWorld()->LineTraceSingleByChannel(Surface, Point + Normal * 10.f, Point - Normal * 10.f, ECC_Visibility, SurfaceParams);
	const UPrimitiveComponent* Comp = Surface.GetComponent();
	const AActor* Actor = Surface.GetActor();
	const bool bTagged = (Comp && Comp->ComponentHasTag(RCParkour::TagClimbable)) || (Actor && Actor->ActorHasTag(RCParkour::TagClimbable));
	const bool bBlocked = Actor && Actor->ActorHasTag(RCParkour::TagNoClimb);
	const bool bPhysMat = Surface.PhysMaterial.IsValid() && Surface.PhysMaterial->GetName().StartsWith(TEXT("PM_Climb"));
	O.bClimbable = (bTagged || bPhysMat) && !bBlocked;
	O.bIcy = (Actor && Actor->ActorHasTag(RCParkour::TagIce)) || (Surface.PhysMaterial.IsValid() && Surface.PhysMaterial->GetName().Contains(TEXT("Ice")));
	return O;
}

bool URCParkourComponent::TryTraverse()
{
	if (!Character) return false;
	if (bClimbing)
	{
		// Jump while climbing = back-eject away from the wall.
		StopClimbing();
		Character->LaunchCharacter(WallNormal * 450.f + FVector(0, 0, 350.f), true, true);
		return true;
	}
	if (!Character->GetCharacterMovement()->IsMovingOnGround() && TryPlunge()) return true;

	const FRCObstacle O = ScanObstacle();
	if (!O.bFound) return TryPlunge();

	const FRotator Facing = (-O.WallNormal).Rotation();
	if (O.Height < MaxVaultHeight && O.Depth < MaxVaultDepth)
	{
		const FVector Land = O.WallPoint - O.WallNormal * (O.Depth + 60.f);
		return PlayWarped(VaultMontage, FVector(Land.X, Land.Y, O.LedgePoint.Z), Facing);
	}
	if (O.Height < MaxMantleHeight)
	{
		return PlayWarped(MantleMontage, O.LedgePoint - O.WallNormal * 30.f, Facing);
	}
	if (O.bClimbable)
	{
		StartClimbing(O);
		return true;
	}
	return false;
}

bool URCParkourComponent::PlayWarped(UAnimMontage* Montage, const FVector& Location, const FRotator& Rotation)
{
	if (!Montage) return false;
	if (UMotionWarpingComponent* Warp = Character->FindComponentByClass<UMotionWarpingComponent>())
	{
		Warp->AddOrUpdateWarpTargetFromLocationAndRotation(WarpTargetName, Location, Rotation);
	}
	// Root motion moves through the obstacle; flying mode avoids the floor check fighting the montage.
	Character->GetCharacterMovement()->SetMovementMode(MOVE_Flying);
	const float Len = Character->PlayAnimMontage(Montage);
	FTimerHandle Handle;
	GetWorld()->GetTimerManager().SetTimer(Handle, FTimerDelegate::CreateWeakLambda(this, [this]()
	{
		if (Character && !bClimbing) Character->GetCharacterMovement()->SetMovementMode(MOVE_Falling);
	}), FMath::Max(Len, 0.1f), false);
	return Len > 0.f;
}

void URCParkourComponent::StartClimbing(const FRCObstacle& Obstacle)
{
	bClimbing = true;
	bOnIce = Obstacle.bIcy;
	WallNormal = Obstacle.WallNormal;
	UCharacterMovementComponent* Move = Character->GetCharacterMovement();
	Move->SetMovementMode(MOVE_Flying);
	Move->bOrientRotationToMovement = false;
	Move->StopMovementImmediately();
	const float Radius = Character->GetCapsuleComponent()->GetScaledCapsuleRadius();
	Character->SetActorLocation(Obstacle.WallPoint + WallNormal * (Radius + 2.f) - FVector(0, 0, 40), true);
	Character->SetActorRotation((-WallNormal).Rotation());
}

void URCParkourComponent::StopClimbing()
{
	if (!bClimbing) return;
	bClimbing = false;
	UCharacterMovementComponent* Move = Character->GetCharacterMovement();
	Move->bOrientRotationToMovement = true;
	Move->SetMovementMode(MOVE_Falling);
}

void URCParkourComponent::ForceFall()
{
	if (!bClimbing) return;
	StopClimbing();
	if (SlipMontage) Character->PlayAnimMontage(SlipMontage);
	Character->LaunchCharacter(WallNormal * 200.f, true, false);
}

void URCParkourComponent::ClimbInput(const FVector2D& Axis)
{
	PendingInput = Axis;
}

float URCParkourComponent::CurrentGrip(bool bIcy) const
{
	return Weather ? Weather->GetSurfaceGrip(bIcy) : 1.f;
}

void URCParkourComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (!bClimbing || !Character) return;

	ARCPlayerCharacter* Player = Cast<ARCPlayerCharacter>(Character);
	const float Grip = CurrentGrip(bOnIce);

	// Stamina drains faster on poor grip; running out means falling.
	if (Player && !Player->ConsumeStamina(ClimbStaminaPerSecond / FMath::Max(Grip, 0.3f) * DeltaTime))
	{
		ForceFall();
		return;
	}

	// Slip: on wet or icy rock with low stamina, a per-second chance to lose the hold.
	SlipTimer += DeltaTime;
	if (SlipTimer >= 1.f && Player)
	{
		SlipTimer = 0.f;
		const float StaminaFrac = Player->Stamina / Player->MaxStamina;
		if (StaminaFrac < SlipStaminaThreshold && FMath::FRand() < (1.f - Grip) * 0.35f)
		{
			ForceFall();
			return;
		}
	}

	// Strong gusts push climbers sideways on exposed faces.
	FVector Gust = FVector::ZeroVector;
	if (Weather)
	{
		const FVector Wind = Weather->GetWindAt(Character->GetActorLocation());
		Gust = FVector::VectorPlaneProject(Wind, WallNormal) * FMath::Max(0.f, Wind.Size() - 12.f) * 0.6f;
	}

	// Move along the wall plane.
	const FVector Right = FVector::CrossProduct(FVector::UpVector, WallNormal).GetSafeNormal();
	const FVector Desired = (Right * -PendingInput.X + FVector::UpVector * PendingInput.Y) * ClimbSpeed * FMath::Lerp(0.6f, 1.f, Grip) + Gust;
	PendingInput = FVector2D::ZeroVector;
	Character->AddActorWorldOffset(Desired * DeltaTime, true);

	// Re-acquire the wall each frame; follow its curvature or detect the top.
	FVector Point, Normal;
	if (TraceWall(Point, Normal))
	{
		WallNormal = FMath::VInterpTo(WallNormal, Normal, DeltaTime, 8.f).GetSafeNormal();
		Character->SetActorRotation(FMath::RInterpTo(Character->GetActorRotation(), (-WallNormal).Rotation(), DeltaTime, 10.f));
		const FRCObstacle O = ScanObstacle();
		if (O.Height < MaxMantleHeight && Desired.Z > 0.f)
		{
			bClimbing = false;
			Character->GetCharacterMovement()->bOrientRotationToMovement = true;
			PlayWarped(ClimbUpMontage, O.LedgePoint - WallNormal * 40.f, (-WallNormal).Rotation());
		}
	}
	else
	{
		StopClimbing(); // ran out of wall (overhang or edge)
	}
}

bool URCParkourComponent::TryPlunge()
{
	if (!Character) return false;
	// A plunge needs a tagged soft landing below and ahead (hay, deep water, snowdrift) and at least 8 m of drop.
	const FVector Start = Character->GetActorLocation() + Character->GetActorForwardVector() * 150.f;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(RCPlunge), false, Character);
	FHitResult Hit;
	if (!GetWorld()->LineTraceSingleByChannel(Hit, Start, Start - FVector(0, 0, PlungeSearchDepth), ECC_Visibility, Params)) return false;
	if (!Hit.GetActor() || !Hit.GetActor()->ActorHasTag(RCParkour::TagPlunge)) return false;
	if (Character->GetActorLocation().Z - Hit.ImpactPoint.Z < 800.f) return false;
	StopClimbing();
	return PlayWarped(PlungeMontage, Hit.ImpactPoint, Character->GetActorRotation());
}
