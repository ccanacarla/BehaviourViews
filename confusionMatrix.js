import { CLUSTER_COLORS } from './config.js';
import { eventManager } from './events.js';

let selection = [];

eventManager.subscribe('RESET_FILTERS', () => {
    selection = [];
    // We don't necessarily need to redraw here as main.js will trigger a redraw with reset data
    // but if we wanted to clear highlighting immediately without data change, we could.
    // Since main.js calls drawConfusionMatrix on reset, the visual update happens there.
});

export function drawConfusionMatrix(data, containerSelector, fullData = null, activeClusterIds = null) {
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();

    if (!data || data.length === 0) {
        container.append("div")
            .attr("class", "panel-placeholder")
            .append("p").text("No data for Confusion Matrix");
        return;
    }

    // 1. Prepare Data & Domains
    // Use fullData for domains if available to keep matrix stable
    const domainData = fullData || data;

    const xLabels = Array.from(new Set(domainData.map(d => d.phys_cluster))).sort((a, b) => a - b);
    const yLabels = Array.from(new Set(domainData.map(d => d.cluster))).sort((a, b) => a - b);

    // Initialize matrix
    const matrix = {};
    yLabels.forEach(yVal => {
        matrix[yVal] = {};
        xLabels.forEach(xVal => {
            matrix[yVal][xVal] = { count: 0, ids: [] };
        });
    });

    // Fill matrix with CURRENT (filtered) data
    data.forEach(d => {
        const xVal = d.phys_cluster;
        const yVal = d.cluster;
        if (matrix[yVal] && matrix[yVal][xVal]) {
            matrix[yVal][xVal].count++;
            matrix[yVal][xVal].ids.push(d.trajectory_id);
        }
    });

    // Flatten for D3
    const flatData = [];
    yLabels.forEach(yVal => {
        xLabels.forEach(xVal => {
            flatData.push({
                yVal: yVal,
                xVal: xVal,
                count: matrix[yVal][xVal].count,
                ids: matrix[yVal][xVal].ids
            });
        });
    });

    const maxCount = d3.max(flatData, d => d.count) || 1; // avoid divide by zero

    // 2. Setup Dimensions
    const margin = { top: 8, right: 12, bottom: 39, left: 46 };
    const containerRect = container.node().getBoundingClientRect();
    const width = containerRect.width || 200;
    const height = 178; // Compact matrix; keep axis labels visible.
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // 3. Scales
    const x = d3.scaleBand()
        .range([0, innerWidth])
        .domain(xLabels)
        .padding(0.05);

    const y = d3.scaleBand()
        .range([0, innerHeight])
        .domain(yLabels)
        .padding(0.05);
    const color = d3.scaleSequential()
        .interpolator(d3.interpolateBlues)
        .domain([0, maxCount]);
    // 4. Draw
    // X Axis
    svg.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x));

    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 30)
        .style("text-anchor", "middle")
        .style("font-size", "10px")
        .text("Cluster - Metrics");

    // Y Axis
    svg.append("g")
        .call(d3.axisLeft(y));

    svg.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", -30)
        .attr("x", -innerHeight / 2)
        .style("text-anchor", "middle")
        .style("font-size", "10px")
        .text("Cluster - Symbolic Movement");

    // Cells
    const cells = svg.selectAll(".cell")
        .data(flatData)
        .enter()
        .append("rect")
        .attr("class", "cell")
        .attr("x", d => x(d.xVal))
        .attr("y", d => y(d.yVal))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("rx", 4)
        .attr("ry", 4)
        .style("fill", d => d.count === 0 ? "#f9f9f9" : color(d.count))
        .style("cursor", d => d.count === 0 ? "default" : "pointer")
        .style("stroke", d => {
            const isSelected = selection.some(s => s.yVal === d.yVal && s.xVal === d.xVal);
            if (isSelected || activeClusterIds && activeClusterIds.includes(String(d.yVal))) {
                return CLUSTER_COLORS[Math.abs(+d.yVal % CLUSTER_COLORS.length)];
            }
            return "#ddd";
        })
        .style("stroke-width", d => {
            const isSelected = selection.some(s => s.yVal === d.yVal && s.xVal === d.xVal);
            if (isSelected) {
                return 3;
            }
            if (activeClusterIds && activeClusterIds.includes(String(d.yVal))) {
                return 3;
            }
            return 1;
        })
        .on("click", (event, d) => {
            if (d.count === 0) return;

            // Toggle selection
            const existingIndex = selection.findIndex(s => s.yVal === d.yVal && s.xVal === d.xVal);

            if (existingIndex !== -1) {
                // Remove from selection
                selection.splice(existingIndex, 1);
            } else {
                // Add to selection
                selection.push({ yVal: d.yVal, xVal: d.xVal });
            }

            // Calculate aggregated IDs
            let allIds = null;
            if (selection.length > 0) {
                allIds = [];
                selection.forEach(sel => {
                    let cellIds = [];
                    // Look up IDs for this cell
                    // If fullData is available, query it to ensure stable filtering context
                    if (fullData) {
                        cellIds = fullData
                            .filter(item => item.cluster === sel.yVal && item.phys_cluster === sel.xVal)
                            .map(item => item.trajectory_id);
                    } else {
                        // Fallback to current filtered data (less robust for toggling)
                        // In drawConfusionMatrix, 'd.ids' holds current data IDs. 
                        // But we might need IDs that were filtered OUT if we are adding to selection?
                        // If fullData is always passed (as per previous step), we are safe.
                        // Assuming fullData is passed.
                    }
                    allIds = allIds.concat(cellIds);
                });
                // Deduplicate
                allIds = [...new Set(allIds)];
            }

            eventManager.notify('CONFUSION_MATRIX_FILTER_CHANGED', { trajectoryIds: allIds });
        });

    // Text counts
    svg.selectAll(".cell-text")
        .data(flatData)
        .enter()
        .append("text")
        .attr("class", "cell-text")
        .attr("x", d => x(d.xVal) + x.bandwidth() / 2)
        .attr("y", d => y(d.yVal) + y.bandwidth() / 2)
        .style("text-anchor", "middle")
        .style("alignment-baseline", "middle")
        .style("font-size", "10px")
        .style("pointer-events", "none")
        .style("fill", d => d.count > maxCount / 2 ? "white" : "black")
        .text(d => d.count > 0 ? d.count : "");

}
