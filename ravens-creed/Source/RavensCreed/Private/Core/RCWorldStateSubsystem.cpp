#include "Core/RCWorldStateSubsystem.h"
#include "Core/RCSaveGame.h"
#include "RavensCreed.h"

void URCWorldStateSubsystem::SetFlag(FName Flag, int32 Value, FName Source)
{
	if (Flag.IsNone()) return;
	const int32 Old = GetFlag(Flag);
	if (Old == Value) return;

	Flags.Add(Flag, Value);
	FRCConsequenceRecord& Rec = Ledger.AddDefaulted_GetRef();
	Rec.Flag = Flag;
	Rec.Value = Value;
	Rec.Source = Source;
	Rec.Day = Day;

	UE_LOG(LogRavensCreed, Verbose, TEXT("Flag %s: %d -> %d (%s)"), *Flag.ToString(), Old, Value, *Source.ToString());
	OnFlagChanged.Broadcast(Flag, Old, Value);
}

void URCWorldStateSubsystem::AddToFlag(FName Flag, int32 Delta, FName Source)
{
	SetFlag(Flag, GetFlag(Flag) + Delta, Source);
}

int32 URCWorldStateSubsystem::GetFlag(FName Flag) const
{
	const int32* Found = Flags.Find(Flag);
	return Found ? *Found : 0;
}

void URCWorldStateSubsystem::AdvanceTime(float Hours)
{
	if (Hours <= 0.f) return;
	const int32 OldWholeHour = FMath::FloorToInt(Hour);
	Hour += Hours;
	while (Hour >= 24.f)
	{
		Hour -= 24.f;
		++Day;
	}
	if (FMath::FloorToInt(Hour) != OldWholeHour)
	{
		OnHourPassed.Broadcast(Day, Hour);
	}
}

ERCSeason URCWorldStateSubsystem::GetSeason() const
{
	return static_cast<ERCSeason>((Day / DaysPerSeason) % 4);
}

float URCWorldStateSubsystem::GetSeasonProgress() const
{
	return (static_cast<float>(Day % DaysPerSeason) + Hour / 24.f) / DaysPerSeason;
}

void URCWorldStateSubsystem::WriteToSave(URCSaveGame& Save) const
{
	Save.Flags = Flags;
	Save.Ledger = Ledger;
	Save.Day = Day;
	Save.TimeOfDayHours = Hour;
}

void URCWorldStateSubsystem::ReadFromSave(const URCSaveGame& Save)
{
	Flags = Save.Flags;
	Ledger = Save.Ledger;
	Day = Save.Day;
	Hour = Save.TimeOfDayHours;
}
