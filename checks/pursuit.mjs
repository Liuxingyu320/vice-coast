import {assignMissions,broadsideHeading,chaosForStar,copSees,interceptManeuver,mellowCruise,offsetFrom,pressureGoal,pursuitAxes,relativePosition,scoreSpawn,starsFromChaos,stoppedGoal,tickChaos,yieldSpeed} from '../src/pursuit.js';

const facing=(motionA,speed=0,pos={x:0,z:0})=>pursuitAxes({inCar:true,motionA,pos:{...pos,a:motionA},speed,walkV:{x:0,z:0}});
const north=facing(Math.PI,12);
const body={hw:1.05,hl:2.25,a:Math.PI};
const free=()=>true;
let checks=0;
const check=(name,cond)=>{checks++;if(!cond)throw new Error(name)};

const pos={...body,x:3.2,z:80};
for(const [yaw,speed] of [[0,12],[Math.PI/2,12],[Math.PI,20],[-Math.PI/2,-8],[Math.PI/4,12]]){
 const target={...pos,a:yaw},axes=facing(yaw,speed,target);
 const front={...body,...offsetFrom(target,axes,10,3)};
 const plan=interceptManeuver(target,axes,front,0,free);
 const cut=relativePosition(target,axes,plan.goal);
 check('intercept lies on the moving car trajectory '+yaw,plan.passSide===0&&cut.ahead>5&&Math.abs(cut.side)<1e-8);
 const across=broadsideHeading(axes,yaw);
 check('brake heading follows the travel frame '+yaw,Math.abs(Math.sin(across)*axes.fx+Math.cos(across)*axes.fz)<1e-8);
}

const behind={...body,x:pos.x,z:pos.z-12};
const pass=interceptManeuver(pos,north,behind,0,free);
check('rear unit first moves to the flank',pass.passSide===1&&pass.goal.x>pos.x+3&&pass.goal.z<pos.z-7);
const opposite=interceptManeuver(pos,north,behind,pass.passSide,goal=>goal.x<pos.x);
check('rear unit takes the other side when the first is blocked',opposite.passSide===-1);
const flank={...body,...offsetFrom(pos,north,-1,2.5)};
const pressure=relativePosition(pos,north,pressureGoal(pos,north,flank,1,free));
check('pressure closes alongside the moving body',pressure.ahead>0&&pressure.side>1&&pressure.side<body.hw*2);
check('pressure follows the moving car when both flanks are blocked',Math.abs(relativePosition(pos,north,pressureGoal(pos,north,behind,1,()=>false)).side)<1e-8);
const foot=stoppedGoal(pos,north,behind,true,'block');
check('on-foot approach stops inside custody range',Math.abs(Math.hypot(foot.x-pos.x,foot.z-pos.z)-4.8)<1e-8);

const cops=[{x:pos.x,z:60,mission:null},{x:pos.x,z:100,mission:null}];
assignMissions(cops,pos,north);
check('rear cruiser rams',cops[0].mission==='ram'&&cops[1].mission==='block');
cops[0].z=92;
assignMissions(cops,pos,north);
check('block role holds through a small shuffle',cops[1].mission==='block');
cops[1].z=80;cops[1].holding=true;
assignMissions(cops,pos,north);
check('active block keeps its role',cops[1].mission==='block');
cops[1].holding=false;
assignMissions(cops,pos,north);
check('front role swaps when its approach becomes worse',cops[0].mission==='block'&&cops[1].mission==='ram');
{
 const lone=[{x:0,z:0,mission:'ram'}];
 assignMissions(lone,pos,north);
 check('lone cruiser is the blocker',lone[0].mission==='block');
}

check('close cruise is the re3 ratio',Math.abs(mellowCruise(21,5,2,false)-21*27/34)<1e-6);
check('foot approach creeps',mellowCruise(17,10,1,true)<mellowCruise(17,10,1,false));

const spawnAxes=north;
const aheadCross={x:40,z:122,vertical:false},behindSame={x:0,z:40,vertical:true};
check('blocker spawns ahead on a cross street',scoreSpawn(aheadCross,{mission:'block',pos,axes:spawnAxes,partner:null})<scoreSpawn(behindSame,{mission:'block',pos,axes:spawnAxes,partner:null}));
check('rammer spawns behind',scoreSpawn(behindSame,{mission:'ram',pos,axes:spawnAxes,partner:null})<scoreSpawn(aheadCross,{mission:'ram',pos,axes:spawnAxes,partner:null}));

const yielded=yieldSpeed(18,{x:0,z:0},{x:0,z:8,speed:12},{x:0,z:1});
check('the car behind gives way',yielded<12);
check('a car in the other lane does not brake for its partner',yieldSpeed(18,{x:0,z:0},{x:8,z:8,speed:12},{x:0,z:1})===18);

const look={x:0,z:0,yaw:Math.PI},ahead={x:0,z:10},behindLook={x:0,z:-10},far={x:0,z:40};
check('a cop sees the suspect ahead inside 40',copSees(look,ahead,false,true));
check('a cop misses the suspect behind',!copSees(look,behindLook,false,true));
check('a cop misses the suspect at 40',!copSees(look,far,false,true));
check('after the spot, behind still counts',copSees(look,behindLook,true,true));
check('after the spot, distance does not hide',copSees(look,{x:0,z:100},true,true));
check('a building blocks sight after the spot',!copSees(look,ahead,true,false));
check('one star starts at 60 and two at 220',chaosForStar(1)===60&&chaosForStar(2)===220);
check('a cop inside 18 holds the chaos',tickChaos(60,1,true)===60);
let chaos=60;
for(let i=0;i<20;i++)chaos=tickChaos(chaos,1,false);
check('sixty down to forty is still one star',chaos===40&&starsFromChaos(chaos)===1);
chaos=tickChaos(chaos,1,false);
check('one more second clears the star',chaos===39&&starsFromChaos(chaos)===0);
chaos=220;
for(let i=0;i<20;i++)chaos=tickChaos(chaos,2,false);
check('twenty seconds of two stars stays at 200',chaos===200&&starsFromChaos(chaos)===2);
chaos=tickChaos(chaos,2,false);
check('crossing under 200 starts a fresh one star',chaos===60&&starsFromChaos(chaos)===1);

console.log('PASS pursuit '+checks);
