/** Mirrors the notebook: sperm-only, >=100 frames and no timestamp gap >1. */
export function preprocess(rows, minFrames = 100) {
  const grouped = new Map();
  for (const r of rows) {
    if (r.ftid !== 0) continue;
    const key = `${r.user_id}\u0000${r.trajectory_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(r);
  }
  const result = [];
  for (const key of [...grouped.keys()].sort((a,b) => {const x=a.split("\u0000")[1],y=b.split("\u0000")[1];return x<y?-1:x>y?1:0;})) {
    const samples=grouped.get(key);
    if (samples.length < minFrames) continue;
    samples.sort((a,b) => a.timestamp-b.timestamp);
    if (samples.some((r,i) => i && r.timestamp-samples[i-1].timestamp > 1)) continue;
    const x0=samples[0].x, y0=samples[0].y;
    const mx=d3.mean(samples,r=>r.x-x0), my=d3.mean(samples,r=>r.y-y0);
    let xx=0, yy=0, xy=0;
    for (const r of samples) {
      const x=r.x-x0-mx, y=r.y-y0-my;
      xx+=x*x;yy+=y*y;xy+=x*y;
    }
    let theta=0.5*Math.atan2(2*xy,xx-yy);
    const last=samples[samples.length-1], displacement=[last.x-x0,last.y-y0];
    if (Math.cos(theta)*displacement[0]+Math.sin(theta)*displacement[1]<0) theta+=Math.PI;
    if (Math.hypot(...displacement)<1e-14) {
      const moving=samples.find(r=>Math.hypot(r.x-x0,r.y-y0)>1e-14);
      if(moving && Math.cos(theta)*(moving.x-x0)+Math.sin(theta)*(moving.y-y0)<0)theta+=Math.PI;
    }
    const c=Math.cos(theta), s=Math.sin(theta);
    const rotated=samples.map(r=> {
      const x=r.x-x0,y=r.y-y0;
      return {...r, x_translate:x, y_translate:y, x_rotated:x*c+y*s, y_rotated:-x*s+y*c};
    });
    result.push(rotated);
  }
  return result;
}
