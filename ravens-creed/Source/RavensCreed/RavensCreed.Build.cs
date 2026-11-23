using UnrealBuildTool;

public class RavensCreed : ModuleRules
{
	public RavensCreed(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput",
			"AIModule", "NavigationSystem", "Niagara", "MotionWarping", "DeveloperSettings"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Json", "JsonUtilities", "PhysicsCore"
		});
	}
}
