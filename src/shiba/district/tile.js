const widths={position:3,normal:3,uv:2,_panel_u:1,_panel_v:1,_plinth:1};

export function decodeTile(raw){
  const bytes=raw.byteOffset%4?Uint8Array.from(raw):raw;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(0)!==0x42415931)throw Error('Invalid district mesh');
  const size=view.getUint32(4,true), base=8+Math.ceil(size/4)*4;
  const parts=JSON.parse(new TextDecoder().decode(bytes.subarray(8,8+size)));
  function slice(Ctor,offset,length){
    if(!Number.isInteger(length)||length<0||offset<0||base+offset+length*Ctor.BYTES_PER_ELEMENT>bytes.length)throw Error('Truncated district mesh');
    return new Ctor(bytes.buffer,bytes.byteOffset+base+offset,length);
  }
  return parts.map(({layer,material,offsets,vertices,indices,wide,indexOffset})=>{
    const attributes={};
    for(const [name,offset] of Object.entries(offsets)){
      const width=widths[name];if(!width)throw Error('Unexpected vertex attribute '+name);
      attributes[name]={width,array:slice(name==='normal'?Int8Array:Float32Array,offset,vertices*width)};
    }
    return {layer,material,attributes,vertices,index:slice(wide?Uint32Array:Uint16Array,indexOffset,indices)};
  });
}
