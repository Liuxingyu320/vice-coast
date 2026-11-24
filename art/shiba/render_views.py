"""Render the three authored Blender cameras to a given folder."""

from pathlib import Path
import sys
import bpy

target = Path(sys.argv[sys.argv.index("--") + 1])
scene = bpy.context.scene
for frame, name in [(1, "shiba-cover"), (2, "shiba-area"), (3, "shiba-walk")]:
    scene.frame_set(frame)
    scene.render.film_transparent = frame == 2
    scene.render.filepath = str(target / (name + ".png"))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    bpy.ops.render.render(write_still=True)
