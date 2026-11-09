import {
  DEFAULT_PERCENTILES, DEFAULT_SPEED_LABELS, SPEED_LABEL_MAX_LENGTH,
  getSpeedSettings, setSpeedSettings, getCalculatedSpeedValues,
  validateSpeedSettings
} from '../speedSettings.js';
/** Barra compacta: CSV estático; processamento exclusivamente no navegador. */
const DATASET_URL = './data/visem_all_trajectory.csv';

export function initUploadControls(onSubmit) {
  const host = document.querySelector('.container');
  const bar = document.createElement('form');
  bar.id = 'dataset-controls';
  bar.setAttribute('aria-label', 'BehaviourRug settings');
  // Keep existing control IDs and the form submission handler unchanged.
  // Only the compact title row occupies layout space; settings float above the views.
  bar.innerHTML = `
    <button id="dataset-menu-toggle" type="button" aria-label="Open processing settings"
            aria-controls="dataset-settings-popover" aria-expanded="false" title="Processing settings">☰</button>
    <strong class="app-brand">BehaviourViews</strong>
    <div id="dataset-settings-popover" class="dataset-settings-popover" hidden>
      <span class="dataset-settings-heading">Processing settings</span>
      <span class="dataset-name" title="Dataset loaded automatically">visem_all_trajectory.csv</span>
      <div class="dataset-settings-fields">
        <label for="symbolic-clusters">Symbolic clusters</label>
        <input id="symbolic-clusters" aria-label="Symbolic clusters" type="number" min="1" max="100" step="1" value="5" required>
        <label for="metric-clusters">Metric clusters</label>
        <input id="metric-clusters" aria-label="Metric clusters" type="number" min="1" max="100" step="1" value="5" required>
        <label for="sampling-k">Sampling k</label>
        <input id="sampling-k" aria-label="k amostragem" type="number" min="1" max="1000" step="1" value="10" required>
      </div>
      <section class="speed-classification" aria-label="Speed classification">
        <button id="speed-classification-toggle" type="button" class="speed-classification-toggle"
                aria-expanded="false" aria-controls="speed-classification-content">
          <span class="speed-classification-toggle-copy">
            <strong>Speed classification</strong>
            <small id="speed-classification-summary">Percentiles · P20, P40, P60, P80</small>
          </span>
          <span class="speed-classification-chevron" aria-hidden="true">⌄</span>
        </button>
        <div id="speed-classification-content" class="speed-classification-content" hidden></div>
      </section>
      <div class="dataset-settings-footer">
        <button id="process-dataset" type="submit">Process</button>
        <span id="dataset-status" role="status" aria-live="polite">Preparing dataset…</span>
      </div>
    </div>`;
  host.prepend(bar);

  const menuToggle = bar.querySelector('#dataset-menu-toggle');
  const menu = bar.querySelector('#dataset-settings-popover');
  const setMenuOpen = open => {
    menu.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close processing settings' : 'Open processing settings');
  };
  menuToggle.addEventListener('click', () => setMenuOpen(menu.hidden));
  document.addEventListener('pointerdown', event => {
    if (!menu.hidden && !bar.contains(event.target) &&
        !event.target.closest('.percentile-settings-panel')) setMenuOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden &&
        document.querySelector('#percentile-settings-panel[hidden]')) {
      setMenuOpen(false);
      menuToggle.focus();
    }
  });
  const button = bar.querySelector('#process-dataset');
  const status = bar.querySelector('#dataset-status');
  let datasetFile = null;
  let busy = false;

  async function run() {
    if (!datasetFile || busy) return false;
    const clusters = Number(bar.querySelector('#symbolic-clusters').value);
    const metricClusters = Number(bar.querySelector('#metric-clusters').value);
    const k = Number(bar.querySelector('#sampling-k').value);
    if (!Number.isInteger(clusters) || clusters < 1 || !Number.isInteger(k) || k < 1 || !Number.isInteger(metricClusters) || metricClusters < 1 || metricClusters > 100) {
      status.textContent = 'Enter valid positive integer parameters.';
      return false;
    }
    busy = true;
    button.disabled = true;
    try {
      await onSubmit(datasetFile, {clusters, metricClusters, k, speedSettings: getSpeedSettings()}, message => { status.textContent = message; });
      status.textContent = 'Processing complete';
      return true;
    } catch (error) {
      console.error(error);
      status.textContent = `Error: ${error.message}`;
      return false;
    } finally {
      busy = false;
      button.disabled = false;
    }
  }
  bar.addEventListener('submit', event => {event.preventDefault(); void run();});
  initSpeedClassification(bar, async settings => {
    if (busy || !datasetFile) return false;
    const previous = getSpeedSettings();
    setSpeedSettings(settings);
    const success = await run();
    if (!success) setSpeedSettings(previous);
    return success;
  });

  async function loadDefault() {
    try {
      status.textContent = 'Loading CSV…';
      const response = await fetch(DATASET_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${DATASET_URL}`);
      const blob = await response.blob();
      datasetFile = new File([blob], 'visem_all_trajectory.csv', {type: 'text/csv'});
      status.textContent = 'CSV loaded';
      await run();
    } catch (error) {
      console.error(error);
      status.textContent = `Failed to load CSV: ${error.message}`;
    }
  }
  void loadDefault();
  return {run, bar};
}


/** Inline speed editor inside the existing menu, without a nested form or floating dialog. */
function initSpeedClassification(bar, onApply) {
  const toggle = bar.querySelector('#speed-classification-toggle');
  const section = bar.querySelector('#speed-classification-content');
  const summary = bar.querySelector('#speed-classification-summary');
  const caption = bar.querySelector('.speed-classification-chevron');

  section.innerHTML = `
    <p class="speed-classification-help">Default speed categories use the 20th, 40th, 60th and 80th percentiles of sampled trajectories. Switch to Speed Value to edit the calculated speed cutoffs directly.</p>
    <div class="speed-classification-modes" role="radiogroup" aria-label="Speed cutoff mode">
      <label><input type="radio" name="inline-speed-mode" value="percentile"> Percentile</label>
      <label><input type="radio" name="inline-speed-mode" value="speed"> Speed Value</label>
    </div>
    <div class="speed-classification-grid">
      <strong id="speed-classification-cutoff-heading">Percentile (%)</strong>
      <strong>Speed label (max ${SPEED_LABEL_MAX_LENGTH})</strong>
    </div>
    <div class="speed-classification-error" role="alert"></div>
    <div class="speed-classification-actions">
      <button class="speed-classification-reset" type="button">Reset to default</button>
      <button class="speed-classification-apply" type="button">Apply</button>
    </div>`;

  const grid = section.querySelector('.speed-classification-grid');
  const modeRadios = {
    percentile: section.querySelector('input[value="percentile"]'),
    speed: section.querySelector('input[value="speed"]')
  };
  const cutoffHeading = section.querySelector('#speed-classification-cutoff-heading');
  const error = section.querySelector('.speed-classification-error');
  const reset = section.querySelector('.speed-classification-reset');
  const apply = section.querySelector('.speed-classification-apply');
  const percentiles = [];
  const speeds = [];
  const labels = [];
  let manualEdited = false;

  DEFAULT_SPEED_LABELS.forEach((_, i) => {
    const cell = document.createElement('div');
    cell.className = 'speed-classification-cutoff';
    if (i < 4) {
      const rowId = document.createElement('span');
      rowId.textContent = String(i + 1);
      const percentile = document.createElement('input');
      percentile.type = 'number';
      percentile.min = '0.01';
      percentile.max = '99.99';
      percentile.step = 'any';
      percentile.setAttribute('aria-label', `Percentile cutoff ${i + 1}`);
      const speed = document.createElement('input');
      speed.type = 'number';
      speed.min = '0';
      speed.step = 'any';
      speed.setAttribute('aria-label', `Speed threshold ${i + 1}`);
      speed.addEventListener('input', () => { manualEdited = true; });
      cell.append(rowId, percentile, speed);
      percentiles.push(percentile);
      speeds.push(speed);
    } else {
      cell.classList.add('speed-classification-last');
      cell.textContent = 'Above last threshold';
    }
    const labelCell = document.createElement('div');
    labelCell.className = 'speed-classification-label';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = SPEED_LABEL_MAX_LENGTH;
    input.setAttribute('aria-label', `Speed label ${i + 1}`);
    labelCell.append(input);
    labels.push(input);
    grid.append(cell, labelCell);
  });

  const mode = () => modeRadios.speed.checked ? 'speed' : 'percentile';
  const formatSpeed = value => Number(value.toPrecision(12)).toString();
  function refreshInputs() {
    const usingSpeed = mode() === 'speed';
    cutoffHeading.textContent = usingSpeed ? 'Speed threshold' : 'Percentile (%)';
    percentiles.forEach(input => { input.hidden = usingSpeed; input.disabled = usingSpeed; });
    speeds.forEach(input => { input.hidden = !usingSpeed; input.disabled = !usingSpeed; });
  }
  function fill(settings) {
    modeRadios[settings.mode === 'speed' ? 'speed' : 'percentile'].checked = true;
    percentiles.forEach((input, i) => {input.value = String(settings.percentiles[i]);});
    const thresholds = settings.mode === 'speed'
      ? settings.speedValues : getCalculatedSpeedValues(settings.percentiles);
    speeds.forEach((input, i) => {input.value = formatSpeed(thresholds[i]);});
    labels.forEach((input, i) => {input.value = settings.labels[i];});
    manualEdited = settings.mode === 'speed';
    error.textContent = '';
    refreshInputs();
  }
  function updateSummary() {
    const current = getSpeedSettings();
    summary.textContent = current.mode === 'speed'
      ? 'Speed Value · Custom'
      : `Percentiles · ${current.percentiles.map(v => `P${v}`).join(', ')}`;
  }
  function setExpanded(expanded) {
    section.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    caption.textContent = expanded ? '⌃' : '⌄';
    if (expanded) fill(getSpeedSettings());
  }

  toggle.addEventListener('click', () => setExpanded(section.hidden));
  modeRadios.percentile.addEventListener('change', refreshInputs);
  modeRadios.speed.addEventListener('change', () => {
    if (!manualEdited) {
      const values = percentiles.map(input => Number(input.value));
      speeds.forEach((input, i) => {
        input.value = formatSpeed(getCalculatedSpeedValues(values)[i]);
      });
    }
    refreshInputs();
  });
  reset.addEventListener('click', () => fill({
    mode: 'percentile', percentiles: DEFAULT_PERCENTILES,
    labels: DEFAULT_SPEED_LABELS
  }));
  apply.addEventListener('click', async () => {
    const selectedInputs = mode() === 'speed' ? speeds : percentiles;
    try {
      if (selectedInputs.some(input => input.value.trim() === '')) {
        throw new Error('All four cutoff values are required.');
      }
      const settings = {
        mode: mode(),
        percentiles: percentiles.map(input => Number(input.value)),
        speedValues: speeds.map(input => Number(input.value)),
        labels: labels.map(input => input.value.trim())
      };
      validateSpeedSettings(settings);
      error.textContent = '';
      apply.disabled = true;
      reset.disabled = true;
      try {
        const applied = await onApply(settings);
        if (applied) {
          updateSummary();
          setExpanded(false);
        } else {
          error.textContent = 'Processing was not completed. Check the dataset status.';
        }
      } finally {
        apply.disabled = false;
        reset.disabled = false;
      }
    } catch (exception) {
      error.textContent = exception.message;
    }
  });
  // The settings belong to the outer processing form, but must not submit it on Enter.
  section.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      apply.click();
    }
  });
  updateSummary();
  return {toggle, section};
}
