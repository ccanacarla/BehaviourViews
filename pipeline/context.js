import { getCurrentDataset } from './dataRegistry.js';
/** Frame-accurate proximity: Euclidean center distance <= .02, as in notebook 04. */
let cached=null, previous=null, cachedTables=null;
function proximity(){
  const dataset=getCurrentDataset();
  if(!dataset)return [];
  if(previous===dataset && cached)return cached;
  previous=dataset;cachedTables=null;
  const valid=new Set(dataset.data.map(d=>`${d.user_id}\u0000${d.trajectory_id}`));
  const frames=new Map();
  for(const r of dataset.rows){
    if(r.ftid===0 && !valid.has(`${r.user_id}\u0000${r.trajectory_id}`))continue;
    const key=`${r.user_id}\u0000${r.timestamp}`;
    if(!frames.has(key))frames.set(key,{sperm:[],object:[]});
    frames.get(key)[r.ftid===0?'sperm':'object'].push(r);
  }
  const matches=[], radius=.02, cell=.02;
  for(const frame of frames.values()){
    if(!frame.sperm.length || !frame.object.length)continue;
    const grid=new Map();
    for(const object of frame.object){
      const x=Math.floor(object.x/cell),y=Math.floor(object.y/cell),key=`${x},${y}`;
      if(!grid.has(key))grid.set(key,[]);grid.get(key).push(object);
    }
    for(const sperm of frame.sperm){
      const x=Math.floor(sperm.x/cell),y=Math.floor(sperm.y/cell);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const object of grid.get(`${x+dx},${y+dy}`)||[]){
        if(object.trajectory_id===sperm.trajectory_id)continue;
        const distance=Math.hypot(sperm.x-object.x,sperm.y-object.y);
        if(distance<=radius)matches.push({user_id:sperm.user_id,timestamp:sperm.timestamp,
          trajectory_id_sperm:sperm.trajectory_id,trajectory_id_object:object.trajectory_id,
          ftid_object:object.ftid,distance});
      }
    }
  }
  cached=matches;return matches;
}
export function proximityRows(){return proximity();}
export function symbolsRows(){
  const data=getCurrentDataset();
  return data ? data.valid.flatMap(d=>d.symbols.map(p=>({trajectory_id:p.trajectory_id,
    timestamp:p.timestamp,symbol_10:p.symbol,speed_label_10:p.symbol.split('_').slice(0,-1).join('_'),dir4_label_10:p.symbol.split('_').at(-1)}))) : [];
}
export function contextTables(){
  const data=getCurrentDataset();if(!data)return {summary:[],periods:[]};
  if(cachedTables && previous===data)return cachedTables;
  const byId=new Map(data.data.map(d=>[d.trajectory_id,d]));
  const symById=new Map(data.valid.map(d=>[d.points[0].trajectory_id,d.symbols]));
  const events=new Map();
  for(const r of proximity()){
    const key=`${r.trajectory_id_sperm}\u0000${r.trajectory_id_object}`;
    if(!events.has(key))events.set(key,[]);events.get(key).push(r);
  }
  function symbolAt(samples,t){let found='';for(const s of samples){if(s.timestamp>t)break;found=s.symbol;}return found;}
  const periods=[];
  for(const ev of events.values()){
    ev.sort((a,b)=>a.timestamp-b.timestamp);
    let partition=[],start=-Infinity;
    function commit(){
      if(!partition.length)return;
      const first=partition[0],last=partition[partition.length-1],tid=first.trajectory_id_sperm;
      const samples=symById.get(tid)||[];
      const before=symbolAt(samples,first.timestamp-1),during=symbolAt(samples,first.timestamp),after=symbolAt(samples,last.timestamp+1);
      periods.push({sperm_tid:tid,neighbor_tid:first.trajectory_id_object,neighbor_ftid:first.ftid_object,
        neighbor_type:['sperm','debris','pinhead'][first.ftid_object],user_id:first.user_id,
        period_start:first.timestamp,period_end:last.timestamp,duration_frames:last.timestamp-first.timestamp+1,
        observed_frames:partition.length,min_dist:Math.min(...partition.map(p=>p.distance)),
        mean_dist:d3.mean(partition,p=>p.distance),symbol_before:before,symbol_during:during,symbol_after:after,
        behavior_change:before!==during || during!==after});
    }
    for(const item of ev){if(item.timestamp>start+1){commit();partition=[];}partition.push(item);start=item.timestamp;}
    commit();
  }
  const summary=data.data.map(d=>{
    const relevant=periods.filter(p=>p.sperm_tid===d.trajectory_id);
    const result={sperm_tid:d.trajectory_id,n_frames_symbolic:(symById.get(d.trajectory_id)||[]).length,
      shannon_entropy:d.shannon_entropy,cluster_symbolic:d.cluster,phys_cluster:d.phys_cluster};
    for(const type of ['debris','pinhead','sperm']){
      const matches=relevant.filter(p=>p.neighbor_type===type);
      result[`n_frames_near_${type}`]=matches.reduce((sum,p)=>sum+p.observed_frames,0);
      result[`n_periods_${type}`]=matches.length;
      result[`max_dur_${type}`]=Math.max(0,...matches.map(p=>p.duration_frames));
      result[`behavior_change_near_${type}`]=matches.some(p=>p.behavior_change);
    }
    return result;
  });
  cachedTables={summary,periods};return cachedTables;
}
