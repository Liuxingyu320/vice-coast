"""Reopen the packed .blend in Blender, evaluate its placements and render the saved camera."""

import json
import sys
from pathlib import Path
import bpy
import numpy as np


def collection(prefix):
    return next(c for c in bpy.data.collections if c.name.startswith(prefix))


def verify(output):
    layout = json.loads(
        (Path(__file__).resolve().parents[1] / "assets/shiba-layout.json").read_text()
    )
    buildings = collection("建物｜")
    trees = collection("植生｜航空")
    street = collection("街具・店舗")
    assert (
        len(buildings.objects)
        == len({o["feature_id"] for o in buildings.objects})
        == len(layout["footprints"])
    )
    assert len(trees.objects) == len(layout["trees"])
    images = [im for im in bpy.data.images if im.source == "FILE"]
    assert all(im.packed_file and im.filepath.startswith("//") for im in images)
    assert bpy.data.images.get("shiba-rooms.jpg")
    deps = bpy.context.evaluated_depsgraph_get()
    batches = {}
    for ob in street.objects:
        if not ob.modifiers:
            continue
        mesh = ob.evaluated_get(deps).data
        assert len(mesh.polygons) > len(ob.data.vertices) and len(mesh.vertices) > len(
            ob.data.vertices
        ), ob.name
        xy = np.empty(len(mesh.vertices) * 3, "f4")
        mesh.vertices.foreach_get("co", xy)
        assert np.isfinite(xy).all(), ob.name
        batches[ob.name] = [len(ob.data.vertices), len(mesh.polygons)]
    assert len(batches) >= 6
    scene = bpy.context.scene
    scene.frame_set(1)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.render.resolution_x = 680
    scene.render.resolution_y = 425
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(output.resolve())
    bpy.ops.render.render(write_still=True)
    assert output.is_file()
    print(
        "NATIVE_AUDIT",
        json.dumps(
            dict(
                buildings=len(buildings.objects),
                trees=len(trees.objects),
                streetGroups=len(street.objects),
                packedImages=len(images),
                evaluatedGeometry=batches,
            ),
            ensure_ascii=False,
        ),
    )


if __name__ == "__main__":
    verify(Path(sys.argv[sys.argv.index("--") + 1]))
