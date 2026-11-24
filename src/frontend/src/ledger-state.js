const stages=['new','stall','deposit','door','pay','again','againPay','note','shop','drop','wait','fight','alley','done'];
const oldStages=new Set(['intro','sleeve','ride','party','case','escape','return']);
export function droppedStory(raw){
 if(!raw||typeof raw!=='object')return false;
 if(raw.ending||raw.route||raw.lead||raw.clue||raw.visited)return true;
 if(oldStages.has(raw.stage))return true;
 if(raw.stage==='done'&&!raw.joined)return true;
 return false;
}
export function readLedger(raw={}){
 if(droppedStory(raw))raw={};
 const stage=stages.includes(raw.stage)?raw.stage:'new';
 const at=name=>stages.indexOf(stage)>=stages.indexOf(name);
 const flag=key=>!!raw[key];
 return {
  stage,
  active:stage!=='new'&&!!raw.active,
  deposit:flag('deposit')||at('door'),
  message:flag('message')||at('pay'),
  firstPay:flag('firstPay')||at('again'),
  habit:flag('habit')||at('note'),
  note:flag('note')||at('shop'),
  carrying:stage==='drop',
  dropped:flag('dropped')||at('wait'),
  wagesCut:flag('wagesCut')||at('fight'),
  rescued:flag('rescued')||at('alley'),
  joined:stage==='done'
 };
}
export const garagePrice=(_save,price)=>price;
