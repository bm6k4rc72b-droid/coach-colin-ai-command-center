using UnrealBuildTool;

public class RavensCreedTarget : TargetRules
{
	public RavensCreedTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
		ExtraModuleNames.Add("RavensCreed");
	}
}
