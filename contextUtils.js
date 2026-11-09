import { getCurrentDataset } from './pipeline/dataRegistry.js';
import { proximityRows } from './pipeline/context.js';
/** Busca espacial por frame original; nenhuma transformação da distância é aplicada. */
let proximityPromise;
export function loadProximity() {
  if (getCurrentDataset()) return Promise.resolve(proximityRows().map(r => ({
    userId: String(r.user_id), trajectoryId: String(r.trajectory_id_sperm),
    frame: Number(r.timestamp), type: Number(r.ftid_object), distance: Number(r.distance)
  })).filter(r => Number.isFinite(r.frame) && Number.isFinite(r.distance) && (r.type === 1 || r.type === 2)));
  if (!proximityPromise) proximityPromise = Promise.resolve([])
    .catch(err => { proximityPromise = null; throw err; });
  return proximityPromise;
}

/** Cada célula i corresponde ao intervalo [frame_inicial + 10*i, frame_inicial + 10*(i+1)).
 *  O intervalo final é limitado por frame_final. Para cada ocorrência, conferir
 *  simultaneamente user_id, trajectory_id e timestamp original.
 */
export function queryProximity(rows, trajectories, { types = [1,2], maxDistance = Infinity, stride = getCurrentDataset()?.k || 10 } = {}) {
  const typeSet = new Set(types.map(Number));
  const byId = new Map();
  for (const d of trajectories) {
    const tid = String(d.trajectory_id), user = String(d.user_id);
    const start = Number(d.frame_inicial), end = Number(d.frame_final);
    const value = d[`symbolic_movement_${getCurrentDataset()?.k || 10}`];
    let length = 0;
    try { length = JSON.parse(String(value).replace(/'/g, '"')).length; } catch {}
    if (!Number.isFinite(start) || !Number.isFinite(end) || !length) continue;
    byId.set(`${user}\u0000${tid}`, {start,end,length, cells: new Map()});
  }
  for (const p of rows) {
    if (!typeSet.has(p.type) || p.distance > maxDistance) continue;
    const target = byId.get(`${p.userId}\u0000${p.trajectoryId}`);
    if (!target || p.frame < target.start || p.frame > target.end) continue;
    const index = Math.floor((p.frame - target.start) / stride);
    if (index < 0 || index >= target.length) continue;
    if (!target.cells.has(index)) target.cells.set(index, new Set());
    target.cells.get(index).add(p.type);
  }
  const ids = [];
  const segmentMap = new Map();
  for (const d of trajectories) {
    const key = `${String(d.user_id)}\u0000${String(d.trajectory_id)}`;
    const entry = byId.get(key);
    if (!entry?.cells.size) continue;
    ids.push(String(d.trajectory_id));
    segmentMap.set(key, entry.cells);
  }
  return { ids: [...new Set(ids)], segmentMap };
}
