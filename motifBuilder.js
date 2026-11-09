import { SPEED_LABELS } from './speedSettings.js';
import { createFloatingBuilder } from './floatingBuilder.js';
/** Motif Builder: editor visual de padrões com N passos, compatível com dataUtils.js. */
export const SPEEDS = ['Muito_Lento', 'Lento', 'Medio', 'Rapido', 'Muito_Rapido'];
export const SPEEDS_EN = SPEED_LABELS;
export const DIRECTIONS = ['N', 'E', 'S', 'W'];
// Mesma paleta utilizada em behaviourrug.js.
export const SPEED_COLORS = {
  Muito_Lento: '#29558f', Lento: '#569fcc', Medio: '#81d28d',
  Rapido: '#fcb359', Muito_Rapido: '#d73027'
};
const MOTIF_COLORS = ['#8e44ad', '#2980b9', '#27ae60', '#e67e22', '#e74c3c', '#16a085'];
const ROTATION = { N: 0, E: 90, S: 180, W: 270 };
const LABELS = { N: 'North', E: 'East', S: 'South', W: 'West' };
let instanceId = 0;
const copy = motifs => Array.isArray(motifs) ? motifs.map(m => ({ ...m, pattern: (m.pattern || []).map(p => ({ ...p })) })) : [];
const hasData = p => Boolean(p.speed || p.dir);
const stepDescription = p => `${SPEEDS_EN[SPEEDS.indexOf(p.speed)] || 'Any speed'}, ${LABELS[p.dir] || 'any direction'}`;

/**
 * @param {d3.Selection} parentSelection - Container na barra de controles.
 * @param {{initialMotifs?:Array,onChange?:(motifs:Array)=>void}} options
 */
