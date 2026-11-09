import { DEFAULT_PERCENTILES, updateObservedSpeeds } from '../speedSettings.js';
const SPEEDS=['Muito_Lento','Lento','Medio','Rapido','Muito_Rapido'];
const quantile=(sorted,q)=>d3.quantileSorted(sorted,q) ?? 0;
function direction(angle){
  const a=((angle+180)%360+360)%360-180;
  return a>-45 && a<=45?'Leste':a>45 && a<=135?'Norte':a>135 || a<=-135?'Oeste':'Sul';
}
export function symbolize(groups,k,{mode='percentile',percentiles=DEFAULT_PERCENTILES,speedValues=null}={}) {
  const sampled=groups.map(points=> {
    const selected=points.filter(p=>p.timestamp % k === 0);
    return selected.slice(1).map((p,i)=> {
      const prev=selected[i];
      const dx=p.x_rotated-prev.x_rotated, dy=p.y_rotated-prev.y_rotated;
      return {...p, speed:Math.hypot(dx,dy), angle:Math.atan2(dy,dx)*180/Math.PI};
    });
  });
  const speeds=sampled.flatMap(g=>g.map(p=>p.speed)).sort((a,b)=>a-b);
  updateObservedSpeeds(speeds);
  const thresholds=mode==='speed' ? speedValues : percentiles.map(p=>quantile(speeds,p/100));
  return sampled.map(g=>g.map(p=> {
    const index=thresholds.findIndex(t=>p.speed<=t);
    const speed=SPEEDS[index<0?4:index];
    return {...p, symbol:`${speed}_${direction(p.angle)}`};
  }));
}
