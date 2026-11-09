/** Gerenciamento da geometria da interface; não executa nem altera o pipeline. */
const PANELS = [
  ['tsne-panel', 't-SNE'],
  ['confusion-matrix-panel', 'Cluster-comparison Matrix'],
  ['trajectory-all-panel', 'Trajectories'],
  ['cluster-panel', 'Clusters'],
  ['rug-panel', 'BehaviourRug'],
  ['video-panel', 'Video'],
  ['trajectory-panel', 'Selected trajectory'],
  ['frequency-panel', 'Frequency']
];

export function initPanelLayout(onGeometryChanged = () => { }) {
  const root = document.querySelector('.main-grid');
  const slots = new Map();
  const panelActions = new Map();
  const weights = { 'cluster-panel': .8, 'rug-panel': 2.2 };
  const colWeights = { left: 1, right: 1 };
  let timer;
  const observers = [];

  // Cabeçalho permanente: botões nunca ficam dentro de elementos recriados pelo D3.
  // Apenas a faixa de controles nativos é transferida para o cabeçalho estável.
  function syncNativeHeader(slot, panel) {
    const toolbar = slot.querySelector(':scope > .panel-slot-toolbar');
    const actions = panelActions.get(slot);
    const title = toolbar.querySelector('.panel-slot-title');
    const nativeHeader = panel.querySelector(
      '.tsne-controls, .rug-controls, .trajectory-controls'
    );
    const mounted = toolbar.querySelector(':scope > .panel-integrated-controls');
    if (nativeHeader && nativeHeader !== mounted) {
      if (mounted) mounted.remove();
      nativeHeader.classList.add('panel-integrated-controls');
      toolbar.insertBefore(nativeHeader, actions);
    }
    const hasNative = Boolean(toolbar.querySelector(':scope > .panel-integrated-controls'));
    slot.classList.toggle('has-native-header', hasNative);
    title.hidden = hasNative && !slot.classList.contains('is-collapsed');
    // Ações permanecem SEMPRE na barra estrutural, inclusive após redesenhos.
    if (actions.parentElement !== toolbar) toolbar.append(actions);
  }

  const emitResize = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      onGeometryChanged();
      window.dispatchEvent(new Event('behaviourrug:layout-resized'));
    }, 180);
  };

  function updateColumns() {
    const left = root.querySelector('.left-column');
    const right = root.querySelector('.right-column');
    const cluster = slots.get('cluster-panel');
    const rug = slots.get('rug-panel');
    const tracks = [
      left?.classList.contains('column-hidden') ? '36px' : `minmax(0, ${colWeights.left}fr)`,
      cluster.classList.contains('is-collapsed') ? '36px' : `minmax(0, ${weights['cluster-panel']}fr)`,
      rug.classList.contains('is-collapsed') ? '36px' : `minmax(0, ${weights['rug-panel']}fr)`,
      right?.classList.contains('column-hidden') ? '36px' : `minmax(0, ${colWeights.right}fr)`
    ];
    root.style.gridTemplateColumns = tracks.join(' ');
    emitResize();
  }

  function updateSingleColumn(id, action) {
    const slot = slots.get(id);
    if (!slot) return;
    const isCollapsed = slot.classList.contains('is-collapsed');
    if (action === 'collapse') {
      slot.classList.toggle('is-collapsed');
      if (!isCollapsed) slot.classList.remove('is-expanded');
    } else if (action === 'expand') {
      slot.classList.remove('is-collapsed');
      slot.classList.toggle('is-expanded');
    }
    if (id === 'cluster-panel' || id === 'rug-panel') {
      weights[id] = slot.classList.contains('is-expanded') ?
        (id === 'rug-panel' ? 3.2 : 1.45) : (id === 'rug-panel' ? 2.2 : .8);
      updateColumns();
    } else {
      // A matriz é compacta SOMENTE no estado normal. Ao expandir,
      // abandona sua base fixa e volta a disputar altura com os irmãos.
      // Definir o shorthand completo evita herdar flex-basis do CSS.
      const group = slot.parentElement;
      const siblings = [...group.children].filter(el => el.classList.contains('panel-slot'));
      const matrixId = 'confusion-matrix-panel';
      for (const sibling of siblings) {
        if (sibling.classList.contains('is-collapsed')) {
          sibling.style.removeProperty('flex'); // usa o estado recolhido do CSS
        } else if (sibling.classList.contains('is-expanded')) {
          sibling.style.flex = '2.8 1 0px';
        } else if (sibling.dataset.panel === matrixId) {
          sibling.style.flex = '0 1 218px';
        } else {
          const panelWeights = {
            'video-panel': 1.2,
            'trajectory-panel': 1.2,
            'frequency-panel': 0.8
          };

          const weight = panelWeights[sibling.dataset.panel] ?? 1;
          sibling.style.flex = `${weight} 1 0px`;
        }
      }
      const allClosed = siblings.every(sibling => sibling.classList.contains('is-collapsed'));
      group.classList.toggle('column-hidden', allClosed);
      updateColumns();
    }
    updateButtons(slot);
    syncNativeHeader(slot, slot.querySelector('.panel'));
  }

  function updateButtons(slot) {
    const collapsed = slot.classList.contains('is-collapsed');
    const toggle = panelActions.get(slot).querySelector('.panel-toggle');
    toggle.textContent = collapsed ? '+' : '−';
    toggle.title = collapsed ? 'Reopen panel' : 'Collapse panel';
    toggle.setAttribute('aria-label', `${toggle.title}: ${slot.getAttribute('aria-label')}`);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const toolbar = slot.querySelector(':scope > .panel-slot-toolbar');
    toolbar.title = 'Double-click header to expand or restore';
  }

  for (const [id, title] of PANELS) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    const slot = document.createElement('section');
    slot.className = 'panel-slot';
    slot.dataset.panel = id;
    slot.setAttribute('aria-label', title);
    const toolbar = document.createElement('div');
    toolbar.className = 'panel-slot-toolbar';
    const titleElement = document.createElement('span');
    titleElement.className = 'panel-slot-title';
    titleElement.textContent = title;
    const actions = document.createElement('div');
    actions.className = 'panel-slot-actions';
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'panel-toggle';
    collapse.setAttribute('aria-controls', id);
    collapse.setAttribute('aria-label', `Collapse ${title}`);
    collapse.addEventListener('click', () => updateSingleColumn(id, 'collapse'));
    actions.append(collapse);
    toolbar.addEventListener('dblclick', event => {
      if (event.target.closest('button, input, select, label, a')) return;
      updateSingleColumn(id, 'expand');
    });
    toolbar.append(titleElement, actions);
    panel.parentNode.insertBefore(slot, panel);
    slot.append(toolbar, panel);
    slots.set(id, slot);
    panelActions.set(slot, actions);
    syncNativeHeader(slot, panel);
    const observer = new MutationObserver(() => syncNativeHeader(slot, panel));
    observer.observe(panel, { childList: true, subtree: true });
    observers.push(observer);
    updateButtons(slot);
  }

  // Aplica a altura compacta desde a primeira renderização, sem neutralizar
  // expansão/recolhimento. A altura inclui o cabeçalho de 32 px.
  const matrixSlot = slots.get('confusion-matrix-panel');
  if (matrixSlot) matrixSlot.style.flex = '0 1 218px';
  const rightPanelWeights = {
    'video-panel': 1.2,
    'trajectory-panel': 1.2,
    'frequency-panel': 0.8
  };

  for (const [id, weight] of Object.entries(rightPanelWeights)) {
    const slot = slots.get(id);
    if (slot) {
      slot.style.flex = `${weight} 1 0px`;
    }
  }

  // O grid mantém exatamente quatro colunas inclusive com painéis recolhidos.
  window.addEventListener('resize', emitResize, { passive: true });
  updateColumns();
  return {
    refresh: emitResize, slots, destroy() {
      for (const observer of observers) observer.disconnect();
      window.removeEventListener('resize', emitResize);
      clearTimeout(timer);
    }
  };
}
