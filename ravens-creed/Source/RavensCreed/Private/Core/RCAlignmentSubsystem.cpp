#include "Core/RCAlignmentSubsystem.h"
#include "Core/RCSaveGame.h"
#include "Core/RCWorldStateSubsystem.h"

#define LOCTEXT_NAMESPACE "RCAlignment"

void URCAlignmentSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Collection.InitializeDependency<URCWorldStateSubsystem>();
}

float URCAlignmentSubsystem::ApplyDelta(ERCAlignmentAxis Axis, float Amount, FName Source)
{
	const int32 Index = static_cast<int32>(Axis);
	if (Index < 0 || Index >= static_cast<int32>(ERCAlignmentAxis::Count) || FMath::IsNearlyZero(Amount)) return 0.f;

	const float Old = Values[Index];
	// Toward the extreme: scale by remaining headroom (quadratic falloff). Toward the centre: full strength.
	const bool bTowardExtreme = (Old >= 0.f && Amount > 0.f) || (Old <= 0.f && Amount < 0.f);
	const float Headroom = 1.f - FMath::Square(FMath::Abs(Old) / MaxValue);
	const float Applied = bTowardExtreme ? Amount * FMath::Max(0.15f, Headroom) : Amount;
	const float New = FMath::Clamp(Old + Applied, MinValue, MaxValue);
	Values[Index] = New;

	if (URCWorldStateSubsystem* World = GetGameInstance()->GetSubsystem<URCWorldStateSubsystem>())
	{
		// Mirror into the flag ledger so quests and the ending selector can read alignment like any other flag.
		static const TCHAR* AxisNames[] = { TEXT("ALIGN_HONOR"), TEXT("ALIGN_CUNNING"), TEXT("ALIGN_PIETY"), TEXT("ALIGN_AMBITION") };
		World->SetFlag(FName(AxisNames[Index]), FMath::RoundToInt(New), Source);
	}
	OnAlignmentChanged.Broadcast(Axis, Old, New);
	return New - Old;
}

void URCAlignmentSubsystem::ApplyDeltas(const TArray<FRCAlignmentDelta>& Deltas, FName Source)
{
	for (const FRCAlignmentDelta& D : Deltas)
	{
		ApplyDelta(D.Axis, D.Amount, Source);
	}
}

float URCAlignmentSubsystem::GetValue(ERCAlignmentAxis Axis) const
{
	const int32 Index = static_cast<int32>(Axis);
	return (Index >= 0 && Index < static_cast<int32>(ERCAlignmentAxis::Count)) ? Values[Index] : 0.f;
}

void URCAlignmentSubsystem::GetDominantAxes(ERCAlignmentAxis& First, ERCAlignmentAxis& Second) const
{
	TArray<ERCAlignmentAxis> Axes;
	for (ERCAlignmentAxis A : TEnumRange<ERCAlignmentAxis>()) Axes.Add(A);
	Axes.Sort([this](ERCAlignmentAxis A, ERCAlignmentAxis B) { return FMath::Abs(GetValue(A)) > FMath::Abs(GetValue(B)); });
	First = Axes[0];
	Second = Axes[1];
}

FText URCAlignmentSubsystem::GetTitle() const
{
	ERCAlignmentAxis First, Second;
	GetDominantAxes(First, Second);
	const float V = GetValue(First);
	if (FMath::Abs(V) < 40.f) return FText::GetEmpty();
	switch (First)
	{
	case ERCAlignmentAxis::Honor:    return V > 0 ? LOCTEXT("Oathkeeper", "Oathkeeper") : LOCTEXT("Oathbreaker", "Oathbreaker");
	case ERCAlignmentAxis::Cunning:  return V > 0 ? LOCTEXT("NightFox", "Night-Fox") : LOCTEXT("OpenBlade", "Open Blade");
	case ERCAlignmentAxis::Piety:    return V > 0 ? LOCTEXT("GodTouched", "God-Touched") : LOCTEXT("Godless", "the Godless");
	case ERCAlignmentAxis::Ambition: return V > 0 ? LOCTEXT("RingGiver", "Ring-Giver") : LOCTEXT("Wanderer", "the Wanderer");
	default: return FText::GetEmpty();
	}
}

void URCAlignmentSubsystem::WriteToSave(URCSaveGame& Save) const
{
	Save.Alignment.SetNum(static_cast<int32>(ERCAlignmentAxis::Count));
	for (int32 i = 0; i < Save.Alignment.Num(); ++i) Save.Alignment[i] = Values[i];
}

void URCAlignmentSubsystem::ReadFromSave(const URCSaveGame& Save)
{
	for (int32 i = 0; i < static_cast<int32>(ERCAlignmentAxis::Count); ++i)
	{
		Values[i] = Save.Alignment.IsValidIndex(i) ? Save.Alignment[i] : 0.f;
	}
}

#undef LOCTEXT_NAMESPACE
