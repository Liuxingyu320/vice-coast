// Public street districts around the corresponding Tokyo Metro / Toei / JR stations.
const stations=[
  ['芝公园',35.65424,139.74989],['东京塔',35.65859,139.74545],['六本木',35.66284,139.73133],
  ['麻布十番',35.65650,139.73616],['虎之门',35.66747,139.74776],['三田',35.64803,139.74812],
  ['新桥',35.66539,139.75984],['滨松町',35.65540,139.75673],['赤坂',35.67217,139.73630],
  ['竹芝',35.65399,139.76192],['赤羽桥',35.65504,139.74398],['神谷町',35.66296,139.74505]
];

export function neighborhoods({lon,lat,east,north}){
  return stations.map(([name,latitude,longitude])=>({name,x:(longitude-lon)*east,z:(lat-latitude)*north}));
}
export function neighborhoodAt(places,pos){
  let nearest=places[0],best=Infinity;
  for(const place of places){
    const d=(place.x-pos.x)**2+(place.z-pos.z)**2;
    if(d<best){best=d;nearest=place;}
  }
  return nearest.name;
}
