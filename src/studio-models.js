const models = new Map();
export function registerStudioAssets(entries) {
  for (const [name,model] of entries) models.set(name,model);
}
export const studioModel=name=>models.get(name).clone(true);
export function rigSlots(model){
 const slots={};
 model.traverse(node=>{if(node.userData.rigSlot)slots[node.userData.rigSlot]=node});
 return slots;
}
