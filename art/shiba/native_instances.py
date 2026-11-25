"""Keep repeatable streetscape parts editable as one mesh and a field of transforms."""

import bpy
import numpy as np
from mathutils import Matrix


def point_instances(row, transforms, pos, uv, make, collection, material):
    axes = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]])
    faces = np.asarray(row["indices"], dtype="i4").reshape(-1, 3)
    source = make(
        row["name"] + " · Section",
        (
            np.column_stack((pos[:, 0], -pos[:, 2], pos[:, 1])),
            faces,
            uv,
            np.full(len(faces), material),
        ),
        collection,
        center=False,
    )
    # GN references the original mesh of this object; keep only the instancer in the scene.
    collection.objects.unlink(source)
    mesh = bpy.data.meshes.new(row["name"] + " · Sites")
    mesh.vertices.add(len(transforms))
    mesh.vertices.foreach_set(
        "co",
        np.ascontiguousarray(
            np.column_stack(
                (transforms[:, 0, 3], -transforms[:, 2, 3], transforms[:, 1, 3])
            ),
            "f4",
        ).ravel(),
    )
    for name, values in [("Scale", []), ("Rotation", [])]:
        for transform in transforms:
            m = Matrix(np.einsum("ip,pq,jq->ij", axes, transform[:3, :3], axes))
            values.append(tuple(m.to_scale() if name == "Scale" else m.to_euler("XYZ")))
        attr = mesh.attributes.new(name, "FLOAT_VECTOR", "POINT")
        attr.data.foreach_set("vector", np.asarray(values, dtype="f4").ravel())
    if row["colors"]:
        rgb = np.asarray(row["colors"]).reshape(-1, 3)
        paint = mesh.color_attributes.new(
            name="Paint", type="FLOAT_COLOR", domain="POINT"
        )
        paint.data.foreach_set(
            "color",
            np.asarray(np.column_stack((rgb, np.ones(len(rgb)))), dtype="f4").ravel(),
        )
    obj = bpy.data.objects.new(row["name"], mesh)
    collection.objects.link(obj)
    mod = obj.modifiers.new("Repeated survey geometry", "NODES")
    tree = bpy.data.node_groups.new(row["name"] + " · Placement", "GeometryNodeTree")
    mod.node_group = tree
    for direction in ["INPUT", "OUTPUT"]:
        tree.interface.new_socket(
            name="Geometry", in_out=direction, socket_type="NodeSocketGeometry"
        )
    nodes = tree.nodes
    links = tree.links.new
    points = nodes.new("NodeGroupInput")
    proto = nodes.new("GeometryNodeObjectInfo")
    proto.inputs["Object"].default_value = source
    inst = nodes.new("GeometryNodeInstanceOnPoints")
    links(points.outputs["Geometry"], inst.inputs["Points"])
    links(proto.outputs["Geometry"], inst.inputs["Instance"])
    for name in ["Rotation", "Scale"]:
        attr = nodes.new("GeometryNodeInputNamedAttribute")
        attr.data_type = "FLOAT_VECTOR"
        attr.inputs["Name"].default_value = name
        links(attr.outputs["Attribute"], inst.inputs[name])
    realize = nodes.new("GeometryNodeRealizeInstances")
    links(inst.outputs["Instances"], realize.inputs["Geometry"])
    links(realize.outputs["Geometry"], nodes.new("NodeGroupOutput").inputs["Geometry"])
    mesh.update()
