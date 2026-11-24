"""Physical detail layers for the editable Blender scene, using the same offline charts."""

import bpy


def detail_materials(obj, feature, assets, cache):
    terrain = feature in ("shiba-ground", "skyline-ground")
    for slot in obj.material_slots:
        base = slot.material
        photo = base.name.startswith(
            ("Facade ", "Backdrop facade", "Temple Facade", "Tower Facade")
        )
        if not (terrain or photo):
            continue
        key = ("Terrain detail · " if terrain else "Survey detail · ") + base.name
        if key in cache:
            slot.material = cache[key]
            continue
        m = base.copy()
        m.name = key
        slot.material = m
        cache[key] = m
        tree = m.node_tree
        node = tree.nodes.new
        link = tree.links.new
        bs = tree.nodes.get("Principled BSDF")
        albedo = bs.inputs["Base Color"].links[0].from_socket
        geometry = node("ShaderNodeNewGeometry")
        position = geometry.outputs["Position"]

        def vector(op, a, b):
            f = node("ShaderNodeVectorMath")
            f.operation = op
            link(a, f.inputs[0])
            if op != "FRACTION":
                f.inputs[1].default_value = b
            return f.outputs["Vector"]

        def mix(a, b, amount, mode="MIX"):
            f = node("ShaderNodeMixRGB")
            f.blend_type = mode
            if isinstance(amount, float):
                f.inputs[0].default_value = amount
            else:
                link(amount, f.inputs[0])
            link(a, f.inputs[1])
            link(b, f.inputs[2])
            return f.outputs[0]

        if terrain:
            atlas = bpy.data.images.load(
                str(assets / "shiba-ground-detail.jpg"), check_existing=True
            )
            coords = vector(
                "FRACTION", vector("MULTIPLY", position, (1 / 1.65, 1 / 1.65, 0)), None
            )
            coords = vector("MULTIPLY", coords, (0.992 / 3, 0.992, 0))
            maps = []
            for i in range(3):
                tex = node("ShaderNodeTexImage")
                tex.image = atlas
                link(
                    vector("ADD", coords, ((i + 0.004) / 3, 0.004, 0)),
                    tex.inputs["Vector"],
                )
                maps.append(tex.outputs["Color"])
            channels = node("ShaderNodeSeparateColor")
            link(albedo, channels.inputs[0])
            green = node("ShaderNodeMath")
            green.operation = "SUBTRACT"
            link(channels.outputs["Green"], green.inputs[0])
            link(channels.outputs["Red"], green.inputs[1])
            mask = node("ShaderNodeMapRange")
            link(green.outputs[0], mask.inputs[0])
            mask.inputs[1].default_value = -0.024
            mask.inputs[2].default_value = 0.034
            ground = mix(mix(maps[2], maps[1], 0.54), maps[0], mask.outputs[0])
            camera = node("ShaderNodeCameraData").outputs["View Distance"]
            near = node("ShaderNodeMapRange")
            link(camera, near.inputs[0])
            for i, value in enumerate([30.0, 220.0, 0.92, 0.0], 1):
                near.inputs[i].default_value = value
            link(mix(albedo, ground, near.outputs[0]), bs.inputs["Base Color"])
            bs.inputs["Emission Strength"].default_value = 0
            bs.inputs["Roughness"].default_value = 0.95
        else:
            if base.name.startswith("Temple Facade"):
                finish = node("ShaderNodeTexImage")
                finish.image = bpy.data.images.load(
                    str(assets / "shiba-temple-joinery.jpg"), check_existing=True
                )
                finish.projection = "BOX"
                finish.projection_blend = 0.12
                relative = vector("ADD", position, (0.0, 0.0, -7.5))
                link(
                    vector("MULTIPLY", relative, (1 / 7.2, 1 / 7.2, 1 / 3.3)),
                    finish.inputs["Vector"],
                )
                z = node("ShaderNodeSeparateXYZ")
                link(geometry.outputs["Normal"], z.inputs[0])
                absolute = node("ShaderNodeMath")
                absolute.operation = "ABSOLUTE"
                link(z.outputs["Z"], absolute.inputs[0])
                mask = node("ShaderNodeMapRange")
                link(absolute.outputs[0], mask.inputs[0])
                for port, value in enumerate([0.25, 0.68, 0.78, 0.0], 1):
                    mask.inputs[port].default_value = value
                link(
                    mix(albedo, finish.outputs["Color"], mask.outputs[0]),
                    bs.inputs["Base Color"],
                )
                bs.inputs["Emission Strength"].default_value = 0.025
            if base.name.startswith(("Facade ", "Backdrop facade")):
                p = vector("MULTIPLY", position, (1 / 19.2, 1 / 19.2, 1 / 26.4))
                finish = node("ShaderNodeTexImage")
                finish.image = bpy.data.images["Metal sash.jpg"]
                finish.projection = "BOX"
                finish.projection_blend = 0.12
                link(p, finish.inputs["Vector"])
                link(
                    mix(albedo, finish.outputs["Color"], 0.22, "SOFT_LIGHT"),
                    bs.inputs["Base Color"],
                )
        grain = node("ShaderNodeTexNoise")
        grain.inputs["Scale"].default_value = 92 if terrain else 76
        grain.inputs["Detail"].default_value = 2
        link(position, grain.inputs["Vector"])
        bump = node("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.19
        bump.inputs["Distance"].default_value = 0.010 if terrain else 0.006
        link(grain.outputs["Fac"], bump.inputs["Height"])
        link(bump.outputs[0], bs.inputs["Normal"])
