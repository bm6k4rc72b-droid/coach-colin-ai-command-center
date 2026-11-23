#include "Core/RCSaveSubsystem.h"
#include "Core/RCSaveGame.h"
#include "Core/RCWorldStateSubsystem.h"
#include "Core/RCAlignmentSubsystem.h"
#include "Social/RCSocialSubsystem.h"
#include "Weather/RCWeatherSubsystem.h"
#include "Quest/RCQuestSubsystem.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"
#include "RavensCreed.h"

void URCSaveSubsystem::GatherSaveables(TArray<IRCSaveable*>& Out) const
{
	UGameInstance* GI = GetGameInstance();
	Out.Add(GI->GetSubsystem<URCWorldStateSubsystem>());
	Out.Add(GI->GetSubsystem<URCAlignmentSubsystem>());
	if (UWorld* World = GI->GetWorld())
	{
		Out.Add(World->GetSubsystem<URCSocialSubsystem>());
		Out.Add(World->GetSubsystem<URCWeatherSubsystem>());
		Out.Add(World->GetSubsystem<URCQuestSubsystem>());
	}
	Out.RemoveAll([](IRCSaveable* S) { return S == nullptr; });
}

void URCSaveSubsystem::SaveGame(const FString& Slot, int32 UserIndex)
{
	URCSaveGame* Save = Cast<URCSaveGame>(UGameplayStatics::CreateSaveGameObject(URCSaveGame::StaticClass()));
	Save->SaveVersion = CurrentVersion;
	Save->SavedAt = FDateTime::UtcNow();

	TArray<IRCSaveable*> Systems;
	GatherSaveables(Systems);
	for (IRCSaveable* S : Systems) S->WriteToSave(*Save);

	if (ACharacter* Player = UGameplayStatics::GetPlayerCharacter(this, 0))
	{
		Save->PlayerTransform = Player->GetActorTransform();
	}

	FAsyncSaveGameToSlotDelegate Done;
	Done.BindWeakLambda(this, [this](const FString& SlotName, int32, bool bOk)
	{
		UE_LOG(LogRavensCreed, Log, TEXT("Save %s: %s"), *SlotName, bOk ? TEXT("ok") : TEXT("FAILED"));
		OnSaveFinished.Broadcast(SlotName, bOk);
	});
	UGameplayStatics::AsyncSaveGameToSlot(Save, Slot, UserIndex, Done);
}

bool URCSaveSubsystem::LoadGame(const FString& Slot, int32 UserIndex)
{
	URCSaveGame* Save = Cast<URCSaveGame>(UGameplayStatics::LoadGameFromSlot(Slot, UserIndex));
	if (!Save) return false;
	MigrateIfNeeded(*Save);

	TArray<IRCSaveable*> Systems;
	GatherSaveables(Systems);
	for (IRCSaveable* S : Systems) S->ReadFromSave(*Save);

	if (ACharacter* Player = UGameplayStatics::GetPlayerCharacter(this, 0))
	{
		Player->SetActorTransform(Save->PlayerTransform, false, nullptr, ETeleportType::TeleportPhysics);
	}
	return true;
}

void URCSaveSubsystem::MigrateIfNeeded(URCSaveGame& Save) const
{
	// Version 1 is the first layout. Add steps here as fields change, e.g.:
	// if (Save.SaveVersion < 2) { ...convert...; Save.SaveVersion = 2; }
	if (Save.SaveVersion > CurrentVersion)
	{
		UE_LOG(LogRavensCreed, Warning, TEXT("Save version %d is newer than this build (%d)"), Save.SaveVersion, CurrentVersion);
	}
}
