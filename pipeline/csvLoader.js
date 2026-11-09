/** CSV uploaded by the user; no server uploads. */
export async function readTrajectoryCSV(file, onProgress = () => {}) {
  if (!file || !/\.csv$/i.test(file.name)) throw new Error('Select a CSV file.');
  onProgress('Lendo CSV local...');
  const text = await file.text();
  const rows = d3.csvParse(text, d => ({
    user_id: String(d.user_id), trajectory_id: String(d.trajectory_id),
    timestamp: +d.timestamp, ftid: +d.ftid,
    x: +d.x, y: +d.y, w: +d.w, h: +d.h
  }));
  if (!rows.length || rows.some(r => !r.trajectory_id || !Number.isFinite(r.timestamp) || !Number.isFinite(r.x) || !Number.isFinite(r.y) || ![0,1,2].includes(r.ftid))) {
    throw new Error('CSV vazio ou colunas inválidas. Esperado: user_id, timestamp, trajectory_id, ftid, x, y, w, h.');
  }
  return rows;
}
