"""Step 81 (runs inside Blender): simulated close-up detail for the walk view.

Run:  blender -b --factory-startup -noaudio -P pipeline/81_blender_detail.py

Everything made here is SIMULATED. It is not measured. It only makes ground finer than the real data
(1 m DEM, 25 cm photo) look like ground. The walk page says so on screen.

Outputs in web/walk/:
  rocks.glb          8 rock shapes, each 1 m wide and 1 m tall above the ground (scaled per rock in the browser
                     with the team drone-sim sizes). Angular shapes, because the boxwork ground in NASA's PIA26693
                     is broken bedrock plates and angular rocks.
  detail_normal.png  1024 x 1024 tileable normal map, one tile = 4 m of ground (ASSUMPTION A43)
  detail_ao.png      matching grey map that darkens cracks and gaps
"""
import json, math, os, random, sys

import bmesh
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "web", "walk")
os.makedirs(OUT, exist_ok=True)

N_ROCKS = 8
BURIED = 0.2            # part of each rock below the ground, as a share of its height (ASSUMPTION A38)
TILE_M = 4.0            # ground covered by one detail tile (ASSUMPTION A43)
TEX = 1024
RELIEF_M = 0.03         # height range of the detail map (ASSUMPTION A43)
SEED = 4671             # the sol of PIA26693; any fixed number makes the result repeatable

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ------------------------------------------------------------------------------ rocks ----
def make_rock(k):
    rng = random.Random(SEED + k)
    n = rng.randint(28, 60)
    flat = rng.uniform(0.35, 0.8)                    # some plates, some blocks
    stretch = rng.uniform(0.6, 1.0)
    pts = []
    for _ in range(n):
        u, v = rng.uniform(-1, 1), rng.uniform(0, 2 * math.pi)
        r = math.sqrt(1 - u * u) * rng.uniform(0.82, 1.0)
        pts.append((r * math.cos(v), stretch * r * math.sin(v), flat * u * rng.uniform(0.85, 1.0)))
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    for _ in range(rng.randint(1, 3)):               # a few flat breaks, like fractured bedrock
        nx, ny, nz = rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.2, 1)
        L = math.sqrt(nx * nx + ny * ny + nz * nz)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5,
                               plane_co=(0, 0, flat * rng.uniform(0.3, 0.7)), plane_no=(nx / L, ny / L, nz / L),
                               clear_outer=True)
        bmesh.ops.contextual_create(bm, geom=[e for e in bm.edges if e.is_boundary])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    w = max(max(xs) - min(xs), max(ys) - min(ys))
    h = max(zs) - min(zs)
    cx, cy, z0 = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)
    for v in bm.verts:                               # 1 m wide, 1 m above ground, BURIED below
        v.co.x = (v.co.x - cx) / w
        v.co.y = (v.co.y - cy) / w
        v.co.z = (v.co.z - z0) / h * (1 + BURIED) - BURIED
    me = bpy.data.meshes.new(f"rock_{k}")
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False                      # flat faces: angular rock
    ob = bpy.data.objects.new(f"rock_{k}", me)
    scene.collection.objects.link(ob)
    ob.location = (k * 2.0, 0, 0)                    # side by side for the preview; reset before export
    return ob, len(me.polygons)


rocks = [make_rock(k) for k in range(N_ROCKS)]
print("rocks:", [f"{ob.name} {nt} tris" for ob, nt in rocks])
for ob, _ in rocks:
    ob.location = (0, 0, 0)
    ob.select_set(True)
bpy.context.view_layer.objects.active = rocks[0][0]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "rocks.glb"), export_format="GLB", use_selection=True,
                          export_yup=True, export_normals=True, export_materials="NONE", export_apply=True)
print("wrote rocks.glb")

# ------------------------------------------------------------------------------ detail map ----
# A plane whose material emits a height made of 4D procedural noise on a torus, so the result tiles
# seamlessly: (u, v) -> (cos 2pi u, sin 2pi u, cos 2pi v) + W = sin 2pi v.
bpy.ops.mesh.primitive_plane_add(size=1)
plane = bpy.context.active_object
mat = bpy.data.materials.new("detail")
mat.use_nodes = True
nt = mat.node_tree
nodes, links = nt.nodes, nt.links
nodes.clear()


def node(t, **kw):
    n = nodes.new(t)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def math_node(op, a=None, b=None, value=None):
    n = node("ShaderNodeMath", operation=op)
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            links.new(x, n.inputs[i])
    return n.outputs[0]


