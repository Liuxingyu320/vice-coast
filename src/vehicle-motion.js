import {clamp} from './data.js';

// Shared handling for the original city and surveyed Shiba streets, in metres and radians.
export function advanceDrive(state,dt,keys,sand=false){
  const p=state.pos,forward=keys.has('KeyW'),reverse=keys.has('KeyS'),steer=Number(keys.has('KeyA'))-Number(keys.has('KeyD'));
  const {engine,brakes,nitro}=state.carId===0?state.save.mods:{engine:0,brakes:0,nitro:0};
  const hand=keys.has('Space'),boost=keys.has('ShiftLeft')&&forward&&state.boost>.015&&!state.emptyBoost;
  if(!keys.has('ShiftLeft')||state.boost>.32)state.emptyBoost=false;
  state.boost=clamp(state.boost+(boost?-.30/(1+.35*nitro):.105)*dt,0,1);if(state.boost<.015)state.emptyBoost=true;
  const oldSpeed=state.speed;const drag=(sand?.63:.16)*state.speed;
  if(forward)state.speed+=(state.speed< -1?23:(boost?20.5:12.8)*(state.carSpec.power??1))*(1+.13*engine)*dt;
  if(reverse)state.speed-=(state.speed>1?25*(1+.18*brakes):7.0)*dt;
  state.speed-=drag*dt;const braking=(hand?13:!forward&&!reverse?2.1:.23)*dt;
  state.speed-=Math.sign(state.speed)*Math.min(Math.abs(state.speed),braking);
  state.speed=clamp(state.speed,-8,sand?17:boost?48+3*engine:Math.max(34+3*engine,oldSpeed-dt*6));
  state.smoothSteer+=(steer-state.smoothSteer)*(1-Math.exp(-dt*7));
  p.a+=state.smoothSteer*Math.sign(state.speed)*Math.min(Math.abs(state.speed)*.26,hand?2.35:1.42)*(state.carSpec.steering??1)*dt;
  const diff=Math.atan2(Math.sin(p.a-state.motionA),Math.cos(p.a-state.motionA));state.motionA+=diff*(1-Math.exp(-dt*(hand?2.8:8)));
}
