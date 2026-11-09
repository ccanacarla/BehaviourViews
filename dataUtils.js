import { SPEED_STRINGS, DIRECTION_STRINGS } from './config.js';

export function normalizeToken(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
}

export function getSpeed(symbol) {
    if (!symbol) return null;
    const t = normalizeToken(symbol);

    if (t.includes("muito_rapido") || t.includes("muito-rapido") || t.includes("muitorapido")) return "Muito_Rapido";
    if (t.includes("muito_lento") || t.includes("muito-lento") || t.includes("muitolento")) return "Muito_Lento";

    if (t.includes(normalizeToken(SPEED_STRINGS?.LENTO ?? "lento"))) return "Lento";
    if (t.includes(normalizeToken(SPEED_STRINGS?.MEDIO ?? "medio"))) return "Medio";

    if (
      t.includes(normalizeToken(SPEED_STRINGS?.RAPIDO ?? "rapido")) ||
      (SPEED_STRINGS?.RAPIDO_ALT && t.includes(normalizeToken(SPEED_STRINGS.RAPIDO_ALT)))
    ) return "Rapido";
    
    if (t.includes("parado")) return "Parado";

    return null;
}

export function getDirection(symbol) {
    if (!symbol) return null;
    const t = normalizeToken(symbol);
    
    if (t.includes(normalizeToken(DIRECTION_STRINGS.NORTE)) || t.includes("_n")) return DIRECTION_STRINGS.N;
    if (t.includes(normalizeToken(DIRECTION_STRINGS.SUL)) || t.includes("_s")) return DIRECTION_STRINGS.S;
    if (t.includes(normalizeToken(DIRECTION_STRINGS.LESTE)) || t.includes("_e") || t.includes("_l")) return DIRECTION_STRINGS.E;
    if (t.includes(normalizeToken(DIRECTION_STRINGS.OESTE)) || t.includes("_o") || t.includes("_w")) return DIRECTION_STRINGS.W;
    
    return null;
}