export function createMotifBuilder(parentSelection, { initialMotifs = [], onChange = () => { } } = {}) {
  const ns = `.motifBuilder${++instanceId}`;
  let motifs = copy(initialMotifs);
  let steps = [];
  let pending = { speed: null, dir: null };
  let editIndex = -1;
  let draft = { name: `Motif ${motifs.length + 1}`, color: MOTIF_COLORS[motifs.length % MOTIF_COLORS.length] };
  let dirty = false;
  let uniqueId = 0;

  const root = parentSelection.append('div').attr('class', 'dropdown motif-builder-dropdown');
  root.append('span').attr('class', 'mb-toolbar-label').text('Motif:');
  const toggle = root.append('button').attr('type', 'button').attr('class', 'dropdown-toggle mb-toggle').attr('aria-expanded', 'false').text('Build');
  const panel = root.append('div').attr('class', 'dropdown-content mb-panel').classed('show', false).attr('role', 'dialog').attr('aria-label', 'Motif Builder');
  const floating = createFloatingBuilder(toggle.node(), panel.node(), 'motif');
  // Fechamento discreto: sem cabeçalho para poupar espaço vertical.
  panel.append('button').attr('type', 'button').attr('class', 'mb-close')
    .attr('aria-label', 'Close builder').attr('title', 'Close').text('×').on('click', close);
  const metadata = panel.append('section').attr('class', 'mb-section mb-section-meta');
  const preview = panel.append('section').attr('class', 'mb-section mb-section-pattern');
  const edit = panel.append('section').attr('class', 'mb-section mb-section-edit');
  const commit = panel.append('section').attr('class', 'mb-section mb-section-commit');
  const list = panel.append('section').attr('class', 'mb-section mb-section-list');
  panel.on('click', event => event.stopPropagation());

  function close() { panel.classed('show', false); toggle.attr('aria-expanded', 'false'); }
  function open() { d3.selectAll('.dropdown-content.show').classed('show', false); floating.open(); panel.classed('show', true); toggle.attr('aria-expanded', 'true'); }
  toggle.on('click', event => { event.stopPropagation(); panel.classed('show') ? close() : open(); });
  d3.select(window).on(`click${ns}`, close).on(`keydown${ns}`, event => { if (event.key === 'Escape') close(); });
  function emit() { onChange(copy(motifs)); dirty = false; render(); }
  function reset() { steps = []; pending = { speed: null, dir: null }; editIndex = -1; draft = { name: `Motif ${motifs.length + 1}`, color: MOTIF_COLORS[motifs.length % MOTIF_COLORS.length] }; }

  // Triângulo quando há direção: base na borda correspondente,
  // vértice voltado para o centro. Sem direção, use um quadrado;
  // a cor continua representando a velocidade escolhida.

  function glyph(selection, step, small = false, rugStyle = false) {
    const color = SPEED_COLORS[step.speed] || '#e5e7eb';

    const svg = selection.append('svg')
      .attr('class', 'mb-glyph')
      .attr('viewBox', '0 0 40 40')
      .attr('width', small ? 20 : 26)
      .attr('height', small ? 20 : 26)
      .attr('role', 'img')
      .attr('aria-label', stepDescription(step));

    if (rugStyle) {
      // Fundo com a cor da velocidade
      svg.append('rect')
        .attr('x', 2)
        .attr('y', 2)
        .attr('width', 36)
        .attr('height', 36)
        .attr('rx', 4)
        .attr('ry', 4)
        .attr('fill', '#e5e7eb')
        .attr('stroke', 'none');

      if (step.dir) {
        // Triângulo: vértice no centro e base na direção.
        // N = cima, E = direita, S = baixo, W = esquerda.
        svg.append('path')
          .attr('d', 'M20 20 L6 5 L34 5 Z')
          .attr(
            'transform',
            `rotate(${ROTATION[step.dir] ?? 0} 20 20)`
          )
          .attr('fill', color)
          .attr('stroke', 'none')
          .attr('stroke-dasharray', 'none');
      } else if (!step.speed) {
        svg.append('text')
          .attr('x', 20)
          .attr('y', 26)
          .attr('text-anchor', 'middle')
          .attr('font-size', 16)
          .attr('font-weight', 'bold')
          .text('?');
      }

    } else {
      // Desenho original, preservado para os outros controles
      if (step.dir) {
        svg.append('path')
          .attr('d', 'M4 6 L36 6 L20 34 Z')
          .attr(
            'transform',
            `rotate(${ROTATION[step.dir] ?? 0} 20 20)`
          )
          .attr('fill', color)
          .attr('stroke', '#a5a5a7');

      } else {
        svg.append('rect')
          .attr('x', 7)
          .attr('y', 7)
          .attr('width', 26)
          .attr('height', 26)
          .attr('fill', color)
          .attr('stroke', '#334155')
          .attr('stroke-width', '1.2');

        if (!step.speed) {
          svg.append('text')
            .attr('x', 20)
            .attr('y', 26)
            .attr('text-anchor', 'middle')
            .attr('font-size', 16)
            .attr('font-weight', 'bold')
            .text('?');
        }
      }
    }

    selection.attr('title', stepDescription(step));
  }

  function heading(parent, index, title) { parent.append('div').attr('class', 'mb-section-title').text(`${index}. ${title}`); }
  function render() { renderMetadata(); renderPreview(); renderEditor(); renderCommit(); renderList(); }
  function renderEditor() {
    edit.selectAll('*').remove(); heading(edit, 3, editIndex >= 0 ? `Edit step ${editIndex + 1}` : `Define step ${steps.length + 1}`);
    edit.append('div').attr('class', 'mb-subtitle').text('Speed');
    const speeds = edit.append('div').attr('class', 'mb-speed-options');
    SPEEDS.forEach((s, i) => {
      const btn = speeds.append('button').attr('type', 'button').attr('class', `mb-speed-option ${pending.speed === s ? 'is-selected' : ''}`)
        .attr('aria-pressed', String(pending.speed === s)).attr('title', SPEEDS_EN[i]);
      btn.append('span').attr('class', 'mb-color-dot').style('background-color', SPEED_COLORS[s]);
      btn.append('span').text(SPEEDS_EN[i]);
      btn.on('click', () => { pending.speed = pending.speed === s ? null : s; renderEditor(); });
    });
    edit.append('div').attr('class', 'mb-subtitle').text('Direction');
    const dirs = edit.append('div').attr('class', 'mb-direction-options');
    DIRECTIONS.forEach(d => {
      const btn = dirs.append('button').attr('type', 'button').attr('class', `mb-direction-option ${pending.dir === d ? 'is-selected' : ''}`)
        .attr('aria-pressed', String(pending.dir === d)).attr('title', LABELS[d]);
      glyph(btn, { speed: pending.speed, dir: d }, true); btn.append('span').text(d);
      btn.on('click', () => { pending.dir = pending.dir === d ? null : d; renderEditor(); });
    });
    const row = edit.append('div').attr('class', 'mb-actions-row');
    row.append('button').attr('type', 'button').attr('class', 'mb-btn mb-btn--secondary')
      .property('disabled', !hasData(pending)).text(editIndex < 0 ? '+ Add Step' : 'Save Step')
      .on('click', () => {
        if (!hasData(pending)) return;
        if (editIndex >= 0) steps[editIndex] = { ...pending }; else steps.push({ ...pending });
        pending = { speed: null, dir: null }; editIndex = -1; render();
      });
    if (editIndex >= 0) row.append('button').attr('type', 'button').attr('class', 'mb-btn mb-btn--quiet').text('Cancel edit').on('click', () => { editIndex = -1; pending = { speed: null, dir: null }; render(); });
  }
  function renderPreview() {
    preview.selectAll('*').remove();
    heading(preview, 2, 'Current pattern');
    preview.append('span').attr('class', 'mb-counter').text(`${steps.length} step${steps.length === 1 ? '' : 's'}`);
    const strip = preview.append('div').attr('class', 'mb-step-strip');
    if (!steps.length) strip.append('p').attr('class', 'mb-empty').text('Add a step to start your sequence.');
    steps.forEach((step, i) => {
      const tile = strip.append('div').attr('class', `mb-step-tile ${editIndex === i ? 'is-editing' : ''}`);
      const select = tile.append('button').attr('type', 'button').attr('class', 'mb-step-select').attr('aria-label', `Edit step ${i + 1}: ${stepDescription(step)}`);
      glyph(select, step, false, true);
      select.append('small').text(`Step ${i + 1}`);
      select.on('click', () => { editIndex = i; pending = { ...step }; render(); });
      tile.append('button').attr('type', 'button').attr('class', 'mb-step-remove').attr('aria-label', `Remove step ${i + 1}`).text('×')
        .on('click', () => { steps.splice(i, 1); editIndex = -1; pending = { speed: null, dir: null }; render(); });
      if (i < steps.length - 1) strip.append('span').attr('class', 'mb-sequence-arrow').text('→');
    });
  }
  function renderMetadata() {
    metadata.selectAll('*').remove();
    const meta = metadata.append('div').attr('class', 'mb-meta-row');
    meta.append('label').text('Name:').append('input').attr('type', 'text').attr('maxlength', 80).attr('class', 'mb-name-input')
      .property('value', draft.name).on('input', function () { draft.name = this.value; });
    meta.append('label').text('Color:').append('input').attr('type', 'color').attr('class', 'mb-color-input')
      .property('value', draft.color).on('input', function () { draft.color = this.value; });
  }
  function renderCommit() {
    commit.selectAll('*').remove();
    heading(commit, 4, 'Confirm motif');
    commit.append('p').attr('class', 'mb-hint').text('Color = speed · Triangle = specified direction · Square = no direction · Motif color = pattern ID');
    commit.append('button').attr('type', 'button').attr('class', 'mb-btn mb-btn--primary mb-full')
      .property('disabled', !steps.length && !hasData(pending)).text('+ Add Motif')
      .on('click', () => {
        const pattern = steps.map(p => ({ ...p }));
        if (editIndex >= 0) { if (hasData(pending)) pattern[editIndex] = { ...pending }; }
        else if (hasData(pending)) pattern.push({ ...pending });
        if (!pattern.length) return;
        motifs.push({ id: `motif-${Date.now()}-${++uniqueId}`, name: draft.name.trim() || `Motif ${motifs.length + 1}`, color: draft.color, pattern });
        dirty = true; reset(); render();
      });
  }
  function renderList() {
    list.selectAll('*').remove(); heading(list, 5, 'Motifs to search');
    list.append('span').attr('class', 'mb-counter').text(`${motifs.length} motif${motifs.length === 1 ? '' : 's'}`);
    if (!motifs.length) list.append('p').attr('class', 'mb-empty').text('No motifs added yet.');
    motifs.forEach((m, index) => {
      const row = list.append('div').attr('class', 'mb-active-row');
      row.append('span').attr('class', 'mb-color-swatch').style('background', m.color);
      const info = row.append('div').attr('class', 'mb-active-info');
      info.append('strong').text(m.name);
      const icons = info.append('div').attr('class', 'mb-mini-pattern');
      (m.pattern || []).forEach(p =>
        glyph(icons.append('span'), p, true, true)
      );
      row.append('button').attr('type', 'button').attr('class', 'mb-remove-motif')
        .attr('aria-label', `Remove motif ${m.name}`).attr('title', 'Remove motif').text('×')
        .on('click', () => { motifs.splice(index, 1); dirty = true; render(); });
    });
    if (dirty) list.append('p').attr('class', 'mb-pending-status').text('Changes not applied. Click Search to update the rug.');
    const actions = list.append('div').attr('class', 'mb-actions-row');
    actions.append('button').attr('type', 'button').attr('class', 'mb-btn mb-btn--search')
      .property('disabled', !motifs.length && !dirty).text('Search Motifs')
      .on('click', () => { emit(); close(); });
    actions.append('button').attr('type', 'button').attr('class', 'mb-btn mb-btn--quiet').text('Clear all')
      .property('disabled', !motifs.length && !steps.length && !hasData(pending))
      .on('click', () => { motifs = []; dirty = true; reset(); emit(); });
  }
  render();
  return {
    getActiveMotifs: () => copy(motifs),
    setActiveMotifs(next) { motifs = copy(next); dirty = false; reset(); render(); },
    destroy() { d3.select(window).on(`click${ns}`, null).on(`keydown${ns}`, null); root.remove(); floating.destroy(); }
  };
}
