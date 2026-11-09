import { VISUALIZATION_CONFIG, CLUSTER_COLORS } from './config.js';
import { eventManager } from './events.js';
import { parseTrajectoryData, calculateStraightLineDistance } from './dataUtils.js';

/**
 * Draws the cluster summaries including state-frequency glyphs and summary statistics.
 * @param {Array} data - The dataset to visualize (filtered or full).
 * @param {String} containerSelector - The DOM selector for the container.
 * @param {Array} [activeClusterIds=null] - List of currently selected cluster IDs.
 * @param {Array} [fullData=null] - The full dataset for percentage calculation.
 */
export function drawclusterMatrices(data, containerSelector, activeClusterIds = null, fullData = null) {
    const container = d3.select(containerSelector);

    container.selectAll("*").remove();

    const wrapper = container.append("div")
        .attr("class", "cluster-grid-wrapper")
        .style("display", "flex")
        .style("flex-wrap", "wrap")
        .style("gap", "9px")
        .style("justify-content", "center")
        .style("padding", "9px");
    // ==================================================
    // 1. Helpers for Frequency Glyph
    // ==================================================
    const size = 64; // Compact only the cluster summary glyph; other views retain their original size.
    const half = size / 2;
    const step = half / (VISUALIZATION_CONFIG.frenquencyGlyph.glyphLevels || 5);
    const baseColorGlyph = "#050505ff";

    function getRegionPath(direction, level) {
        const innerR = level * step;
        const outerR = (level + 1) * step;

        if (direction === 0) return `M${-innerR},${-innerR} L${innerR},${-innerR} L${outerR},${-outerR} L${-outerR},${-outerR} Z`; // N
        if (direction === 1) return `M${innerR},${-innerR} L${innerR},${innerR} L${outerR},${outerR} L${outerR},${-outerR} Z`; // E
        if (direction === 2) return `M${innerR},${innerR} L${-innerR},${innerR} L${-outerR},${outerR} L${outerR},${outerR} Z`; // S
        if (direction === 3) return `M${-innerR},${innerR} L${-innerR},${-innerR} L${-outerR},${-outerR} L${-outerR},${outerR} Z`; // W
        return "";
    }

    function normalizeTokenForFreq(token) {
        if (!token) return null;
        const t = token.normalize("NFD").replace(/[̀-ͯ]/g, "");

        let spVal = -1;
        if (t.includes("Muito_Lento")) spVal = 0;
        else if (t.includes("Muito_Rapido")) spVal = 4;
        else if (t.includes("Lento")) spVal = 1;
        else if (t.includes("Medio")) spVal = 2;
        else if (t.includes("Rapido")) spVal = 3;

        let dirVal = -1;
        if (t.includes("Norte") || t.includes("_N")) dirVal = 0;
        else if (t.includes("Leste") || t.includes("East") || t.includes("_E") || t.includes("_L")) dirVal = 1;
        else if (t.includes("Sul") || t.includes("_S")) dirVal = 2;
        else if (t.includes("Oeste") || t.includes("West") || t.includes("_W") || t.includes("_O")) dirVal = 3;

        if (spVal > -1 && dirVal > -1) return `${spVal}_${dirVal}`;
        return null;
    }

    // ==================================================
    // 3. Processamento dos Dados
    // ==================================================

    // Global Analysis for Metric Reference (Quintiles)
    const sourceData = fullData || data;
    const globalMetrics = {
        speed: [],
        distance: [],
        entropy: [],
        dwell: []
    };

    sourceData.forEach(d => {
        const s = parseFloat(d.high_speed_ratio || 0);
        const e = parseFloat(d.shannon_entropy || 0);
        const dw = parseFloat(d.avg_dwell_time || 0);

        if (!isNaN(s)) globalMetrics.speed.push(s);
        if (!isNaN(e)) globalMetrics.entropy.push(e);
        if (!isNaN(dw)) globalMetrics.dwell.push(dw);

        // Distance needs parsing
        const pts = parseTrajectoryData(d.trajectory_xy);
        const dist = calculateStraightLineDistance(pts);
        if (!isNaN(dist)) globalMetrics.distance.push(dist);
    });

    // Helper to get quintile thresholds
    const getThresholds = (arr) => {
        arr.sort((a, b) => a - b);
        if (arr.length === 0) return [0, 0, 0, 0];
        return [
            d3.quantile(arr, 0.2),
            d3.quantile(arr, 0.4),
            d3.quantile(arr, 0.6),
            d3.quantile(arr, 0.8)
        ];
    };

    const metricThresholds = {
        speed: getThresholds(globalMetrics.speed),
        distance: getThresholds(globalMetrics.distance),
        entropy: getThresholds(globalMetrics.entropy),
        dwell: getThresholds(globalMetrics.dwell)
    };

    // Helper to safely get cluster ID
    const getCId = (d) => d.cluster_markov ?? d.clusterIds ?? d.cluster;

    // Total counts for global percentage
    const totalCounts = {};
    let globalTotal = 0;
    if (fullData) {
        const fullMap = d3.group(fullData, getCId);
        for (const [cid, rows] of fullMap) {
            let valid = 0;
            rows.forEach(r => {
                try {
                    const rawStr = r.movement_list || r.simbolic_movement || "[]";
                    const jsonStr = rawStr.replace(/'/g, '"');
                    const raw = JSON.parse(jsonStr);
                    if (Array.isArray(raw) && raw.length >= 2) valid++;
                } catch (e) { }
            });
            totalCounts[cid] = valid;
            globalTotal += valid;
        }
    } else {
        globalTotal = data.length;
    }

    const clustersMap = d3.group(data, getCId);
    const clusterResults = [];

    // Determine all possible cluster IDs to ensure they all appear in the panel
    const allClusterIds = fullData
        ? Array.from(new Set(fullData.map(getCId))).filter(d => d !== null && d !== undefined && d !== "")
        : Array.from(clustersMap.keys()).filter(d => d !== null && d !== undefined && d !== "");

    allClusterIds.forEach(clusterId => {
        const trajectories = clustersMap.get(clusterId) || [];

        // Sum of state frequencies (proportions)
        const sumFreqs = {};
        let validTrajCount = 0;

        // Sums for averages
        let sumSpeed = 0;
        let sumDistance = 0;
        let sumEntropy = 0;
        let sumDwell = 0;
        let countMetrics = 0;

        trajectories.forEach(traj => {
            // Metrics Calculation
            const speed = parseFloat(traj.high_speed_ratio || 0);
            const entropy = parseFloat(traj.shannon_entropy || 0);
            const dwell = parseFloat(traj.avg_dwell_time || 0);

            const points = parseTrajectoryData(traj.trajectory_xy);
            const dist = calculateStraightLineDistance(points);

            if (!isNaN(speed) && !isNaN(entropy) && !isNaN(dwell) && !isNaN(dist)) {
                sumSpeed += speed;
                sumDistance += dist;
                sumEntropy += entropy;
                sumDwell += dwell;
                countMetrics++;
            }

            // Frequency Calculation
            let seqRaw = [];
            try {
                const rawStr = traj.movement_list || traj.simbolic_movement || "[]";
                const jsonStr = rawStr.replace(/'/g, '"');
                seqRaw = JSON.parse(jsonStr);
            } catch (e) {
                return;
            }

            if (!Array.isArray(seqRaw) || seqRaw.length < 1) return;

            const trajCounts = {};
            let trajValidStates = 0;

            seqRaw.forEach(token => {
                const key = normalizeTokenForFreq(token);
                if (key) {
                    trajCounts[key] = (trajCounts[key] || 0) + 1;
                    trajValidStates++;
                }
            });

            if (trajValidStates > 0) {
                for (const key in trajCounts) {
                    sumFreqs[key] = (sumFreqs[key] || 0) + (trajCounts[key] / trajValidStates);
                }
                validTrajCount++;
            }
        });

        // Compute Averages
        const avgFreqs = {};
        let maxAvgFreq = 0;
        if (validTrajCount > 0) {
            for (const key in sumFreqs) {
                avgFreqs[key] = sumFreqs[key] / validTrajCount;
                maxAvgFreq = Math.max(maxAvgFreq, avgFreqs[key]);
            }
        }

        const avgSpeed = countMetrics > 0 ? sumSpeed / countMetrics : 0;
        const avgDistance = countMetrics > 0 ? sumDistance / countMetrics : 0;
        const avgEntropy = countMetrics > 0 ? sumEntropy / countMetrics : 0;
        const avgDwell = countMetrics > 0 ? sumDwell / countMetrics : 0;

        clusterResults.push({
            id: clusterId,
            freqs: avgFreqs,
            maxFreq: maxAvgFreq,
            count: validTrajCount,
            total: totalCounts[clusterId] || validTrajCount,
            metrics: {
                speed: avgSpeed,
                distance: avgDistance,
                entropy: avgEntropy,
                dwell: avgDwell
            }
        });
    });

    clusterResults.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    // ==================================================
    // 4. Renderização
    // ==================================================
    const selectedSet = new Set((activeClusterIds || []).map(String));

    if (clusterResults.length === 0) {
        container.append("div")
            .style("padding", "10px")
            .style("font-size", "12px")
            .style("color", "#777")
            .text("No data for the current filters.");
        return;
    }

    // Helper to generate compact progress bar
    function createMetricBar(container, value, thresholds, maxValue) {
        const barContainer = container.append("div")
            .style("display", "flex")
            .style("flex-direction", "row")
            .style("align-items", "center")
            .style("gap", "4px")
            .style("flex", "1");

        const barColor = "#999";

        const barWrapper = barContainer.append("div")
            .style("flex", "0 1 35px")
            .style("min-width", "25px")
            .style("height", "8px")
            .style("background", "#e0e0e0")
            .style("border-radius", "2px")
            .style("overflow", "hidden")
            .style("position", "relative");

        const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
        barWrapper.append("div")
            .style("height", "100%")
            .style("width", percentage + "%")
            .style("background", barColor)
            .style("transition", "width 0.3s ease")
            .style("border-radius", "2px");

        barContainer.append("div")
            .style("font-size", "8px")
            .style("color", "#888")
            .style("text-align", "right")
            .style("min-width", "10px")
            .text(value.toFixed(2));
    }

    clusterResults.forEach(clusterData => {
        const cId = clusterData.id;
        const cColor = CLUSTER_COLORS[Math.abs(+cId % CLUSTER_COLORS.length)];
        const isSelected = selectedSet.has(String(cId));
        const isDisabled = clusterData.count === 0;

        const percentage = globalTotal > 0
            ? ((clusterData.count / globalTotal) * 100).toFixed(1)
            : "0.0";

        const card = wrapper.append("div")
            .attr("data-cluster-id", cId)
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("background", isSelected ? d3.color(cColor).copy({ opacity: 0.1 }) : "#fff")
            .style("border", isSelected ? `1px solid ${cColor}` : "1px solid #ddd")
            .style("border-radius", "4px")
            .style("box-shadow", "0 1px 2px rgba(0,0,0,0.05)")
            .style("cursor", isDisabled ? "default" : "pointer")
            .style("pointer-events", isDisabled ? "none" : "auto")
            .style("opacity", isDisabled ? 0.4 : 1)
            .style("filter", isDisabled ? "grayscale(80%)" : "none")
            .style("padding", "0")
            .on("click", function () {
                const newSet = new Set(selectedSet);
                if (newSet.has(String(cId))) {
                    newSet.delete(String(cId));
                }
                else {
                    newSet.add(String(cId));
                }

                eventManager.notify('CLUSTERS_CHANGED', {
                    clusterIds: Array.from(newSet)
                });
            });

        // 1. Header
        const header = card.append("div")
            .attr("class", "cluster-card-header")
            .style("background", d3.color(cColor).copy({ opacity: 0.8 }))
            .style("color", "#273443");

        header.append("span")
            .attr("class", "cluster-card-name")
            .text(`Cluster ${cId}`);

        header.append("span")
            .attr("class", "cluster-card-summary")
            .text(`n: ${clusterData.count}  (${percentage}%)`)
            .attr("title", `${clusterData.count} trajectories (${percentage}%)`);

        // 2. Content Row
        const contentRow = card.append("div")
            .style("display", "flex")
            .style("flex-direction", "row")
            .style("padding", "8px 9px");

        // 2a. Left Side: Frequency Glyph
        const leftCol = contentRow.append("div")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("align-items", "center")
            .style("margin-right", "5px");

        const marginGlyph = 0;
        const glyphScale = 0.78; // <— ajuste aqui (0.5 menor, 0.8 leve redução)
        const svg = leftCol.append("svg")
            .attr("width", size + marginGlyph)
            .attr("height", size + marginGlyph);

        const g = svg.append("g")
            .attr("transform",
                `translate(${size / 2 + marginGlyph / 2}, ${size / 2 + marginGlyph / 2}) scale(${glyphScale})`
            );
        g.append("rect")
            .attr("x", -half).attr("y", -half)
            .attr("width", size).attr("height", size)
            .attr("fill", VISUALIZATION_CONFIG.cellBackgroundColor)
            .attr("stroke", VISUALIZATION_CONFIG.cellBorderColor);

        // Draw Speed/Direction regions
        for (let l = 0; l < 5; l++) {
            for (let dir = 0; dir < 4; dir++) {
                const freq = clusterData.freqs[`${l}_${dir}`] || 0;
                if (freq > 0) {
                    const path = getRegionPath(dir, l);
                    g.append("path")
                        .attr("d", path)
                        .attr("fill", baseColorGlyph)
                        .attr("opacity", clusterData.maxFreq > 0 ? freq / clusterData.maxFreq : 0)
                        .append("title").text(`Avg Proportion: ${(freq * 100).toFixed(1)}%`);
                }
            }
        }

        const gridColor = VISUALIZATION_CONFIG.frenquencyGlyph.gridLineColor;
        const gridW = VISUALIZATION_CONFIG.frenquencyGlyph.gridLineWidth;

        g.append("line").attr("x1", -half).attr("y1", -half).attr("x2", half).attr("y2", half).attr("stroke", gridColor).attr("stroke-width", gridW);
        g.append("line").attr("x1", half).attr("y1", -half).attr("x2", -half).attr("y2", half).attr("stroke", gridColor).attr("stroke-width", gridW);

        for (let i = 1; i <= 5; i++) {
            const r = i * step;
            g.append("rect").attr("x", -r).attr("y", -r).attr("width", r * 2).attr("height", r * 2).attr("fill", "none").attr("stroke", gridColor).attr("stroke-width", gridW);
        }

        // Labels
        const labelOffset = half + 5;
        const labels = [
            { text: "N", x: 0, y: -labelOffset },
            { text: "E", x: labelOffset, y: 0 },
            { text: "S", x: 0, y: labelOffset },
            { text: "W", x: -labelOffset, y: 0 }
        ];

        labels.forEach(l => {
            g.append("text")
                .attr("x", l.x)
                .attr("y", l.y)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .style("font-size", "10px")
                .style("fill", "#666")
                .style("font-weight", "bold")
                .text(l.text);
        });

         // 2b. Right Side: Statistics
        const rightCol = contentRow.append("div")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("justify-content", "center")
            .style("font-size", "9px")
            .style("gap", "2px")
            .style("min-width", "80px")
            .style("flex", "1");

        // Calculate max values for normalization
        const maxSpeed = Math.max(0.01, ...clusterResults.map(c => c.metrics.speed));
        const maxDistance = Math.max(0.01, ...clusterResults.map(c => c.metrics.distance));
        const maxEntropy = Math.max(0.01, ...clusterResults.map(c => c.metrics.entropy));
        const maxDwell = Math.max(0.01, ...clusterResults.map(c => c.metrics.dwell));

        // Metric rows with labels and bars
        const addMetricBar = (label, value, thresholds, maxVal) => {
            const row = rightCol.append("div")
                .style("display", "flex")
                .style("flex-direction", "row")
                .style("align-items", "center")
                .style("gap", "1px");
            
            row.append("span")
                .style("font-size", "8px")
                .style("line-height", "1.2")
                .style("min-width", "35px")
                .text(label);
            
            createMetricBar(row, value, thresholds, maxVal);
        };

        addMetricBar("Speed", clusterData.metrics.speed, metricThresholds.speed, maxSpeed);
        addMetricBar("Distance", clusterData.metrics.distance, metricThresholds.distance, maxDistance);
        addMetricBar("Entropy", clusterData.metrics.entropy, metricThresholds.entropy, maxEntropy);
        addMetricBar("Dwell", clusterData.metrics.dwell, metricThresholds.dwell, maxDwell);
    });
}
