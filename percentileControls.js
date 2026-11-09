import {
  DEFAULT_PERCENTILES, DEFAULT_SPEED_LABELS,
  SPEED_LABEL_MAX_LENGTH, getSpeedSettings, getCalculatedSpeedValues, validateSpeedSettings
} from './speedSettings.js';

/** Compact floating editor, positioned outside the header's overflow:hidden. */
export function createPercentileControls(header, onApply) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'percentile-settings-toggle';
  button.textContent = 'Percentile configuration';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'percentile-settings-panel');
  header.querySelector('#process-dataset').before(button);

  const portal = document.createElement('div');
  portal.className = 'percentile-floating-root';
  const panel = document.createElement('section');
  panel.id = 'percentile-settings-panel';
  panel.className = 'percentile-settings-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Percentile configuration');
  panel.hidden = true;
  portal.append(panel);
  document.body.append(portal);

  const title = document.createElement('div');
  title.className = 'percentile-panel-heading';
  const heading = document.createElement('strong');
  heading.textContent = 'Percentile configuration';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'percentile-panel-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close configuration');
  title.append(heading, closeButton);
  panel.append(title);

  const explanation = document.createElement('p');
  explanation.className = 'percentile-help';
  explanation.textContent = 'Default: P20, P40, P60 and P80 calculate speed cutoffs from sampled trajectories. Select Speed Value to edit the actual cutoffs, initially filled with their calculated values.';
  panel.append(explanation);

  const modeChoice = document.createElement('div');
  modeChoice.className = 'percentile-mode-choice';
  const modeRadios = {};
  [['percentile','Percentile'], ['speed','Speed Value']].forEach(([value, text]) => {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'speed-cutoff-mode';
    radio.value = value;
    label.append(radio, document.createTextNode(text));
    modeChoice.append(label);
    modeRadios[value] = radio;
  });
  panel.append(modeChoice);

  const form = document.createElement('form');
  form.noValidate = true;
  panel.append(form);
  const table = document.createElement('div');
  table.className = 'percentile-paired-grid';
  form.append(table);

  const cutoffHeader = document.createElement('div');
  cutoffHeader.className = 'percentile-column-heading';
  cutoffHeader.textContent = 'Percentile (%)';
  const labelHeader = document.createElement('div');
  labelHeader.className = 'percentile-column-heading';
  labelHeader.textContent = `Speed label (max ${SPEED_LABEL_MAX_LENGTH} chars)`;
  table.append(cutoffHeader, labelHeader);

  const percentileInputs = [];
  const speedInputs = [];
  let speedEdited = false;
  const labelInputs = [];
  DEFAULT_SPEED_LABELS.forEach((_, index) => {
    const cutoffCell = document.createElement('label');
    cutoffCell.className = 'percentile-cutoff-cell';
    if (index < DEFAULT_PERCENTILES.length) {
      const caption = document.createElement('span');
      caption.textContent = `P${index + 1}`;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0.01';
      input.max = '99.99';
      input.step = 'any';
      input.required = true;
      input.setAttribute('aria-label', `Percentile cutoff ${index + 1}`);
      cutoffCell.append(caption, input);
      percentileInputs.push(input);
      const speedInput = document.createElement('input');
      speedInput.type = 'number';
      speedInput.min = '0';
      speedInput.step = 'any';
      speedInput.required = true;
      speedInput.setAttribute('aria-label', `Speed threshold ${index + 1}`);
      speedInput.addEventListener('input', () => {speedEdited = true;});
      cutoffCell.append(speedInput);
      speedInputs.push(speedInput);
    } else {
      cutoffCell.classList.add('percentile-last-bin');
      cutoffCell.textContent = 'Above P4';
    }

    const labelCell = document.createElement('label');
    labelCell.className = 'percentile-label-cell';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = SPEED_LABEL_MAX_LENGTH;
    input.required = true;
    input.setAttribute('aria-label', `Speed label ${index + 1}`);
    labelCell.append(input);
    labelInputs.push(input);
    table.append(cutoffCell, labelCell);
  });
  const error = document.createElement('div');
  error.className = 'percentile-error';
  error.setAttribute('role', 'alert');
  form.append(error);
  const actions = document.createElement('div');
  actions.className = 'percentile-actions';
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Reset to default';
  const applyButton = document.createElement('button');
  applyButton.type = 'submit';
  applyButton.textContent = 'Apply';
  actions.append(resetButton, applyButton);
  form.append(actions);

  function currentMode() {
    return modeRadios.speed.checked ? 'speed' : 'percentile';
  }
  function showMode() {
    const isSpeed = currentMode() === 'speed';
    cutoffHeader.textContent = isSpeed ? 'Speed threshold' : 'Percentile (%)';
    percentileInputs.forEach(input => {input.hidden = isSpeed; input.disabled = isSpeed;});
    speedInputs.forEach(input => {input.hidden = !isSpeed; input.disabled = !isSpeed;});
  }
  function fill(values) {
    modeRadios[values.mode || 'percentile'].checked = true;
    values.percentiles.forEach((v, i) => {percentileInputs[i].value = String(v);});
    const speeds = values.mode === 'speed' ? values.speedValues : getCalculatedSpeedValues(values.percentiles);
    speeds.forEach((v, i) => {speedInputs[i].value = String(Number(v.toPrecision(12)));});
    values.labels.forEach((v, i) => {labelInputs[i].value = v;});
    speedEdited = values.mode === 'speed';
    showMode();
    error.textContent = '';
  }
  modeRadios.percentile.addEventListener('change', showMode);
  modeRadios.speed.addEventListener('change', () => {
    if (!speedEdited) {
      const percentiles = percentileInputs.map(input => Number(input.value));
      const speeds = getCalculatedSpeedValues(percentiles);
      speeds.forEach((v, i) => {speedInputs[i].value = String(Number(v.toPrecision(12)));});
    }
    showMode();
  });
  function position() {
    const rect = button.getBoundingClientRect();
    const width = Math.min(390, window.innerWidth - 16);
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    panel.style.width = `${width}px`;
    const below = window.innerHeight - rect.bottom;
    panel.style.top = below >= 400 || rect.top < below ? `${rect.bottom + 5}px` : '8px';
    panel.style.maxHeight = below >= 400 || rect.top < below
      ? `${Math.max(140, window.innerHeight - rect.bottom - 13)}px`
      : `${Math.max(140, rect.top - 16)}px`;
  }
  function close() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }
  function open() {
    fill(getSpeedSettings());
    position();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }
  button.addEventListener('click', event => {
    event.stopPropagation();
    panel.hidden ? open() : close();
  });
  closeButton.addEventListener('click', close);
  panel.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', event => {
    if (!panel.hidden && !portal.contains(event.target) && event.target !== button) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });
  window.addEventListener('resize', () => { if (!panel.hidden) position(); });
  window.addEventListener('scroll', () => { if (!panel.hidden) position(); }, true);
  resetButton.addEventListener('click', () => fill({
    mode: 'percentile', percentiles: DEFAULT_PERCENTILES, labels: DEFAULT_SPEED_LABELS
  }));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const settings = {
      mode: currentMode(),
      percentiles: percentileInputs.map(input => Number(input.value)),
      speedValues: speedInputs.map(input => Number(input.value)),
      labels: labelInputs.map(input => input.value.trim())
    };
    try {
      const activeInputs = settings.mode === 'speed' ? speedInputs : percentileInputs;
      if (activeInputs.some(input => input.value.trim() === '')) {
        throw new Error('All four cutoff values are required.');
      }
      validateSpeedSettings(settings);
      error.textContent = '';
      applyButton.disabled = true;
      resetButton.disabled = true;
      try {
        const applied = await onApply(settings);
        if (applied) close();
        else error.textContent = 'Processing was not completed. Check the dataset status.';
      } finally {
        applyButton.disabled = false;
        resetButton.disabled = false;
      }
    } catch (exception) {
      error.textContent = exception.message;
    }
  });
  return {button, panel};
}
