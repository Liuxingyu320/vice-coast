"""Render the two menu stills from the saved production scene."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector

scene=bpy.context.scene
root=Path(bpy.data.filepath).parent
night='night' in sys.argv[sys.argv.index('--')+1:]
out=Path(sys.argv[-1])
if night:
    scene.camera=bpy.data.objects['02 • Crossing and bay railway']
    scene.camera.location=(166,-74,4.5)
    scene.camera.rotation_euler=(Vector((134,-16,10.5))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.lens=27
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.17
    sun=bpy.data.lights['Last sunlight'];sun.energy=.71;sun.color=(.43,.63,1)
    for m in bpy.data.materials:
        if not m.use_nodes:continue
        bs=m.node_tree.nodes.get('Principled BSDF')
        if bs and m.name=='Print':bs.inputs['Emission Strength'].default_value=1.07
    def glow(name,pos,color,energy,radius):
        lamp=bpy.data.lights.new(name,'POINT');lamp.color=color;lamp.energy=energy;lamp.shadow_soft_size=radius
        obj=bpy.data.objects.new(name,lamp);scene.collection.objects.link(obj);obj.location=pos
    for i,z in enumerate([-20,16,48,68,104]):
        glow('Street sodium '+str(i),(167,-z,6.9),(1,.61,.26),410,1.3)
        glow('Storefront spill '+str(i),(144,-z,3.6),(1,.54,.28),300,1.15)
    glow('Ferry cafe',(179,-56,3.4),(1,.53,.22),340,1)
    # The same dusk gradient becomes a deep blue sky after the last train.
    ramp=next(n for n in scene.world.node_tree.nodes if n.type=='VALTORGB' and len(n.color_ramp.elements)==5)
    for elem,col in zip(ramp.color_ramp.elements,[(.29,.23,.34,1),(.16,.23,.37,1),(.09,.16,.29,1),(.05,.08,.19,1),(.025,.055,.12,1)]):elem.color=col
    mix=next(n for n in scene.world.node_tree.nodes if n.type=='MIX_RGB')
    mix.inputs[2].default_value=(.23,.26,.35,1)
scene.render.filepath=str(out)
scene.cycles.samples=26 if night else 20
bpy.ops.render.render(write_still=True)
