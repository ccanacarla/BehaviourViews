import { getCurrentDataset } from './pipeline/dataRegistry.js';
import { proximityRows, symbolsRows, contextTables } from './pipeline/context.js';
import { searchTemporal } from './pipeline/temporal.js';
/**
 * contextPanel.js
 * Painel flutuante de consulta contextual para o BehaviourRug.
 *
 * Integra-se ao sistema existente via eventManager, publicando
 * 'CONTEXT_FILTER_CHANGED' com a lista de trajectory_ids que
 * satisfazem a consulta. O main.js escuta esse evento e aplica
 * o filtro como qualquer outro.
 *
 * Não modifica nenhum módulo existente.
 */

import { eventManager } from './events.js';
import { initNLQuery } from './nlQuery.js';

// ─────────────────────────────────────────────────────────────────────────
//  Collision Segments Overlay
//  Calcula os segmentos de colisão em JS a partir de:
//    outputs/proximity.csv        — frames de colisão (sperm × debris/pinhead)
//    outputs/context_symbols.csv  — timestamps decimados (k=10) por trajetória
//  Não requer pré-processamento Python nem ficheiro JSON extra.
//  Não toca no behaviourrug.js — opera puramente via DOM/D3 externo.
// ─────────────────────────────────────────────────────────────────────────

let _collisionSegs = null;   // { tid: { debris: Set, pinhead: Set } }
let _overlayActive = false;

// bisect_right equivalente em JS
function bisectRight(arr, val) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid] <= val) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

async function loadCollisionSegs() {
    // Tentar de novo se estiver vazio (pode ter falhado antes por arquivo não disponível)
    if (_collisionSegs !== null && Object.keys(_collisionSegs).length > 0) return;

    console.log('[CollisionOverlay] Carregando proximity.csv e context_symbols.csv...');
    try {
        const [proxRows, symRows] = await Promise.all([
            getCurrentDataset() ? Promise.resolve(proximityRows()) : d3.csv('outputs/proximity.csv'),
            getCurrentDataset() ? Promise.resolve(symbolsRows()) : d3.csv('outputs/context_symbols.csv'),
        ]);

        console.log(`[CollisionOverlay] proximity.csv: ${proxRows.length} linhas`);
        console.log(`[CollisionOverlay] context_symbols.csv: ${symRows.length} linhas`);

        if (proxRows.length === 0) {
            console.warn('[CollisionOverlay] proximity.csv está vazio ou não encontrado.');
            console.warn('[CollisionOverlay] Copie proximity.csv para visualization/outputs/proximity.csv');
            _collisionSegs = null;   // null permite retry
            return;
        }

        // 1. Timestamps decimados por trajetória
        const tidToTs = new Map();
        for (const row of symRows) {
            const tid = row.trajectory_id;
            const ts  = +row.timestamp;
            if (!tidToTs.has(tid)) tidToTs.set(tid, []);
            tidToTs.get(tid).push(ts);
        }
        for (const [, arr] of tidToTs) arr.sort((a, b) => a - b);

        // 2. Calcular segmentos de colisão
        _collisionSegs = {};

        for (const row of proxRows) {
            const tid  = row.trajectory_id_sperm;
            const ts   = +row.timestamp;
            const ftid = +row.ftid_object;

            const tsList = tidToTs.get(tid);
            if (!tsList) {
                // Sem aviso repetido — só no primeiro
                continue;
            }

            const i = Math.max(0, bisectRight(tsList, ts) - 1);

            if (!_collisionSegs[tid]) {
                _collisionSegs[tid] = { debris: new Set(), pinhead: new Set() };
            }
            if (ftid === 1) _collisionSegs[tid].debris.add(i);
            else if (ftid === 2) _collisionSegs[tid].pinhead.add(i);
        }

        const n = Object.keys(_collisionSegs).length;
        const nDebris  = Object.values(_collisionSegs).filter(v => v.debris.size  > 0).length;
        const nPinhead = Object.values(_collisionSegs).filter(v => v.pinhead.size > 0).length;
        console.log(`[CollisionOverlay] ${n} trajetórias com colisões (${nDebris} debris, ${nPinhead} pinhead)`);
        // Mostrar um exemplo
        const ex = Object.entries(_collisionSegs)[0];
        if (ex) console.log(`[CollisionOverlay] Exemplo: ${ex[0]} → debris=[${[...ex[1].debris].slice(0,5)}]`);

    } catch (err) {
        _collisionSegs = null;   // null permite retry na próxima activação
        console.error('[CollisionOverlay] Erro ao carregar:', err.message);
        console.warn('[CollisionOverlay] Certifique-se que proximity.csv está em visualization/outputs/');
    }
}

