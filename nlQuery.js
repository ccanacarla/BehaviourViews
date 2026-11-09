import { parseNaturalQuery } from './pipeline/queryParser.js';
import { searchTemporal } from './pipeline/temporal.js';
/**
 * nlQuery.js
 * Módulo de consulta em linguagem natural para o BehaviourRug.
 *
 * Envia o texto do usuário para a API da OpenAI e recebe um JSON
 * com os parâmetros de filtro, que são passados para o runQuery()
 * existente no contextPanel.js via callback.
 *
 * Uso:
 *   import { initNLQuery } from './nlQuery.js';
 *   initNLQuery(runQuery, applyResults);
 *   // runQuery  → a função já existente no contextPanel.js
 *   // applyResults → callback que recebe os trajectory_ids filtrados
 */

// ─────────────────────────────────────────────────────────────────────────
//  System prompt — descreve o schema para o LLM
// ─────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a data filter assistant for BehaviourRug, a visual analytics system
for sperm trajectory analysis.

Your only task: translate a natural language query into a JSON filter object.
Return ONLY the JSON object, no explanation, no markdown, no extra text.

## Context

The dataset contains 807 sperm trajectories from 20 individuals.
Each trajectory has been spatially normalised (translated + PCA-rotated)
and discretised into symbolic movement states combining speed and direction.

### Object types in the video (ftid field)
- 0 = sperm (spermatozoa)
- 1 = debris / cluster
- 2 = pinhead (small-head spermatozoon)

### Symbolic speed labels (slowest → fastest)
Muito_Lento, Lento, Medio, Rapido, Muito_Rapido

### Symbolic direction labels
Leste (East), Norte (North), Sul (South), Oeste (West)

### Combined symbol examples
"Muito_Rapido_Leste", "Lento_Norte", "Medio_Sul"

### Trajectory-level fields (context_trajectory_summary.csv)
- shannon_entropy       : movement complexity (0 = monotone, higher = varied)
- n_frames_near_debris  : total frames the sperm was close to debris
- n_frames_near_pinhead : total frames the sperm was close to a pinhead
- n_frames_near_sperm   : total frames the sperm was close to another sperm
- n_periods_debris      : number of distinct debris interaction periods
- n_periods_pinhead     : number of distinct pinhead interaction periods
- n_periods_sperm       : number of distinct sperm-sperm interaction periods
- max_dur_debris        : longest single debris interaction (frames)
- max_dur_pinhead       : longest single pinhead interaction (frames)
- max_dur_sperm         : longest single sperm-sperm interaction (frames)
- behavior_change_near_debris  : true if symbolic state changed during debris interaction
- behavior_change_near_pinhead : true if symbolic state changed during pinhead interaction
- behavior_change_near_sperm   : true if symbolic state changed during sperm-sperm interaction

### Symbolic clusters (cluster 0-4)
Cluster numbers are dataset-specific, not semantic labels. Do not infer slow, fast, immotile, circular, or progressive from numeric cluster IDs.

### Physical cluster meanings (phys_cluster field, from entropy+dwell+path_length k=5)
Groups by movement metrics rather than transition patterns.

## Ordered temporal sequence (IMPORTANT)
If the query specifies proximity/contact followed by slowing down, and optionally
speed recovery, DO NOT reduce it to requireBehaviorChange. Return queryMode =
"temporal_sequence" and fill temporal from this schema:
{"neighborType":"debris|pinhead|sperm|all","slowdownWithinFrames":20,
"recoveryWithinFrames":60,"baselineLookbackFrames":30,"minSpeedDrop":1,
"minDuration":1,"requireRecovery":true}
The slowdown must happen AFTER the contact episode ends; recovery happens AFTER
slowdown. Time windows are counts of original video frames. Never claim causal effects.
For any non-sequential query return queryMode = "filters" and temporal = null.

## Output JSON schema

Return exactly this structure (all fields required):

{
  "queryMode": "filters" | "temporal_sequence",
  "temporal": <object described above | null>,
  "neighborType": "all" | "debris" | "pinhead" | "sperm",
  "minDuration": <integer, frames, 0 = no minimum>,
  "requireBehaviorChange": <boolean>,
  "symbolBefore": "<speed or direction keyword, empty string = no filter>",
  "symbolDuring": "<speed or direction keyword, empty string = no filter>",
  "clusterFilter": <integer 0-4 | null>,
  "physClusterFilter": <integer 0-4 | null>,
  "minEntropy": <number | null>,
  "maxEntropy": <number | null>,
  "explanation": "<one sentence in the user's language explaining what was filtered>"
}

