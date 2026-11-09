/** Configurable speed cutoffs. Internal symbol IDs are intentionally stable. */
export const DEFAULT_PERCENTILES = Object.freeze([20, 40, 60, 80]);
export const DEFAULT_SPEED_LABELS = Object.freeze(['Very Slow', 'Slow', 'Medium', 'Fast', 'Very Fast']);
export const SPEED_LABELS = [...DEFAULT_SPEED_LABELS];
export const SPEED_LABEL_MAX_LENGTH = 12;

let currentMode = 'percentile';
let currentPercentiles = [...DEFAULT_PERCENTILES];
let manualSpeedValues = null;
let observedSpeeds = null;
// Fallback from the bundled CSV at k=10; replaced by actual sampled speeds on processing.
const K10_REFERENCE = [0.0000378787879, 0.000280306745, 0.000929514468, 0.0102696532];

function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

/** Called by symbolization after k sampling. No recalculation of the trajectory pipeline. */
export function updateObservedSpeeds(sorted) {
  observedSpeeds = sorted;
}

export function getCalculatedSpeedValues(percentiles = currentPercentiles) {
  if (observedSpeeds?.length) return percentiles.map(p => quantile(observedSpeeds, p / 100));
  // Prior to initial processing only the bundled CSV's k=10 defaults are known.
  return percentiles.every((p, i) => p === DEFAULT_PERCENTILES[i]) ? [...K10_REFERENCE] : [...K10_REFERENCE];
}

export function getSpeedSettings() {
  return {
    mode: currentMode,
    percentiles: [...currentPercentiles],
    speedValues: manualSpeedValues ? [...manualSpeedValues] : getCalculatedSpeedValues(),
    labels: [...SPEED_LABELS]
  };
}

export function validateSpeedSettings({mode = 'percentile', percentiles, speedValues, labels}) {
  if (mode !== 'percentile' && mode !== 'speed') throw new Error('Choose Percentile or Speed Value.');
  if (!Array.isArray(percentiles) || percentiles.length !== 4 ||
      !percentiles.every(n => Number.isFinite(n) && n > 0 && n < 100) ||
      !percentiles.every((n, i) => i === 0 || n > percentiles[i - 1])) {
    throw new Error('Percentiles must be four increasing values between 0 and 100.');
  }
  if (mode === 'speed' && (!Array.isArray(speedValues) || speedValues.length !== 4 ||
      !speedValues.every(n => Number.isFinite(n) && n >= 0) ||
      !speedValues.every((n, i) => i === 0 || n > speedValues[i - 1]))) {
    throw new Error('Speed thresholds must be four non-negative, strictly increasing values.');
  }
  if (!Array.isArray(labels) || labels.length !== 5 || labels.some(label =>
    typeof label !== 'string' || !label.trim() ||
    [...label].length > SPEED_LABEL_MAX_LENGTH ||
    !/^[\p{L}\p{N} -]+$/u.test(label)
  )) {
    throw new Error(`Labels must use 1–${SPEED_LABEL_MAX_LENGTH} characters (letters, numbers, spaces or hyphens).`);
  }
}

export function setSpeedSettings(settings) {
  validateSpeedSettings(settings);
  currentMode = settings.mode ?? 'percentile';
  currentPercentiles = [...settings.percentiles];
  manualSpeedValues = currentMode === 'speed' ? [...settings.speedValues] : null;
  SPEED_LABELS.splice(0, SPEED_LABELS.length, ...settings.labels.map(s => s.trim()));
}
