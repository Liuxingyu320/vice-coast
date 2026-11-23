export const routes={deal:'谈条件',mix:'现场混音',stand:'当众对质'};
export const stages=['new','intro','sleeve','ride','party','case','escape','return','done'];
export function readLedger(raw={}){
 const valid=r=>Object.hasOwn(routes,r);
 const ending=['return','keep'].includes(raw?.ending)?raw.ending:null;
 const stage=ending?'done':stages.slice(0,-1).includes(raw?.stage)?raw.stage:'new';
 return {stage,ending,active:!!raw?.active,route:valid(raw?.route)?raw.route:null,lead:valid(raw?.lead)?raw.lead:'deal',clue:!!raw?.clue,visited:!!raw?.visited,carLine:!!raw?.carLine};
}
export const garagePrice=(save,price)=>price&&Math.round(price*(save.chapter?.ending==='return'?.8:1));

const frequencyStages=['new','door','bar','needle','crew','haul','card','dial','offer','done'];
export function readMidnight(raw,ledger){
 const item=(value,values)=>values.includes(value)?value:values[0];
 const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
 const outcome=ledger.ending?item(raw?.outcome,[null,'live','sponsor']):null;
 const stage=outcome?'done':ledger.ending?item(raw?.stage,frequencyStages.slice(0,-1)):'new';
 return {stage,outcome,tips:count(raw?.tips),shows:count(raw?.shows),pass:stage!=='new'&&!!raw?.pass,
  vinyl:item(raw?.vinyl,['idle','carrying','catalogued','delivered']),
  bag:item(raw?.bag,['idle','looking','found','returned','sold'])};
}
