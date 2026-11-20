# Blender script: builds the sleeping white dragon for Kaye's Realm and exports it as GLB.
# Run: blender -b -P kaye-realm/blender/dragon.py -- <out.glb>
import bpy, bmesh, sys, math

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "dragon.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)

# (x, y, z, radius) nodes and edges for the skin modifier. Dragon lies curled, head on paws.
N = {}
E = []
def node(name, x, y, z, r):
    N[name] = (len(N), (x, y, z), r)
def chain(*names):
    for a, b in zip(names, names[1:]):
        E.append((a, b))

node("snout", 7.0, 1.1, 0.85, 0.42)
node("jaw", 6.2, 0.8, 0.95, 0.62)
node("head", 5.5, 0.6, 1.05, 0.85)
node("neck1", 4.5, 0.0, 1.35, 0.92)
node("neck2", 3.5, -0.4, 1.75, 1.15)
node("chest", 2.1, -0.4, 2.05, 1.75)
node("belly", 0.4, -0.2, 2.15, 2.05)
node("back", -1.3, 0.0, 2.0, 1.9)
node("hips", -2.8, 0.2, 1.7, 1.6)
node("t1", -4.3, 0.8, 1.1, 1.1)
node("t2", -5.3, 2.2, 0.75, 0.82)
node("t3", -4.9, 3.9, 0.5, 0.62)
node("t4", -3.3, 4.9, 0.42, 0.46)
node("t5", -1.2, 5.3, 0.36, 0.34)
node("t6", 0.9, 5.1, 0.3, 0.24)
node("t7", 2.7, 4.5, 0.26, 0.14)
node("t8", 3.9, 3.9, 0.25, 0.05)
chain("snout", "jaw", "head", "neck1", "neck2", "chest", "belly", "back", "hips", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8")
# front legs folded under the head
node("fsL", 2.5, -1.6, 1.4, 0.82); node("feL", 3.4, -1.85, 0.55, 0.56); node("fpL", 4.7, -1.3, 0.35, 0.46); node("ftL", 5.3, -1.1, 0.3, 0.2)
node("fsR", 2.5, 1.2, 1.35, 0.82); node("feR", 3.5, 1.55, 0.5, 0.56); node("fpR", 4.9, 1.5, 0.35, 0.46); node("ftR", 5.5, 1.4, 0.3, 0.2)
chain("chest", "fsL", "feL", "fpL", "ftL"); chain("chest", "fsR", "feR", "fpR", "ftR")
# hind legs
node("hsL", -2.6, -1.7, 1.2, 1.05); node("hkL", -1.6, -2.3, 0.5, 0.62); node("hpL", -0.3, -2.1, 0.3, 0.46); node("htL", 0.3, -2.0, 0.28, 0.2)
node("hsR", -2.6, 1.9, 1.2, 1.05); node("hkR", -1.4, 2.5, 0.5, 0.62); node("hpR", -0.1, 2.5, 0.3, 0.46); node("htR", 0.5, 2.5, 0.28, 0.2)
chain("hips", "hsL", "hkL", "hpL", "htL"); chain("hips", "hsR", "hkR", "hpR", "htR")
# folded wing arms
node("wsL", 1.4, -1.3, 3.3, 0.38); node("weL", -0.6, -2.3, 3.7, 0.26); node("wtL", -3.8, -2.2, 3.0, 0.12)
node("wsR", 1.4, 0.9, 3.3, 0.38); node("weR", -0.6, 2.0, 3.7, 0.26); node("wtR", -3.8, 2.1, 3.0, 0.12)
chain("chest", "wsL", "weL", "wtL"); chain("chest", "wsR", "weR", "wtR")
# horns
node("hbL", 5.3, 0.2, 1.65, 0.2); node("htipL", 4.3, -0.15, 2.3, 0.05)
node("hbR", 5.3, 1.05, 1.6, 0.2); node("htipR", 4.4, 1.5, 2.25, 0.05)
chain("head", "hbL", "htipL"); chain("head", "hbR", "htipR")

me = bpy.data.meshes.new("dragon")
verts = [None] * len(N)
for k, (i, p, r) in N.items():
    verts[i] = p
me.from_pydata(verts, [(N[a][0], N[b][0]) for a, b in E], [])
obj = bpy.data.objects.new("Dragon", me)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
skin = obj.modifiers.new("Skin", "SKIN")
for k, (i, p, r) in N.items():
    sv = me.skin_vertices[0].data[i]
    sv.radius = (r, r * (0.85 if k.startswith(("t", "w")) else 1.0))
me.skin_vertices[0].data[N["belly"][0]].use_root = True
sub = obj.modifiers.new("Sub", "SUBSURF"); sub.levels = 2
bpy.ops.object.modifier_apply(modifier="Skin")
bpy.ops.object.modifier_apply(modifier="Sub")

# Wing membranes: thin solidified fans between wing arm and flank
def membrane(side):
    s = -1 if side == "L" else 1
    pts = [(1.4, 1.1 * s - 0.2, 3.3), (-0.6, 2.2 * s - 0.15, 3.75), (-3.8, 2.15 * s, 3.0),
           (-3.2, 1.7 * s, 2.2), (-1.2, 1.9 * s, 2.5), (0.6, 1.6 * s, 2.7)]
    m = bpy.data.meshes.new("wing" + side)
    m.from_pydata(pts, [], [(0, 1, 5), (1, 4, 5), (1, 2, 3, 4)])
    o = bpy.data.objects.new("Wing" + side, m)
    bpy.context.collection.objects.link(o)
    sol = o.modifiers.new("Sol", "SOLIDIFY"); sol.thickness = 0.06
    return o
wings = [membrane("L"), membrane("R")]
# Back spikes
spikes = []
for i, t in enumerate([0.0, 0.18, 0.36, 0.54, 0.72, 0.9]):
    x = 3.2 - t * 7.5
    z = 2.0 + 1.7 * math.sin(math.pi * (0.25 + t * 0.6)) + 0.2
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.28 - t * 0.12, depth=0.7 - t * 0.25, location=(x, 0.1 if i < 3 else 0.2, z))
    c = bpy.context.active_object
    c.rotation_euler = (0, -0.5, 0)
    spikes.append(c)

for o in bpy.context.scene.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = obj
for o in wings:
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier="Sol")
bpy.context.view_layer.objects.active = obj
bpy.ops.object.join()
bpy.ops.object.shade_smooth()
dec = obj.modifiers.new("Dec", "DECIMATE"); dec.ratio = 0.55
bpy.ops.object.modifier_apply(modifier="Dec")
mat = bpy.data.materials.new("DragonScale")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.93, 0.95, 1.0, 1)
bsdf.inputs["Roughness"].default_value = 0.45
obj.data.materials.clear(); obj.data.materials.append(mat)
print("TRIS", sum(len(p.vertices) - 2 for p in obj.data.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_normals=True)