export function parseSequence(rawJson) {
    let seq = [];
    try {
        if (rawJson) {
            const jsonStr = String(rawJson).replace(/'/g, '"');
            const rawSeq = JSON.parse(jsonStr);
            if (Array.isArray(rawSeq)) {
                seq = rawSeq.map(s => {
                    if (!s) return { empty: true };
                    const speed = getSpeed(s);
                    const dir = getDirection(s);
                    return { raw: s, speed, dir };
                });
            }
        }
    } catch (e) {}
    return seq;
}

export function getLentoIndices(seq, active = true) {
    const highlightIndices = new Set();
    if (!active) return highlightIndices;
    const k = 3;
    for (let i = 0; i <= seq.length - k; i++) {
        let match = true;
        for (let j = 0; j < k; j++) {
            if (!seq[i + j] || seq[i + j].empty || seq[i + j].speed !== "Muito_Lento") {
                match = false;
                break;
            }
        }
        if (match) {
            for (let j = 0; j < k; j++) highlightIndices.add(i + j);
        }
    }
    return highlightIndices;
}

export function getTurnIndices(seq, active = true) {
    const highlightIndices = new Set();
    if (!active) return highlightIndices;
    for (let i = 0; i < seq.length - 1; i++) {
        const curr = seq[i];
        const next = seq[i + 1];
        if (curr && !curr.empty && next && !next.empty && curr.dir && next.dir) {
            if ((curr.dir == "N" && next.dir == "S") || (curr.dir == "S" && next.dir == "N") || (curr.dir == "E" && next.dir == "W") || (curr.dir == "W" && next.dir == "E")) {
                highlightIndices.add(i);
                highlightIndices.add(i + 1);
            }
        }
    }
    return highlightIndices;
}

export function hasLentoMotif(seq) {
    return getLentoIndices(seq).size > 0;
}

export function hasTurnMotif(seq) {
    return getTurnIndices(seq).size > 0;
}

export function getCustomMotifIndices(seq, pattern) {
    const highlightIndices = new Set();
    if (!pattern) return highlightIndices;

    let steps = [];
    if (typeof pattern === 'string') {
        if (!pattern.trim()) return highlightIndices;
        steps = pattern.trim().split(/\s+/).map(t => ({ raw: t }));
    } else if (Array.isArray(pattern)) {
        steps = pattern.filter(p => p.speed || p.dir);
    }

    if (steps.length === 0) return highlightIndices;

    const k = steps.length;
    for (let i = 0; i <= seq.length - k; i++) {
        let match = true;
        for (let j = 0; j < k; j++) {
            if (!seq[i + j] || seq[i + j].empty) {
                match = false;
                break;
            }
            
            const step = steps[j];
            const item = seq[i + j];

            if (step.raw) {
                const itemToken = normalizeToken(item.raw);
                if (!itemToken.includes(normalizeToken(step.raw))) {
                    match = false;
                    break;
                }
            } else {
                if (step.speed && item.speed !== step.speed) {
                    match = false;
                    break;
                }
                if (step.dir && item.dir !== step.dir) {
                    match = false;
                    break;
                }
            }
        }
        if (match) {
            for (let j = 0; j < k; j++) highlightIndices.add(i + j);
        }
    }
    return highlightIndices;
}

export function hasCustomMotif(seq, pattern) {
  if (!pattern) return false;
  // If pattern is a single motif configuration (array of steps) or a string
  if (typeof pattern === 'string') return pattern.trim() !== "" && getCustomMotifIndices(seq, pattern).size > 0;
  
  // Check if it's an array of Motif Definitions (the new structure)
  // Each element has { pattern: [...] }
  // OR if it's just the old single motif pattern (Array of objects with speed/dir)
  if (Array.isArray(pattern)) {
      // Check if it's the old single pattern structure (steps)
      const isSteps = pattern.length > 0 && (pattern[0].speed !== undefined || pattern[0].dir !== undefined || Object.keys(pattern[0]).length === 0);
      
      if (isSteps) {
          return pattern.some(p => p.speed || p.dir) && getCustomMotifIndices(seq, pattern).size > 0;
      } else {
          // Assume it's an array of Motif Definitions (Multiple motifs)
          // We return TRUE if ALL active motifs are present (AND logic for filtering)
          // Filter out empty motifs first
          const active = pattern.filter(m => m.pattern && m.pattern.some(p => p.speed || p.dir));
          if (active.length === 0) return true; // No active filters implies pass? Or fail? Usually if custom is checked but empty, it's pass.
          
          return active.every(m => getCustomMotifIndices(seq, m.pattern).size > 0);
      }
  }
  
  return false;
}

export function getAllCustomMotifIndices(seq, customMotifs) {
    const results = [];
    if (!Array.isArray(customMotifs)) return results;
    
    customMotifs.forEach(m => {
        if (m.pattern && m.pattern.some(p => p.speed || p.dir)) {
            const indices = getCustomMotifIndices(seq, m.pattern);
            if (indices.size > 0) {
                results.push({
                    indices: indices,
                    color: m.color,
                    name: m.name
                });
            }
        }
    });
    return results;
}
/**
 * Parses trajectory string into an array of points [x, y].
 */
export function parseTrajectoryData(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str;

  const s = String(str).trim();
  if (!s) return [];

  const num = "[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?";
  const pairRe = new RegExp(`\\(\\s*(${num})\\s*,\\s*(${num})\\s*\\)`, "g");

  const points = [];
  let m;

  while ((m = pairRe.exec(s)) !== null) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
  }

  if (!points.length) {
    const allNums = s.match(new RegExp(num, "g")) || [];
    for (let i = 0; i + 1 < allNums.length; i += 2) {
      const x = Number(allNums[i]);
      const y = Number(allNums[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
    }
  }

  return points;
}

export function calculateDuration(points) {
    return points ? points.length : 0;
}

export function calculateStraightLineDistance(points) {
    if (!points || points.length < 2) return 0;
    const p1 = points[0];
    const p2 = points[points.length - 1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    return Math.sqrt(dx*dx + dy*dy);
}