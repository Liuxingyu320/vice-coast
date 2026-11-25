"""Bake actual Three instance matrices and chart UVs into selectable Blender street meshes."""

import json
import numpy as np
import bpy
from native_instances import point_instances


def add_street_reference(cache, make, coll, names, mats):
    for row in json.loads((cache / "street-reference.json").read_text()):
        key = row["name"]
        mat = bpy.data.materials.new(key)
        names.append(key)
        mats.append(mat)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bs = nodes.get("Principled BSDF")
        bs.inputs["Roughness"].default_value = row["rough"] or 0.7
        bs.inputs["Metallic"].default_value = row["metal"] or 0
        bs.inputs["Base Color"].default_value = (*row["color"], 1)
        bs.inputs["Alpha"].default_value = row["alpha"]
        if row["emission"] and any(row["emission"]):
            bs.inputs["Emission Color"].default_value = (*row["emission"], 1)
            bs.inputs["Emission Strength"].default_value = 0.42
        if row["map"] >= 0:
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(
                str(
                    cache
                    / (
                        "street-chart-"
                        + str(row["map"])
                        + (".png" if row["cutout"] else ".jpg")
                    )
                ),
                check_existing=True,
            )
            links.new(tex.outputs["Color"], bs.inputs["Base Color"])
            if row["cutout"]:
                links.new(tex.outputs["Alpha"], bs.inputs["Alpha"])
                mat.surface_render_method = "DITHERED"
        if row["colors"]:
            node = nodes.new("ShaderNodeVertexColor")
            node.layer_name = "Paint"
            links.new(node.outputs["Color"], bs.inputs["Base Color"])
            if row["name"] == "Signal bulbs":
                links.new(node.outputs["Color"], bs.inputs["Emission Color"])
                bright = nodes.new("ShaderNodeMath")
                bright.operation = "GREATER_THAN"
                bright.inputs[1].default_value = 0.12
                links.new(node.outputs["Color"], bright.inputs[0])
                links.new(bright.outputs[0], bs.inputs["Emission Strength"])
        transforms = np.asarray(row["matrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
        pos = np.asarray(row["pos"]).reshape(-1, 3)
        uv = np.asarray(row["uv"]).reshape(-1, 2)
        if len(transforms) > 35 and not row["cells"]:
            point_instances(
                row, transforms, pos, uv, make, coll("街具・店舗｜実景"), len(mats) - 1
            )
            continue
        xyz = (
            np.einsum("nij,vj->nvi", transforms[:, :3, :3], pos)
            + transforms[:, :3, 3][:, None, :]
        )
        xyz = xyz[:, :, [0, 2, 1]]
        xyz[:, :, 1] *= -1
        if row["cells"]:
            cell = np.asarray(row["cells"]).reshape(-1, 3)[:, :2]
            uv = (cell[:, None, :] + 0.004 + uv[None, :, :] * 0.992) / row["grid"]
        else:
            uv = np.tile(uv, (len(xyz), 1))
        faces = (np.arange(len(xyz))[:, None] * len(pos) + row["indices"]).reshape(
            -1, 3
        )
        ob = make(
            key,
            (
                xyz.reshape(-1, 3),
                faces,
                uv.reshape(-1, 2),
                np.full(len(faces), len(mats) - 1),
            ),
            coll("街具・店舗｜実景"),
        )
        if row["colors"]:
            colors = np.asarray(row["colors"]).reshape(-1, 3).repeat(len(pos), axis=0)
            rgba = np.ascontiguousarray(
                np.column_stack((colors, np.ones(len(colors)))), "f4"
            )
            attr = ob.data.color_attributes.new(
                name="Paint", type="FLOAT_COLOR", domain="POINT"
            )
            attr.data.foreach_set("color", rgba.ravel())
