"""
Headless Blender half of scripts/blenderkit/convert-blend.ts.

    blender -b --factory-startup <asset>.blend --python convert-blend.py -- <out.glb> <report.json>

Exports ONLY the asset from a BlenderKit .blend to a raw .glb, which then goes
through the same audit -> optimize -> verify -> catalog steps as BlenderKit's
own glTF exports. Writes a small JSON report either way, so the TypeScript
driver never has to scrape Blender's console.

What "only the asset" means, and why each exclusion exists:
  * lights, cameras, light probes, speakers - BlenderKit upload scenes often
    keep their studio rig in the file.
  * objects disabled for render (hide_render) or in a view-layer-excluded
    collection - uploaders park helper geometry (retopology cages, high-poly
    sources, backdrops) this way.
  * collection-instance empties are made real first, or the exporter silently
    drops what they instance.
A ground plane that IS renderable is not guessed at here; it shows up as a
flat, room-sized AABB, and the measured-dimension gates reject the asset.

The image-name dedupe bug (see recover-blend-textures.ts): Blender's glTF
exporter keys images by NAME, so an asset whose maps share a name ships one
map bound into every slot. Every image is renamed to a unique, index-prefixed
name before export. Images are also capped at MAX_TEXTURE px on the long edge,
the same 1024 cap optimize.ts applies: exporting 8K maps only to throw them away
would make each raw file hundreds of MB on a nearly full disk.
"""

import json
import sys
import traceback

import bpy

MAX_TEXTURE = 1024
EXCLUDED_TYPES = {"LIGHT", "CAMERA", "LIGHT_PROBE", "SPEAKER"}

argv = sys.argv[sys.argv.index("--") + 1 :]
OUT, REPORT = argv[0], argv[1]
report = {"ok": False, "objects": 0, "excluded": [], "images": 0, "downscaled": 0, "warnings": []}


def excluded_collections():
    """Collections excluded from (or hidden in) the active view layer."""
    out = set()

    def walk(layer_coll):
        if layer_coll.exclude or layer_coll.collection.hide_render:
            out.add(layer_coll.collection.name)
        for child in layer_coll.children:
            walk(child)

    walk(bpy.context.view_layer.layer_collection)
    return out


def main():
    scene = bpy.context.scene

    # Make collection instances real so the exporter sees their geometry.
    for ob in list(scene.objects):
        if ob.instance_type == "COLLECTION" and ob.instance_collection is not None:
            bpy.ops.object.select_all(action="DESELECT")
            ob.hide_set(False)
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            try:
                bpy.ops.object.duplicates_make_real(use_base_parent=True, use_hierarchy=True)
            except Exception as err:  # noqa: BLE001
                report["warnings"].append(f"make_real {ob.name}: {err}")

    hidden_colls = excluded_collections()
    keep = []
    for ob in scene.objects:
        why = None
        if ob.type in EXCLUDED_TYPES:
            why = ob.type.lower()
        elif ob.hide_render:
            why = "hide_render"
        elif any(c.name in hidden_colls for c in ob.users_collection):
            why = "excluded collection"
        if why:
            report["excluded"].append(f"{ob.name} ({why})")
        else:
            keep.append(ob)

    if not any(ob.type in {"MESH", "CURVE", "SURFACE", "META", "FONT"} for ob in keep):
        raise RuntimeError("no renderable geometry after exclusions")

    bpy.ops.object.select_all(action="DESELECT")
    for ob in keep:
        try:
            ob.hide_set(False)
            ob.hide_viewport = False
            ob.select_set(True)
        except RuntimeError as err:
            report["warnings"].append(f"select {ob.name}: {err}")
    report["objects"] = len(keep)

    # Unique image names (exporter dedupe bug) + texture cap.
    for i, img in enumerate(bpy.data.images):
        if img.type != "IMAGE":
            continue
        report["images"] += 1
        img.name = f"i{i:03d}_{img.name}"[:60]
        try:
            w, h = img.size
            if w == 0 or h == 0:
                # Not packed and its external file is not beside the .blend.
                # The exporter would drop the texture and the model would ship
                # untextured - the driver treats a nonzero count as a failure.
                report.setdefault("missing", []).append(img.name)
                continue
            if max(w, h) > MAX_TEXTURE:
                k = MAX_TEXTURE / max(w, h)
                img.scale(max(1, int(w * k)), max(1, int(h * k)))
                report["downscaled"] += 1
        except Exception as err:  # noqa: BLE001  (missing/unloadable image)
            report["warnings"].append(f"image {img.name}: {err}")

    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_image_format="AUTO",
    )
    report["ok"] = True


try:
    main()
except Exception as err:  # noqa: BLE001
    report["error"] = f"{type(err).__name__}: {err}"
    report["trace"] = traceback.format_exc()[-1500:]

with open(REPORT, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)