// Cores das bordas de colisão
const COL_DEBRIS  = '#c0392b';   // vermelho
const COL_PINHEAD = '#8e44ad';   // roxo

/**
 * Aplica bordas coloridas nos segmentos com colisão.
 * Opera sobre o DOM do #rug-panel depois que o BehaviourRug renderizou.
 * Cada .row tem datum D3 com d.id = trajectory_id.
 * Cada .g-cell tem índice i = posição no array de sequências.
 */
function applyCollisionOverlay() {
    if (!_collisionSegs || !_overlayActive) return;

    // Remover marcações anteriores
    d3.select('#rug-panel').selectAll('rect.seg-collision-debris').classed('seg-collision-debris', false);
    d3.select('#rug-panel').selectAll('rect.seg-collision-pinhead').classed('seg-collision-pinhead', false);

    const rows = d3.select('#rug-panel').selectAll('.row');
    const nRows = rows.size();
    console.log(`[CollisionOverlay] applyCollisionOverlay: ${nRows} rows no DOM`);

    // Debug: mostrar o datum do primeiro row e as chaves do _collisionSegs
    const firstRow = rows.nodes()[0];
    if (firstRow) {
        const fd = firstRow.__data__;
        console.log('[CollisionOverlay] Datum do 1º row:', JSON.stringify({
            id: fd?.id, trajectory_id: fd?.trajectory_id, keys: Object.keys(fd || {}).slice(0, 5)
        }));
    }
    const colKeys = Object.keys(_collisionSegs);
    console.log(`[CollisionOverlay] _collisionSegs tem ${colKeys.length} IDs. Ex: ${colKeys[0]}`);

    let nMarked = 0;

    rows.each(function() {
        const datum = this.__data__;
        const tid   = datum?.id ?? datum?.trajectory_id;
        const segs  = tid ? _collisionSegs[tid] : null;
        if (!segs) return;

        const debrisSet  = segs.debris  instanceof Set ? segs.debris  : new Set(segs.debris  || []);
        const pinheadSet = segs.pinhead instanceof Set ? segs.pinhead : new Set(segs.pinhead || []);
        if (debrisSet.size === 0 && pinheadSet.size === 0) return;

        d3.select(this).selectAll('.g-cell').each(function(_, i) {
            const rect = d3.select(this).select('rect');
            if (rect.empty()) return;
            if (debrisSet.has(i)) {
                rect.classed('seg-collision-debris', true);
                nMarked++;
            }
            if (pinheadSet.has(i)) {
                rect.classed('seg-collision-pinhead', true);
                nMarked++;
            }
        });
    });

    console.log(`[CollisionOverlay] ${nMarked} segmentos marcados`);
}


function clearCollisionOverlay() {
    d3.select('#rug-panel').selectAll('rect.seg-collision-debris').classed('seg-collision-debris', false);
    d3.select('#rug-panel').selectAll('rect.seg-collision-pinhead').classed('seg-collision-pinhead', false);
    _overlayActive = false;
}

// Reaplicar overlay sempre que o BehaviourRug re-renderizar
// O rug é redesenhado a cada applyFilters() → escutar mutações no #rug-panel
let _rugObserver = null;

function watchRug() {
    if (_rugObserver) return;
    const rugEl = document.getElementById('rug-panel');
    if (!rugEl) return;
    let _overlayDebounce = null;
    _rugObserver = new MutationObserver(() => {
        if (!_overlayActive) return;
        // Debounce: espera o D3 terminar de renderizar antes de aplicar
        clearTimeout(_overlayDebounce);
        _overlayDebounce = setTimeout(applyCollisionOverlay, 200);
    });
    // Observar apenas filhos directos do #rug-panel (não subtree)
    // para não disparar a cada rect adicionado internamente
    // subtree:true para capturar re-renders internos (sort, filter)
    // O debounce de 200ms garante que o D3 terminou antes de aplicar as classes
    _rugObserver.observe(rugEl, { childList: true, subtree: true });
}

// ── Dados carregados do CSV de contexto ──────────────────────────────────
let contextData = null;   // context_trajectory_summary.csv
let periodsData = null;   // context_interaction_periods.csv
let isLoaded    = false;
let isLoading   = false;
let loadingPromise = null;

// URL do servidor para /api/temporal (preenchida pelo nlQuery ao detectar o proxy)
let _serverBase = window.location.origin;
document.addEventListener('nl-proxy-detected', e => { _serverBase = e.detail.base; });

// ── Estado do painel ─────────────────────────────────────────────────────
let panelVisible = false;
let activeContextIds = null;  // null = sem filtro ativo

