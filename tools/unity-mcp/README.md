# MCP for Unity (CoplayDev/unity-mcp)

Lets Claude drive the Unity Editor: create scenes and GameObjects, write and validate C# scripts, manage prefabs,
materials, physics, animation, UI and VFX, run tests, read the console, take screenshots and make builds (49 tools).

Pinned commit: `19b66ecef4ac3a9be22a7a62ea21accb975c39e7` (v10.3, MIT).

It has two halves:

1. **The MCP server** (Python). Already registered in this repo's `.mcp.json` as `unityMCP` and enabled in
   `.claude/settings.json`. Claude Code starts it with `uvx` from the pinned commit. Telemetry is off
   (`DISABLE_TELEMETRY`), and it skips connecting until a tool is called, so it starts fine with no Unity running.
2. **The Unity package** (C#). It runs inside the Unity Editor on your computer, which a cloud session doesn't have.
   In Unity 2021.3 LTS to 6.x: *Window → Package Manager → + → Add package from git URL* and paste

   ```
   https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#19b66ecef4ac3a9be22a7a62ea21accb975c39e7
   ```

   Then *Window → MCP for Unity* and start the bridge. Open this repo in Claude Code on the same computer and ask, for
   example, "Create a cube at the origin and add a Rigidbody."

The skill `.claude/skills/unity-mcp` (the repo's `unity-mcp-orchestrator` guide) teaches Claude the resource-first
workflow: read editor state, find objects, act, then check the console and a screenshot.
