// The first three indices are part of the original vehicle save format.
export const vehicles=[
 {key:'marlin',name:'MARLIN TURBO'},
 {key:'solano',name:'SOLANO GT'},
 {key:'van',name:'PALM WAVE · 转播车',cargoHeight:2.62},
 ...[
  ['pelican','鹈鹕敞篷',0xe48585,151.5,37,1.04,1.04,.88,1.57],
  ['nara','木饰旅行车',0x598e88,151.5,118,.92,.94,1.68,1.18],
  ['rook','棋格出租车',0xedb647,151.5,99,.96,.96,.98,1.76],
  ['barranca','湾岸皮卡',0x548aaa,169.95,-182,.89,.90,1.09,1.38],
  ['marea','潮汐露营车',0xc79b77,169.95,-59,.78,.83,2.43,.88],
  ['bahia','海湾越野车',0xafbc80,169.95,-46,.95,1.03,1.91,.82],
  ['cricket','蟋蟀微型车',0x98bda3,151.5,18,1.08,1.16,1.60,.65],
  ['jetty','栈桥沙滩车',0xeab25f,169.95,-21,1.12,1.14,.88,1.17],
  ['lido','里维埃拉巡航车',0x84bed0,72.4,-64,.89,.87,.93,1.79],
  ['horizon','地平线拉力车',0xc27061,72.4,-42,1.13,1.08,1.15,1.55],
  ['mercado','市集厢式货车',0x8daca1,72.4,-21,.77,.84,2.35,1.25]
 ].map(([key,name,color,x,z,power,steering,cargoHeight,cargoBack],i)=>({
  key,name,color,x,z,a:x<160?Math.PI:0,power,steering,cargoHeight,cargoBack,parkingId:17+i,
  seatHeight:key==='pelican'?.46:key==='jetty'?.41:null
 }))
];
export const additions=vehicles.slice(3);

// Approximate the clothes at long range, where each resident uses one draw call.
export const residents={
 grease:[0x365a62,0x365a62,0xb78266],skater:[0xa9bfc0,0x526481,0xa66e55],
 florist:[0xb8797c,0x4e6260,0x99674f],rigger:[0xdf8f3e,0x434954,0xa8745c],
 guard:[0xe4c38f,0xb74047,0xaa7157],busker:[0xa7714f,0x485060,0xb17c62],
 lens:[0x7c8f96,0x584b4a,0xae785c],courier:[0x668b7c,0x394f60,0xb67f61],
 cook:[0xe4ddc9,0x41474c,0xac7961],reed:[0xd7c4ac,0x554950,0xae7c66],
 angler:[0x70838a,0x655747,0xab785e]
};
export const streetResidents=Object.keys(residents);

export const streetVoices={
 grease:['船坞机修工','MARINA WORKSHOP','听见船坞那阵敲铁声了吗？那是我徒弟，今天第一次给老拖船换铭牌。','你那台蓝皮卡呢？','在码头南边，货斗里那排磨亮的筋条是装船缆磨出来的。'],
 skater:['滑板手','BOARDWALK','我喜欢唱片店关门前这十分钟。玻璃上有灯，能照清板子落地的位置。','那块板怎么缺了角？','上礼拜练翻板，板头钻进花摊底下。人没摔，赔了两枝百合。'],
 florist:['花商','FLOWER MARKET','别捏花瓣，托着茎就好。这一小束是给夜班厨师留的，他每周都来。','他喜欢哪种花？','最便宜的那种。他说窗子朝巷子，桌上有点颜色就成。'],
 rigger:['码头装卸工','DOCK CREW','我小时候光听回音，就知道是哪条船靠岸。现在声音最大的反倒是推车那颗坏轮子。','今天卸的是什么？','三托盘玻璃杯。卸到最后一箱，整条码头的人都不敢打喷嚏。'],
 guard:['海滩救生员','BEACH PATROL','我记人全靠遮阳伞。每天六点，那把条纹伞收起来，我就知道有人要下班了。','浮筒上那道白痕呢？','去年有人拿它当枕头，防晒霜怎么擦都擦不干净。'],
 busker:['街头吉他手','BOARDWALK SESSIONS','刚才那段前奏我弹了三遍。有个小孩在等红灯，非要听到最后那个和弦。','再后来呢？','灯都绿过两轮了，他爸只好把车停下，陪他把整首听完。'],
 lens:['摄影师','COASTAL FILM','我剩一格底片，正等木饰旅行车从橱窗前开过去。晚霞映在木条上特别好看。','为什么只剩一格？','前二十张都给了一只站在停车计时器上的海鸥。它一张也没买。'],
 courier:['单车信使','COAST DISPATCH','你看我背包上的油渍。夜市那家把馅饼包了三层，香味还是先我一步上楼。','哪一单最难送？','写着“三楼，门口有猫”的那单。那栋楼每一层都有猫。'],
 cook:['夜市厨师','LATE KITCHEN','收摊前最后一锅饭我自己看火。底下那层焦脆的，有人专门绕街来等。','你给谁留一份？','卖花的。她给我的玻璃杯里，总是比昨天多一朵花。'],
 reed:['萨克斯手','AFTER HOURS','第一次在火烈鸟吹这支中音，台底下只有三个客人。现在其中两个还会来。','第三个呢？','第三个买下了吧台。每回我走音，他就故意把冰块摇得特别响。'],
 angler:['码头钓客','SUNSET PIER','今天一条也没钓着。旁边那只鹈鹕倒好，趁我转身叼走了半个三明治。','那你还坐到几点？','等电台放完最后一首。鱼什么时候来是鱼的事。']
};