// ── Paleta consistente com a interface existente ──────────────────────────
const COLORS = {
    primary:  '#164773',
    debris:   '#c0392b',
    pinhead:  '#8e44ad',
    sperm:    '#1a7a4a',
    bg:       '#ffffff',
    surface:  '#f7f8fa',
    border:   '#dde1e7',
    text:     '#222831',
    muted:    '#6b7280',
    badge:    '#e8edf4',
};

// ─────────────────────────────────────────────────────────────────────────
//  Carregamento dos CSVs de contexto
// ─────────────────────────────────────────────────────────────────────────

async function loadContextData() {
    if (isLoaded) return;
    if (loadingPromise) return loadingPromise;
    isLoading = true;

    loadingPromise = (async () => {
    try {
        if (getCurrentDataset()) {
            const tables = contextTables();
            contextData = tables.summary;
            periodsData = tables.periods;
        } else {
            [contextData, periodsData] = await Promise.all([
                d3.csv('outputs/context_trajectory_summary.csv'),
                d3.csv('outputs/context_interaction_periods.csv'),
            ]);
        }

        // Coerção de tipos numéricos
        contextData.forEach(d => {
            d.n_frames_near_debris   = +d.n_frames_near_debris;
            d.n_frames_near_pinhead  = +d.n_frames_near_pinhead;
            d.n_frames_near_sperm    = +d.n_frames_near_sperm;
            d.n_periods_debris       = +d.n_periods_debris;
            d.n_periods_pinhead      = +d.n_periods_pinhead;
            d.n_periods_sperm        = +d.n_periods_sperm;
            d.max_dur_debris         = +d.max_dur_debris;
            d.max_dur_pinhead        = +d.max_dur_pinhead;
            d.max_dur_sperm          = +d.max_dur_sperm;
            d.shannon_entropy        = +d.shannon_entropy;
            d.behavior_change_near_debris  = d.behavior_change_near_debris  === true || d.behavior_change_near_debris === 'True';
            d.behavior_change_near_pinhead = d.behavior_change_near_pinhead === true || d.behavior_change_near_pinhead === 'True';
            d.behavior_change_near_sperm   = d.behavior_change_near_sperm   === true || d.behavior_change_near_sperm === 'True';
        });
        periodsData.forEach(d => {
            d.duration_frames = +d.duration_frames;
            d.min_dist        = +d.min_dist;
            d.mean_dist       = +d.mean_dist;
            d.period_start    = +d.period_start;
            d.period_end      = +d.period_end;
            d.behavior_change = d.behavior_change === true || d.behavior_change === 'True';
            d.neighbor_ftid   = +d.neighbor_ftid;
        });

        isLoaded = true;
        console.log('[ContextPanel] Dados carregados:', contextData.length, 'trajetórias,',
                    periodsData.length, 'períodos de interação');
    } catch (err) {
        console.warn('[ContextPanel] CSVs de contexto não encontrados:', err.message);
        console.warn('  Execute o notebook 04_01_context_enrichment.ipynb para gerar os arquivos.');
        contextData = null;
        periodsData = null;
    } finally {
        isLoading = false;
        loadingPromise = null;
    }
    })();
    return loadingPromise;
}

// ─────────────────────────────────────────────────────────────────────────
//  Lógica de consulta
// ─────────────────────────────────────────────────────────────────────────

export function runQuery(filters) {
    if (!contextData) return null;

    let results = [...contextData];

    // Combinar restrições de evento NO MESMO PERÍODO.
    // Antes, condições de tempo/símbolo podiam vir de períodos distintos.
    const eventFiltersActive = filters.neighborType !== 'all' ||
        filters.minDuration > 0 || filters.maxDistance !== null || filters.requireBehaviorChange ||
        !!filters.symbolBefore || !!filters.symbolDuring;

    if (eventFiltersActive) {
        const matchingTids = new Set(periodsData.filter(p => {
            if (filters.neighborType !== 'all' && p.neighbor_type !== filters.neighborType) return false;
            if (filters.minDuration > 0 && p.duration_frames < filters.minDuration) return false;
            if (filters.maxDistance !== null && Number(p.min_dist) > filters.maxDistance) return false;
            if (filters.requireBehaviorChange && !p.behavior_change) return false;
            if (filters.symbolBefore && !(p.symbol_before || '').toLowerCase().includes(filters.symbolBefore.toLowerCase())) return false;
            if (filters.symbolDuring && !(p.symbol_during || '').toLowerCase().includes(filters.symbolDuring.toLowerCase())) return false;
            return true;
        }).map(p => p.sperm_tid));
        results = results.filter(d => matchingTids.has(d.sperm_tid));
    }

    // Filtros de cluster simbólico (do result.csv, via fullData no main.js)
    if (filters.clusterFilter !== null && filters.clusterFilter !== undefined) {
        results = results.filter(d => +d.cluster_symbolic === +filters.clusterFilter);
    }

    // Filtros de cluster físico
    if (filters.physClusterFilter !== null && filters.physClusterFilter !== undefined) {
        results = results.filter(d => +d.phys_cluster === +filters.physClusterFilter);
    }

    // Filtros de entropia
    if (filters.minEntropy !== null && filters.minEntropy !== undefined) {
        results = results.filter(d => +d.shannon_entropy >= filters.minEntropy);
    }
    if (filters.maxEntropy !== null && filters.maxEntropy !== undefined) {
        results = results.filter(d => +d.shannon_entropy <= filters.maxEntropy);
    }

    return results;
}