tc = node("ShaderNodeTexCoord")
sep = node("ShaderNodeSeparateXYZ")
links.new(tc.outputs["UV"], sep.inputs[0])
a = math_node("MULTIPLY", sep.outputs[0], 2 * math.pi)
b = math_node("MULTIPLY", sep.outputs[1], 2 * math.pi)
comb = node("ShaderNodeCombineXYZ")
links.new(math_node("COSINE", a), comb.inputs[0])
links.new(math_node("SINE", a), comb.inputs[1])
links.new(math_node("COSINE", b), comb.inputs[2])
w_out = math_node("SINE", b)


def tex(kind, scale, **kw):
    if kind == "voronoi":
        t = node("ShaderNodeTexVoronoi", voronoi_dimensions="4D", **kw)
    else:
        t = node("ShaderNodeTexNoise", noise_dimensions="4D", **kw)
    links.new(comb.outputs[0], t.inputs["Vector"])
    links.new(w_out, t.inputs["W"])
    t.inputs["Scale"].default_value = scale
    return t


def maprange(x, f0, f1, t0, t1):
    m = node("ShaderNodeMapRange", clamp=True)
    links.new(x, m.inputs["Value"])
    m.inputs["From Min"].default_value, m.inputs["From Max"].default_value = f0, f1
    m.inputs["To Min"].default_value, m.inputs["To Max"].default_value = t0, t1
    return m.outputs[0]


cells_per_tile = lambda n: n / (2 * math.pi)        # torus radius 1: 2 pi units across one tile
plates = tex("voronoi", cells_per_tile(9), feature="DISTANCE_TO_EDGE")      # ~0.45 m plates
pebble = tex("voronoi", cells_per_tile(55), feature="F1")                    # ~7 cm pebbles
grain = tex("noise", cells_per_tile(120))
grain.inputs["Detail"].default_value = 6
h_plates = maprange(plates.outputs["Distance"], 0.0, 0.06, 0.0, 1.0)         # low in the cracks
h_peb = maprange(pebble.outputs["Distance"], 0.0, 0.45, 1.0, 0.0)            # bumps at pebble centres
h = math_node("ADD", math_node("MULTIPLY", h_plates, 0.55), math_node("MULTIPLY", h_peb, 0.25))
h = math_node("ADD", h, math_node("MULTIPLY", grain.outputs["Fac"], 0.20))
emit = node("ShaderNodeEmission")
links.new(h, emit.inputs["Color"])
out = node("ShaderNodeOutputMaterial")
links.new(emit.outputs[0], out.inputs["Surface"])
img = bpy.data.images.new("height", TEX, TEX, alpha=False, float_buffer=True)
img.colorspace_settings.name = "Non-Color"
it = node("ShaderNodeTexImage")
it.image = img
nodes.active = it
plane.data.materials.append(mat)

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 1
for ob in scene.objects:
    ob.select_set(ob == plane)
bpy.context.view_layer.objects.active = plane
bpy.ops.object.bake(type="EMIT", margin=0)

H = np.array(img.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)[..., 0]
H = (H - H.min()) / max(1e-6, H.max() - H.min())
p = TILE_M / TEX
dx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) / (2 * p) * RELIEF_M        # periodic: the tile stays seamless
dy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) / (2 * p) * RELIEF_M
n = np.stack([-dx, -dy, np.ones_like(H)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)


def save(name, rgb):
    im = bpy.data.images.new(name, TEX, TEX, alpha=False)
    im.colorspace_settings.name = "Non-Color"
    rgba = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,), np.float32)], -1)
    im.pixels[:] = rgba.ravel()
    im.filepath_raw = os.path.join(OUT, name)
    im.file_format = "PNG"
    im.save()


save("detail_normal.png", (n * 0.5 + 0.5).astype(np.float32))
ao = 0.78 + 0.22 * np.clip(H * 1.4, 0, 1)                                 # cracks and gaps darker
save("detail_ao.png", np.repeat(ao[..., None], 3, -1).astype(np.float32))
meta = {"made_by": "pipeline/81_blender_detail.py", "blender": bpy.app.version_string, "seed": SEED,
        "rocks": {"file": "rocks.glb", "count": N_ROCKS, "unit": "1 m wide, 1 m above ground", "buried_share": BURIED},
        "detail": {"normal": "detail_normal.png", "ao": "detail_ao.png", "ao_mean": round(float(ao.mean()), 4),
                   "px": TEX, "tile_m": TILE_M,
                   "relief_m": RELIEF_M, "layers": "cracked plates ~0.45 m, pebbles ~7 cm, fine grain"},
        "simulated": True}
json.dump(meta, open(os.path.join(OUT, "detail.json"), "w"), indent=1)
print("wrote detail_normal.png, detail_ao.png, detail.json")
