# Runs inside Blender: registers the MCP for Blender addon and starts its socket server (port 9876).
import importlib.util, os, sys, bpy
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("mcp_for_blender_addon", os.path.join(here, "mcp_for_blender_addon.py"))
mod = importlib.util.module_from_spec(spec); sys.modules["mcp_for_blender_addon"] = mod; spec.loader.exec_module(mod)
mod.register()
def _start():
    bpy.context.scene.blendermcp_port = int(os.environ.get("BLENDER_PORT", "9876"))
    bpy.ops.blendermcp.start_server()
    return None
bpy.app.timers.register(_start, first_interval=1.0)