// ─────────────────────────────────────────────────────────────────────────
//  Pré-visualização dos períodos de interação de uma trajetória
// ─────────────────────────────────────────────────────────────────────────

function renderPeriodDetails(tidList, container) {
    container.selectAll('*').remove();

    if (!periodsData || tidList.length === 0) return;

    const relevant = periodsData
        .filter(p => tidList.slice(0, 5).includes(p.sperm_tid))
        .sort((a, b) => b.duration_frames - a.duration_frames)
        .slice(0, 8);

    if (relevant.length === 0) {
        container.append('p')
            .style('font-size', '11px')
            .style('color', COLORS.muted)
            .style('padding', '8px 0')
            .text('Nenhum período de interação encontrado.');
        return;
    }

    const typeColor = { 1: COLORS.debris, 2: COLORS.pinhead, 0: COLORS.sperm };
    const typeLabel = { 1: 'debris', 2: 'pinhead', 0: 'sperm' };

    relevant.forEach(p => {
        const row = container.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '6px')
            .style('padding', '4px 0')
            .style('border-bottom', `1px solid ${COLORS.border}`)
            .style('font-size', '10px');

        // Badge tipo
        row.append('span')
            .style('background', typeColor[p.neighbor_ftid] || COLORS.muted)
            .style('color', '#fff')
            .style('border-radius', '3px')
            .style('padding', '1px 5px')
            .style('font-size', '9px')
            .style('font-weight', '600')
            .style('min-width', '44px')
            .style('text-align', 'center')
            .text(typeLabel[p.neighbor_ftid] || '?');

        // Duração
        row.append('span')
            .style('color', COLORS.muted)
            .style('min-width', '52px')
            .text(`${p.duration_frames}frames`);

        // Mudança de comportamento
        if (p.behavior_change) {
            row.append('span')
                .style('color', '#e67e22')
                .style('font-weight', '600')
                .attr('title', `${p.symbol_before || '?'} → ${p.symbol_during || '?'} → ${p.symbol_after || '?'}`)
                .text('⚡ mudança');
        }

        // Símbolos
        const symText = [p.symbol_before, p.symbol_during, p.symbol_after]
            .filter(Boolean).join(' → ');
        if (symText) {
            row.append('span')
                .style('color', COLORS.text)
                .style('flex', '1')
                .style('overflow', 'hidden')
                .style('text-overflow', 'ellipsis')
                .style('white-space', 'nowrap')
                .attr('title', symText)
                .text(symText);
        }
    });
}

function renderTemporalEvidence(episodes, container) {
    container.selectAll('*').remove();
    if (!episodes || episodes.length === 0) return;
    container.append('div').style('font-weight', '600').style('margin', '8px 0')
        .text('Evidências temporais (frames do vídeo)');
    for (const ep of episodes.slice(0, 15)) {
        const row = container.append('div').style('font-size', '11px')
            .style('padding', '6px 4px').style('border-bottom', `1px solid ${COLORS.border}`);
        row.append('div').style('font-weight', '600')
            .text(`Trajetória ${ep.sperm_tid} · ${ep.neighbor_type} (${ep.neighbor_tid})`);
        row.append('div').text(`Proximidade ${ep.period_start}–${ep.period_end} → ${ep.behavior === 'acceleration' ? 'aceleração' : 'desaceleração'} ${ep.slowdown_frame}${ep.behavior === 'recovery' ? ` → recuperação ${ep.recovery_frame}` : ''}`);
        row.append('div').style('color', COLORS.muted)
            .text(`Base ${ep.baseline_symbol || '?'} → ${ep.slowdown_symbol || '?'} → ${ep.recovery_symbol || '—'}`);
    }
    if (episodes.length > 15) container.append('small').text(`Exibindo 15 de ${episodes.length} episódios retornados.`);
}

// ─────────────────────────────────────────────────────────────────────────
//  Construção do painel
// ─────────────────────────────────────────────────────────────────────────

