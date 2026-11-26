// Sites for the touring record shop and outdoor show in the surveyed Shiba district.
// Coordinates use the native renderer's local metres (east, south).
export const streetSpawn = {x:459.6,z:146.9,a:1.38};
const site = (x,z,label) => ({x,z,label,type:'chapter'});

export const chapterSites = {
  intro:site(455.4,146.1,'与三解脱门对面的玛拉交谈'),
  sleeve:site(457.6,140.2,'查看唱片摊上的首版封套'),
  ride:site(450.1,183.8,'到芝公园的演出入口找妮娜'),
  deal:site(449.8,200.3,'和卡洛斯谈条件'),
  mix:site(459.0,204.1,'到调音台找玛拉'),
  stand:site(452.8,208.6,'走到立麦前，当众对质'),
  board:site(446.8,193.4,'操作演出灯光台'),
  case:site(456.0,199.6,'打开长桌上的母带箱'),
  escape:site(450.1,183.8,'请妮娜核对母带编号'),
  return:site(439.5,243.4,'到公园转播点找老维克'),
  farewell:site(439.5,243.4,'向老维克告别'),
  shop:site(457.6,140.2,'回访波音唱片摊'),
  club:site(450.1,183.8,'回访演出后台')
};
export const nightSites = {
  new:site(445.5,244,'到公园转播点和玛拉谈午夜档'),door:chapterSites.ride,
  bar:site(444,195,'找后台的鼓手蒂托'),needle:chapterSites.mix,
  crew:site(462,193,'找搬运班长帕兹'),haul:site(454,190,'把音箱送到演出区'),
  card:site(459,207,'在调音台取回调频磁卡'),
  dial:site(443.5,247,'在公园转播点接通电台'),offer:site(446,246,'和雷蒙决定午夜档归属'),
  stall:site(464,131,'和旧唱片摊主露兹聊聊'),crate:chapterSites.sleeve,
  photo:site(445,232,'和摄影师伊内丝交谈'),bag:site(436,256,'在公园步道找相机包'),
  deliver:site(445,232,'把相机包还给伊内丝'),sell:site(462,193,'将相机包交给帕兹')
};
export function fitSites(sites,nav) {
  return Object.fromEntries(Object.entries(sites).map(([id,site])=>{
    const p=nav.walkNear(site.x,-site.z);
    if(!p) throw Error('Unreachable story site '+id);
    return [id,{...site,x:p[0],z:-p[1]}];
  }));
}

export const nightCopy={
  newSignal:'公园转播台的排期上，午夜那一格还空着。雷蒙想买走它，循环播他的广告。我想让大家先听完那晚停电后的掌声。',
  dialChoice:'装好磁卡，到公园转播点接台',dialDirections:'沿步道走到公园转播点，在桌上的电台插入磁卡。',
  crateDirections:'唱片筐已拿好。沿步道往南，把它交给首版唱片摊的老维克。',
  lostCamera:'我刚在芝公园的步道拍完一卷底片，现在肩上只剩一条带子。帆布包有黄铜扣。你能帮我沿路找找吗？',
  searchChoice:'沿公园步道找找',searchDirections:'伊内丝指向了公园转播点南边的那段步道。',
  bagNote:'去公园转播点南边的步道找带黄铜扣的帆布包。',
  returnNote:'把包还给步道上的伊内丝，或交给演出区的帕兹。'
};
