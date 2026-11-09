import { contextTables, symbolsRows } from './context.js';
const levels={Muito_Lento:0,Lento:1,Medio:2,Rapido:3,Muito_Rapido:4};
export function searchTemporal(plan){
  const {periods}=contextTables(),symbols=new Map();
  for(const r of symbolsRows()){
    if(!symbols.has(r.trajectory_id))symbols.set(r.trajectory_id,[]);
    symbols.get(r.trajectory_id).push([+r.timestamp,levels[r.speed_label_10],r.symbol_10]);
  }
  const episodes=[],neighbor=plan.neighborType||'all',slowWindow=+plan.slowdownWithinFrames||20,
    recoveryWindow=+plan.recoveryWithinFrames||60,lookback=+plan.baselineLookbackFrames||30,
    drop=+plan.minSpeedDrop||1;
  for(const p of periods){
    if(neighbor!=='all'&&p.neighbor_type!==neighbor)continue;
    if(p.duration_frames<(plan.minDuration||0))continue;
    const seq=symbols.get(p.sperm_tid)||[];
    const baseline=[...seq].reverse().find(s=>s[0]<p.period_start&&s[0]>=p.period_start-lookback);
    if(!baseline)continue;
    const slow=seq.find(s=>s[0]>p.period_end&&s[0]<=p.period_end+slowWindow&&s[1]<=baseline[1]-drop);
    if(!slow)continue;
    const recovered=seq.find(s=>s[0]>slow[0]&&s[0]<=slow[0]+recoveryWindow&&s[1]>=baseline[1]);
    if(plan.requireRecovery!==false&&!recovered)continue;
    episodes.push({sperm_tid:p.sperm_tid,neighbor_tid:p.neighbor_tid,neighbor_type:p.neighbor_type,
      period_start:p.period_start,period_end:p.period_end,baseline_frame:baseline[0],baseline_symbol:baseline[2],
      slowdown_frame:slow[0],slowdown_symbol:slow[2],recovery_frame:recovered?.[0]??null,recovery_symbol:recovered?.[2]??null});
  }
  const trajectory_ids=[...new Set(episodes.map(e=>e.sperm_tid))];
  return {trajectory_ids,n_trajectories:trajectory_ids.length,n_episodes:episodes.length,episodes:episodes.slice(0,200)};
}