export function initContextPanel() {
    document.addEventListener('dataset-processed', () => {
        contextData = null; periodsData = null; isLoaded = false;
        loadingPromise = null; _collisionSegs = null;
    });
    // Contexto gerado sob demanda a partir do CSV carregado.
    // loadCollisionSegs só é chamado quando o utilizador activa o toggle
    watchRug();

    // ── Botão flutuante de ativação ──────────────────────────────────────
    const triggerBtn = d3.select('body').append('button')
        .attr('id', 'context-panel-trigger')
        .style('position', 'fixed')
        .style('bottom', '20px')
        .style('right', '20px')
        .style('z-index', '9000')
        .style('background', COLORS.primary)
        .style('color', '#fff')
        .style('border', 'none')
        .style('border-radius', '24px')
        .style('padding', '9px 16px')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('cursor', 'pointer')
        .style('box-shadow', '0 4px 16px rgba(22,71,115,0.35)')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '6px')
        .style('letter-spacing', '0.01em')
        .style('transition', 'box-shadow 0.15s')
        .html('🔍 Context Search');

    // ── Painel flutuante ─────────────────────────────────────────────────
    const panel = d3.select('body').append('div')
        .attr('id', 'context-panel')
        .style('position', 'fixed')
        .style('bottom', '62px')
        .style('right', '20px')
        .style('z-index', '8999')
        .style('width', '340px')
        .style('max-height', '82vh')
        .style('overflow-y', 'auto')
        .style('background', COLORS.bg)
        .style('border', `1px solid ${COLORS.border}`)
        .style('border-radius', '10px')
        .style('box-shadow', '0 8px 32px rgba(0,0,0,0.18)')
        .style('display', 'none')
        .style('flex-direction', 'column');

    // ── Cabeçalho ─────────────────────────────────────────────────────────
    const header = panel.append('div')
        .style('padding', '12px 14px 10px')
        .style('border-bottom', `1px solid ${COLORS.border}`)
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('justify-content', 'space-between')
        .style('position', 'sticky')
        .style('top', '0')
        .style('background', COLORS.bg)
        .style('z-index', '1');

    header.append('div').html(`
        <div style="font-size:13px;font-weight:700;color:${COLORS.text}">Context Search</div>
        <div style="font-size:10px;color:${COLORS.muted};margin-top:2px">
            Filter trajectories by spatial context
        </div>
    `);

    // Botão fechar
    header.append('button')
        .style('background', 'none')
        .style('border', 'none')
        .style('font-size', '16px')
        .style('cursor', 'pointer')
        .style('color', COLORS.muted)
        .style('padding', '2px 4px')
        .style('line-height', '1')
        .text('✕')
        .on('click', () => togglePanel(false));

    // ── Corpo ─────────────────────────────────────────────────────────────
    const body = panel.append('div')
        .style('padding', '12px 14px')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('gap', '12px');

    // ─ Seção 1: Tipo de vizinho ──────────────────────────────────────────
    const secNeighbor = body.append('div');
    secNeighbor.append('div')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('color', COLORS.text)
        .style('margin-bottom', '6px')
        .text('Neighbor type');

    const neighborTypes = [
        { value: 'all',     label: 'Any',     color: COLORS.primary },
        { value: 'debris',  label: 'Debris',  color: COLORS.debris  },
        { value: 'pinhead', label: 'Pinhead', color: COLORS.pinhead },
        { value: 'sperm',   label: 'Sperm',   color: COLORS.sperm   },
    ];

    const neighborGroup = secNeighbor.append('div')
        .style('display', 'flex')
        .style('gap', '5px')
        .style('flex-wrap', 'wrap');

    let selectedNeighborType = 'all';

    neighborTypes.forEach(nt => {
        const btn = neighborGroup.append('button')
            .attr('class', 'ctx-neighbor-btn')
            .attr('data-value', nt.value)
            .style('padding', '4px 10px')
            .style('font-size', '11px')
            .style('border-radius', '14px')
            .style('border', `1.5px solid ${nt.color}`)
            .style('background', nt.value === 'all' ? nt.color : 'transparent')
            .style('color', nt.value === 'all' ? '#fff' : nt.color)
            .style('cursor', 'pointer')
            .style('font-weight', '500')
            .style('transition', 'all 0.12s')
            .text(nt.label)
            .on('click', function() {
                selectedNeighborType = nt.value;
                d3.selectAll('.ctx-neighbor-btn').each(function() {
                    const v = d3.select(this).attr('data-value');
                    const cfg = neighborTypes.find(x => x.value === v);
                    d3.select(this)
                        .style('background', v === selectedNeighborType ? cfg.color : 'transparent')
                        .style('color',      v === selectedNeighborType ? '#fff' : cfg.color);
                });
            });
    });

    // ─ Seção 2: Duração mínima ──────────────────────────────────────────
    const secDur = body.append('div');
    secDur.append('div')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('color', COLORS.text)
        .style('margin-bottom', '6px')
        .text('Min. interaction duration (frames)');

    const durRow = secDur.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');

    const durSlider = durRow.append('input')
        .attr('type', 'range')
        .attr('min', 0)
        .attr('max', 200)
        .attr('step', 5)
        .attr('value', 0)
        .style('flex', '1')
        .style('accent-color', COLORS.primary);

    const durLabel = durRow.append('span')
        .style('font-size', '11px')
        .style('color', COLORS.text)
        .style('min-width', '30px')
        .style('text-align', 'right')
        .text('0');

    durSlider.on('input', function() {
        durLabel.text(this.value);
    });

    // ─ Seção 3: Mudança de comportamento ─────────────────────────────────
    // Distância é medida nas mesmas unidades de x/y dos CSVs.
    const distanceRow = body.append('label').style('display','flex')
        .style('flex-direction','column').style('gap','5px');
    distanceRow.append('span').style('font-size','11px').style('font-weight','600')
        .text('Distância máxima (unidades x/y; vazio = sem limite)');
    const distanceInput = distanceRow.append('input').attr('type','number')
        .attr('min','0').attr('step','any').attr('placeholder','Sem limite')
        .style('padding','6px').style('border',`1px solid ${COLORS.border}`)
        .style('border-radius','5px');

    const sequenceBox = body.append('div').style('display','flex')
        .style('flex-direction','column').style('gap','6px');
    sequenceBox.append('div').style('font-size','11px').style('font-weight','600')
        .text('Condição temporal após a proximidade');
    const behaviorSelect = sequenceBox.append('select').style('padding','6px')
        .style('border',`1px solid ${COLORS.border}`);
    [
        ['any','Qualquer comportamento'],
        ['deceleration','Desaceleração'],
        ['acceleration','Aceleração'],
        ['recovery','Desaceleração seguida de recuperação']
    ].forEach(([v,label]) => behaviorSelect.append('option').attr('value',v).text(label));
    const windowRow = sequenceBox.append('label').style('font-size','11px').text('Janela após contato (frames)');
    const windowInput = windowRow.append('input').attr('type','number')
        .attr('min','1').attr('max','1000').attr('value','20')
        .style('width','72px').style('margin-left','8px');
    const recoverRow = sequenceBox.append('label').style('font-size','11px').text('Janela para recuperação (frames)');
    const recoveryInput = recoverRow.append('input').attr('type','number')
        .attr('min','1').attr('max','2000').attr('value','60')
        .style('width','72px').style('margin-left','8px');
    const updateBehaviorOptions = () => {
        const enabled = behaviorSelect.property('value') !== 'any';
        windowInput.property('disabled',!enabled);
        recoveryInput.property('disabled',behaviorSelect.property('value') !== 'recovery');
    };
    behaviorSelect.on('change',updateBehaviorOptions);
    updateBehaviorOptions();

    const secChange = body.append('div');

    const changeRow = secChange.append('label')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px')
        .style('cursor', 'pointer');

    const changeCheck = changeRow.append('input')
        .attr('type', 'checkbox')
        .style('accent-color', COLORS.primary)
        .style('width', '14px')
        .style('height', '14px');

    changeRow.append('span')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('color', COLORS.text)
        .text('Behavior change during interaction');

    changeRow.append('span')
        .style('font-size', '10px')
        .style('color', '#e67e22')
        .style('margin-left', 'auto')
        .text('⚡');

    // ─ Seção 4: Símbolo ──────────────────────────────────────────────────
    const secSymbol = body.append('div');
    secSymbol.append('div')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('color', COLORS.text)
        .style('margin-bottom', '6px')
        .text('Symbol filter (optional)');

    const symbolRow = secSymbol.append('div')
        .style('display', 'grid')
        .style('grid-template-columns', '1fr 1fr')
        .style('gap', '6px');

    const makeSym = (placeholder) => symbolRow.append('input')
        .attr('type', 'text')
        .attr('placeholder', placeholder)
        .style('padding', '5px 8px')
        .style('font-size', '10px')
        .style('border', `1px solid ${COLORS.border}`)
        .style('border-radius', '5px')
        .style('color', COLORS.text)
        .style('background', COLORS.surface)
        .style('outline', 'none');

    const symBeforeInput = makeSym('Before (e.g. Lento)');
    const symDuringInput = makeSym('During (e.g. Rapido)');

    // Sugestões rápidas de símbolo
    const SYM_SUGGESTIONS = [
        'Muito_Lento','Lento','Medio','Rapido','Muito_Rapido',
        'Leste','Norte','Sul','Oeste'
    ];
    const suggestRow = secSymbol.append('div')
        .style('display', 'flex')
        .style('flex-wrap', 'wrap')
        .style('gap', '3px')
        .style('margin-top', '5px');

    SYM_SUGGESTIONS.forEach(s => {
        suggestRow.append('button')
            .style('font-size', '9px')
            .style('padding', '2px 6px')
            .style('border-radius', '10px')
            .style('border', `1px solid ${COLORS.border}`)
            .style('background', COLORS.surface)
            .style('color', COLORS.muted)
            .style('cursor', 'pointer')
            .text(s)
            .on('click', function() {
                // Alterna entre before e during
                const before = symBeforeInput.node().value;
                if (!before) symBeforeInput.property('value', s);
                else symDuringInput.property('value', s);
            });
    });

    // ─ Botões de ação ────────────────────────────────────────────────────
    const btnRow = body.append('div')
        .style('display', 'grid')
        .style('grid-template-columns', '1fr 1fr')
        .style('gap', '8px')
        .style('padding-top', '4px');

    const clearBtn = btnRow.append('button')
        .style('padding', '7px')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('border-radius', '6px')
        .style('border', `1.5px solid ${COLORS.border}`)
        .style('background', COLORS.surface)
        .style('color', COLORS.muted)
        .style('cursor', 'pointer')
        .text('Clear');

    const applyBtn = btnRow.append('button')
        .style('padding', '7px')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('border-radius', '6px')
        .style('border', 'none')
        .style('background', COLORS.primary)
        .style('color', '#fff')
        .style('cursor', 'pointer')
        .text('Apply filter');

    // ─ Resultados ────────────────────────────────────────────────────────
    const resultSection = body.append('div')
        .style('display', 'none');

    const resultHeader = resultSection.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('justify-content', 'space-between')
        .style('margin-bottom', '8px');

    const resultCount = resultHeader.append('div')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('color', COLORS.text);

    // Badge ativo
    const activeBadge = resultHeader.append('div')
        .style('font-size', '9px')
        .style('background', '#e8f4e8')
        .style('color', '#1a7a4a')
        .style('border-radius', '10px')
        .style('padding', '2px 8px')
        .style('font-weight', '600')
        .text('ACTIVE');

    const periodDetails = resultSection.append('div');

    // ── Acções dos botões ─────────────────────────────────────────────────

    function gatherFilters() {
        return {
            neighborType:          selectedNeighborType,
            maxDistance:           distanceInput.node().value.trim() === '' ? null : +distanceInput.node().value,
            minDuration:           +durSlider.node().value,
            requireBehaviorChange: changeCheck.node().checked,
            symbolBefore:          symBeforeInput.node().value.trim(),
            symbolDuring:          symDuringInput.node().value.trim(),
        };
    }

    applyBtn.on('click', async () => {
        if (!isLoaded) {
            await loadContextData();
            if (!isLoaded) { showStatus('CSVs de contexto não encontrados. Execute o 04_01.'); return; }
        }
        const filters = gatherFilters();
        const mode = behaviorSelect.property('value');
        if (filters.maxDistance !== null && (!Number.isFinite(filters.maxDistance) || filters.maxDistance < 0)) {
            showStatus('Distância máxima inválida.'); return;
        }
        let results = runQuery(filters);
        let episodes = null;
        if (mode !== 'any') {
            const within = Number(windowInput.property('value'));
            const recoveryWithin = Number(recoveryInput.property('value'));
            if (!Number.isInteger(within) || within < 1 || within > 1000 ||
                !Number.isInteger(recoveryWithin) || recoveryWithin < 1 || recoveryWithin > 2000) {
                showStatus('Janelas temporais inválidas.'); return;
            }
            showStatus('Buscando sequência temporal localmente…');
            try {
                const payload = searchTemporal({
                    neighborType: filters.neighborType,
                    minDuration: filters.minDuration,
                    maxDistance: filters.maxDistance,
                    behavior: mode,
                    slowdownWithinFrames: within,
                    recoveryWithinFrames: recoveryWithin,
                    requireRecovery: mode === 'recovery'
                });
                const matching = new Set(payload.trajectory_ids || []);
                results = (results || []).filter(d => matching.has(d.sperm_tid));
                const accepted = new Set(results.map(d=>d.sperm_tid));
                episodes = (payload.episodes || []).filter(ep=>accepted.has(ep.sperm_tid));
            } catch (err) { showStatus(`Falha na busca temporal: ${err.message}`); return; }
        }
        activeContextIds = (results || []).map(d=>d.sperm_tid);
        eventManager.notify('CONTEXT_FILTER_CHANGED', {trajectoryIds:activeContextIds});
        resultSection.style('display','block');
        activeBadge.style('display',activeContextIds.length ? 'inline-block' : 'none');
        resultCount.text(activeContextIds.length
            ? `${activeContextIds.length} trajetórias encontradas`
            : 'Nenhuma trajetória corresponde aos filtros.');
        if (episodes !== null) renderTemporalEvidence(episodes,periodDetails);
        else renderPeriodDetails(activeContextIds.slice(0,5),periodDetails);
    });

    clearBtn.on('click', () => {
        // Resetar controles
        selectedNeighborType = 'all';
        d3.selectAll('.ctx-neighbor-btn').each(function() {
            const v   = d3.select(this).attr('data-value');
            const cfg = neighborTypes.find(x => x.value === v);
            d3.select(this)
                .style('background', v === 'all' ? cfg.color : 'transparent')
                .style('color',      v === 'all' ? '#fff'   : cfg.color);
        });
        durSlider.property('value', 0); durLabel.text('0');
        distanceInput.property('value','');
        behaviorSelect.property('value','any');
        windowInput.property('value',20); recoveryInput.property('value',60);
        updateBehaviorOptions();
        changeCheck.property('checked', false);
        symBeforeInput.property('value', '');
        symDuringInput.property('value', '');

        // Remover filtro
        activeContextIds = null;
        resultSection.style('display', 'none');
        activeBadge.style('display', 'none');

        eventManager.notify('CONTEXT_FILTER_CHANGED', { trajectoryIds: null });
    });

    function showStatus(msg) {
        resultSection.style('display', 'block');
        activeBadge.style('display', 'none');
        resultCount.text(msg);
        periodDetails.selectAll('*').remove();
    }

    // ── Toggle ───────────────────────────────────────────────────────────
    function togglePanel(force) {
        if (getCurrentDataset() && !isLoaded) loadContextData();
        panelVisible = force !== undefined ? force : !panelVisible;
        panel.style('display', panelVisible ? 'flex' : 'none');
        triggerBtn
            .style('background', panelVisible ? '#0f3558' : COLORS.primary)
            .html(panelVisible ? '✕ Close' : '🔍 Context Search');
    }

    triggerBtn.on('click', () => togglePanel());

    // Badge no botão quando filtro está ativo
    eventManager.subscribe('RESET_FILTERS', () => {
        activeContextIds = null;
        resultSection.style('display', 'none');
        activeBadge.style('display', 'none');
        triggerBtn.html('🔍 Context Search');
    });


    // ── Collision Overlay toggle ──────────────────────────────────────────
    const overlaySection = body.append('div')
        .style('border-top', `1px solid ${COLORS.border}`)
        .style('padding-top', '10px');

    const overlayRow = overlaySection.append('label')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px')
        .style('cursor', 'pointer');

    const overlayCheck = overlayRow.append('input')
        .attr('type', 'checkbox')
        .style('accent-color', COLORS.primary)
        .style('width', '14px')
        .style('height', '14px');

    overlayRow.append('span')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('color', COLORS.text)
        .text('Show collision segments in BehaviourRug');

    // Legenda inline
    const legRow = overlaySection.append('div')
        .style('display', 'flex')
        .style('gap', '10px')
        .style('margin-top', '5px')
        .style('font-size', '10px')
        .style('color', COLORS.muted);

    [['#c0392b', 'Debris'], ['#8e44ad', 'Pinhead']].forEach(([color, label]) => {
        const item = legRow.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '4px');
        item.append('svg')
            .attr('width', 18).attr('height', 10)
            .append('rect')
                .attr('width', 18).attr('height', 10)
                .attr('rx', 2)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', color === '#c0392b' ? '3,2' : '2,2');
        item.append('span').text(label);
    });

    overlayCheck.on('change', async function() {
        _overlayActive = this.checked;
        if (_overlayActive) {
            await loadCollisionSegs();
            applyCollisionOverlay();
        } else {
            clearCollisionOverlay();
        }
    });

    // ── Natural Language Query (LLM) ─────────────────────────────────────
    initNLQuery({
        runQuery,
        panelBody: body,
        colors: COLORS,
        onResults: (results, parsed, episodes) => {
            if (!results || results.length === 0) {
                showStatus('Nenhuma trajetória encontrada para esta consulta.');
                return;
            }
            activeContextIds = results.map(d => d.sperm_tid);
            eventManager.notify('CONTEXT_FILTER_CHANGED', { trajectoryIds: activeContextIds });
            resultSection.style('display', 'block');
            activeBadge.style('display', 'inline-block');
            resultCount.text(`${activeContextIds.length} trajetória${activeContextIds.length !== 1 ? 's' : ''} encontrada${activeContextIds.length !== 1 ? 's' : ''}`);
            if (episodes?.length) renderTemporalEvidence(episodes, periodDetails);
            else renderPeriodDetails(activeContextIds.slice(0, 5), periodDetails);
        }
    });

    console.log('[ContextPanel] Inicializado.');
}