## Rules
- If the query mentions debris, set neighborType = "debris"
- If the query mentions pinhead, set neighborType = "pinhead"
- If the query mentions collision, contact, interaction with another sperm,
  set neighborType = "sperm"
- "changed behavior", "altered movement", "affected" → requireBehaviorChange = true
- Duration hints: "brief" < 20 frames, "prolonged"/"sustained" > 50, "long" > 100
- Speed context: "fast" → symbolDuring = "Rapido", "very fast" → "Muito_Rapido",
  "slow" → "Lento", "very slow" → "Muito_Lento", "stopped" → "Muito_Lento"
- "monotone", "repetitive", "low complexity" → maxEntropy = 1.5
- "varied", "complex", "high entropy" → minEntropy = 2.0
- Do not assign clusterFilter from semantic descriptions unless the user explicitly names a cluster number.
- If uncertain about a field, use its default (0, null, false, or "all")
- Never invent fields outside the schema
`.trim();

// ─────────────────────────────────────────────────────────────────────────
//  Chamada à API
// ─────────────────────────────────────────────────────────────────────────

// URL do proxy — ajuste se o server.py rodar em outra porta
// O código tenta '/api/openai' primeiro (mesma origem) e faz fallback para porta 8000
const PROXY_URLS = [
    '/api/openai',
    'http://localhost:8000/api/openai',
    'http://127.0.0.1:8000/api/openai',
];

let _workingProxyUrl = null;

async function findWorkingProxy() {
    if (_workingProxyUrl) return _workingProxyUrl;

    for (const url of PROXY_URLS) {
        try {
            const r = await fetch(url.replace('/api/openai', '/api/status'), { method: 'GET' });
            if (r.ok) {
                _workingProxyUrl = url;
                console.log('[NLQuery] Proxy encontrado:', url);
                return url;
            }
        } catch { /* próximo */ }
    }
    return null;
}

async function translateQuery(userText) {
    return parseNaturalQuery(userText);
}

export function initNLQuery({ runQuery, onResults, panelBody, colors }) {

    const COLORS = colors || {
        primary: '#164773', border: '#dde1e7', surface: '#f7f8fa',
        text: '#222831', muted: '#6b7280',
    };

    // ── Separador ─────────────────────────────────────────────────────────
    panelBody.append('div')
        .style('border-top', `1px solid ${COLORS.border}`)
        .style('margin', '4px 0 2px');

    // ── Cabeçalho da seção ────────────────────────────────────────────────
    const nlHeader = panelBody.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('justify-content', 'space-between')
        .style('margin-bottom', '6px');

    nlHeader.append('div').html(`
        <span style="font-size:11px;font-weight:700;color:${COLORS.text}">
            Natural language
        </span>
        <span style="font-size:10px;color:${COLORS.muted};margin-left:6px">
            consulta local
        </span>
    `);

    // Indicador de status
    const statusDot = nlHeader.append('span')
        .style('width', '7px')
        .style('height', '7px')
        .style('border-radius', '50%')
        .style('background', '#9ca3af')
        .style('display', 'inline-block')
        .attr('title', 'Status');

    // ── Textarea ──────────────────────────────────────────────────────────
    const textarea = panelBody.append('textarea')
        .attr('placeholder',
            'e.g. "trajectories that slowed down after contact with debris"\n' +
            'or "fast sperm that changed behavior near a pinhead"')
        .style('width', '100%')
        .style('min-height', '68px')
        .style('padding', '7px 9px')
        .style('font-size', '11px')
        .style('font-family', 'inherit')
        .style('border', `1px solid ${COLORS.border}`)
        .style('border-radius', '6px')
        .style('background', COLORS.surface)
        .style('color', COLORS.text)
        .style('resize', 'vertical')
        .style('line-height', '1.4')
        .style('outline', 'none')
        .style('box-sizing', 'border-box');

    // Exemplos clicáveis
    const examples = [
        'near debris, slowed down within 20 frames, then recovered',
        'changed behavior near pinhead',
        'long interaction with debris',
        'fast sperm near another sperm',
        'monotone trajectories near debris',
    ];

    const exRow = panelBody.append('div')
        .style('display', 'flex')
        .style('flex-wrap', 'wrap')
        .style('gap', '3px')
        .style('margin-bottom', '6px');

    examples.forEach(ex => {
        exRow.append('button')
            .style('font-size', '9px')
            .style('padding', '2px 7px')
            .style('border-radius', '10px')
            .style('border', `1px solid ${COLORS.border}`)
            .style('background', COLORS.surface)
            .style('color', COLORS.muted)
            .style('cursor', 'pointer')
            .style('white-space', 'nowrap')
            .text(ex)
            .on('click', function() {
                textarea.property('value', ex);
                textarea.node().focus();
            });
    });

    // ── Botão de envio ────────────────────────────────────────────────────
    const askBtn = panelBody.append('button')
        .style('width', '100%')
        .style('padding', '8px')
        .style('font-size', '11px')
        .style('font-weight', '700')
        .style('border-radius', '6px')
        .style('border', 'none')
        .style('background', COLORS.primary)
        .style('color', '#fff')
        .style('cursor', 'pointer')
        .style('letter-spacing', '0.01em')
        .text('Filter →');

    // ── Explicação do resultado ───────────────────────────────────────────
    const explanationBox = panelBody.append('div')
        .style('display', 'none')
        .style('background', '#eef4fb')
        .style('border', `1px solid #c3d9ef`)
        .style('border-radius', '6px')
        .style('padding', '8px 10px')
        .style('font-size', '10px')
        .style('color', '#1e3a5f')
        .style('line-height', '1.5');

    // ── Lógica do botão ───────────────────────────────────────────────────
    askBtn.on('click', async function() {
        const text = textarea.node().value.trim();
        if (!text) return;

        // Estado loading
        askBtn.text('Filtrando…').attr('disabled', true).style('opacity', '0.7');
        statusDot.style('background', '#f59e0b');
        explanationBox.style('display', 'none');

        try {
            const parsed = await translateQuery(text);

            statusDot.style('background', '#22c55e');

            // Mostrar explicação
            explanationBox
                .style('display', 'block')
                .text(parsed.explanation || 'Filter applied.');

            if (parsed.queryMode === 'temporal_sequence') {
                const plan = parsed.temporal;
                if (!plan || typeof plan !== 'object') throw new Error('LLM não retornou plano temporal válido');
                const result = searchTemporal(plan);
                const ids = new Set(result.trajectory_ids);
                const all = runQuery({neighborType:'all', minDuration:0, requireBehaviorChange:false,
                    symbolBefore:'',symbolDuring:'',clusterFilter:null,physClusterFilter:null,
                    minEntropy:null,maxEntropy:null}) || [];
                explanationBox.text(`${parsed.explanation || 'Sequência temporal'} — ${result.n_episodes} episódios, ${result.n_trajectories} trajetórias. Evidências no console.`);
                console.table(result.episodes);
                onResults(all.filter(row => ids.has(row.sperm_tid)), parsed, result.episodes);
                return;
            }

            // Sincronizar controles do painel (os filtros manuais refletem a NL)
            syncPanelControls(parsed);

            // Executar a consulta
            const results = runQuery({
                neighborType:          parsed.neighborType          || 'all',
                minDuration:           parsed.minDuration           || 0,
                requireBehaviorChange: parsed.requireBehaviorChange || false,
                symbolBefore:          parsed.symbolBefore          || '',
                symbolDuring:          parsed.symbolDuring          || '',
                clusterFilter:         parsed.clusterFilter         ?? null,
                physClusterFilter:     parsed.physClusterFilter      ?? null,
                minEntropy:            parsed.minEntropy            ?? null,
                maxEntropy:            parsed.maxEntropy            ?? null,
            });

            onResults(results, parsed);

        } catch (err) {
            statusDot.style('background', '#ef4444');
            explanationBox
                .style('display', 'block')
                .style('background', '#fef2f2')
                .style('border-color', '#fca5a5')
                .style('color', '#991b1b')
                .text(`Error: ${err.message}`);
            console.error('[NLQuery]', err);
        } finally {
            askBtn.text('Filter →').attr('disabled', null).style('opacity', '1');
        }
    });

    // Enter = submit (Shift+Enter = nova linha)
    textarea.on('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            askBtn.node().click();
        }
    });

    // Função para sincronizar os controles manuais do painel com o resultado NL
    function syncPanelControls(parsed) {
        // Disparar evento customizado para o contextPanel.js sincronizar seus controles
        document.dispatchEvent(new CustomEvent('nl-filter-parsed', { detail: parsed }));
    }
}
