import { VISUALIZATION_CONFIG, SPEED_STRINGS, DIRECTION_STRINGS } from './config.js';

export function frequencyGlyph(data, targetSelector = ".container") {
  const container = d3.select(targetSelector);
  container.selectAll("*").remove();

  if (!data || data.length === 0 || (data.length === 1 && !data[0])) {
    container.append("div")
      .attr("class", "panel-placeholder")
      .append("p").text("Select a trajectory");
    return;
  }

  // ==================================================
  // Controls & Legend Wrapper
  // ==================================================
  const controlsDiv = container.append("div")
    .attr("class", "rug-controls")
    .style("justify-content", "space-between");

  controlsDiv.append("span")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .style("margin-right", "10px")
    .text("Frequency of states");

  // Shared system legend is fixed below the Behaviour Rug.
  // This panel only renders the frequency glyph and its title.
  const isSingle = data.length === 1;
  let contentWrapper;
  if (isSingle) {
    contentWrapper = container.append("div")
      .style("display", "flex")
      .style("justify-content", "center")
      .style("width", "100%")
      .style("height", "calc(100% - 30px)") // Adjust for controls height
      .style("overflow", "hidden");
  } else {
    contentWrapper = container.append("div")
      .attr("class", "frenquency-glyph-scroll-wrapper")
      .style("width", "100%")
      .style("height", "calc(100% - 30px)")
      .style("overflow-y", "auto");
  }

  // ==================================================
  // Configuração
  // ==================================================
  const size = VISUALIZATION_CONFIG.frenquencyGlyph.glyphSize;
  const half = size / 2;
  const step = half / VISUALIZATION_CONFIG.frenquencyGlyph.glyphLevels;
  const baseColor = "#050505ff";

  // Mapeamentos (usados internamente se necessário, mas a lógica abaixo usa string includes)
  // const speedMap = { ... };
  // const dirMap = { ... };

  function getRegionPath(direction, level) {
    const innerR = level * step;
    const outerR = (level + 1) * step;

    if (direction === 0) return `M${-innerR},${-innerR} L${innerR},${-innerR} L${outerR},${-outerR} L${-outerR},${-outerR} Z`; // N
    if (direction === 1) return `M${innerR},${-innerR} L${innerR},${innerR} L${outerR},${outerR} L${outerR},${-outerR} Z`; // E
    if (direction === 2) return `M${innerR},${innerR} L${-innerR},${innerR} L${-outerR},${outerR} L${outerR},${outerR} Z`; // S
    if (direction === 3) return `M${-innerR},${innerR} L${-innerR},${-innerR} L${-outerR},${-outerR} L${-outerR},${outerR} Z`; // W
    return "";
  }

  // ==================================================
  // Processamento e Renderização
  // ==================================================
  data.forEach(d => {
    let seq = [];
    try {
      const raw = JSON.parse(d.simbolic_movement.replace(/'/g, '"'));
      if (Array.isArray(raw)) seq = raw;
    } catch (e) { }
    if (seq.length === 0 && !isSingle) return;

    const counts = {};
    let maxCount = 0;

    seq.forEach(s => {
      if (!s) return;
      let spVal = -1, dirVal = -1;

      if (s.includes("Muito_Lento")) spVal = 0;
      else if (s.includes("Muito_Rapido")) spVal = 4;
      else if (s.includes("Lento")) spVal = 1;
      else if (s.includes("Medio")) spVal = 2;
      else if (s.includes("Rapido")) spVal = 3;


      if (s.includes("Norte")) dirVal = 0;
      else if (s.includes("Leste")) dirVal = 1;
      else if (s.includes("Sul")) dirVal = 2;
      else if (s.includes("Oeste")) dirVal = 3;

      if (spVal > -1 && dirVal > -1) {
        const key = `${spVal}_${dirVal}`;
        counts[key] = (counts[key] || 0) + 1;
        maxCount = Math.max(maxCount, counts[key]);
      }
    });

    const plotDiv = contentWrapper.append("div")
      .attr("class", "plot-container")
      .style("display", "flex")
      .style("flex-direction", "column")
      .style("align-items", "center");

    plotDiv.append("div")
      .attr("class", "chart-title")
      .html(`Trajectory ${d.trajectory_label}`);

    // Container que segura SVG e Métricas lado a lado
    const layoutDiv = plotDiv.append("div")
      .style("display", "flex")
      .style("flex-direction", "row") // Garante linha
      .style("align-items", "center") // Centraliza verticalmente
      .style("justify-content", "center")
      .style("gap", "20px"); // Espaço entre o Glifo e as Métricas

    // --- Desenho do Glifo (SVG) ---
    const margin = 35;
    const svg = layoutDiv.append("svg")
      .attr("width", size + margin)
      .attr("height", size + margin);

    const g = svg.append("g")
      .attr("transform", `translate(${size / 2 + margin / 2}, ${size / 2 + margin / 2})`);

    g.append("rect")
      .attr("x", -half).attr("y", -half)
      .attr("width", size).attr("height", size)
      .attr("fill", VISUALIZATION_CONFIG.cellBackgroundColor)
      .attr("stroke", VISUALIZATION_CONFIG.cellBorderColor);

    // Draw Speed/Direction regions (Levels 0 to 4)
    for (let l = 0; l <= 4; l++) {
      for (let dir = 0; dir < 4; dir++) {
        const c = counts[`${l}_${dir}`] || 0;
        if (c > 0) {
          const path = getRegionPath(dir, l);
          g.append("path")
            .attr("d", path)
            .attr("fill", baseColor)
            .attr("opacity", c / maxCount)
            .append("title").text(`Count: ${c}`);
        }
      }
    }

    const gridColor = VISUALIZATION_CONFIG.frenquencyGlyph.gridLineColor;
    const gridW = VISUALIZATION_CONFIG.frenquencyGlyph.gridLineWidth;

    g.append("line").attr("x1", -half).attr("y1", -half).attr("x2", half).attr("y2", half).attr("stroke", gridColor).attr("stroke-width", gridW);
    g.append("line").attr("x1", half).attr("y1", -half).attr("x2", -half).attr("y2", half).attr("stroke", gridColor).attr("stroke-width", gridW);

    for (let i = 1; i <= 4; i++) {
      const r = i * step;
      g.append("rect").attr("x", -r).attr("y", -r).attr("width", r * 2).attr("height", r * 2).attr("fill", "none").attr("stroke", gridColor).attr("stroke-width", gridW);
    }

    const labelOffset = half + 10;
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

    // --- Métricas (Ao lado do SVG) ---
    if (isSingle) {
      const formatMetric = (val) => {
        const num = parseFloat(val);
        return isNaN(num) ? "N/A" : num.toFixed(3);
      };

      // Adicionamos ao layoutDiv em vez do plotDiv
      const metricsDiv = layoutDiv.append("div")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("align-items", "flex-start") // Alinha texto à esquerda
        .style("font-size", "11px")
        .style("color", "#555")
        .style("min-width", "120px"); // Garante uma largura mínima para as métricas

      const metrics = [
        { label: "Shannon Entropy", value: d.shannon_entropy, desc: "Measures the uncertainty or diversity of movement states." },
        { label: "Avg Dwell Time", value: d.avg_dwell_time, desc: "The average number of consecutive time steps spent in the same state." },
        { label: "High Speed Ratio", value: d.high_speed_ratio, desc: "The fraction of the total trajectory duration spent in high speed states." }
      ];

      metrics.forEach(m => {
        metricsDiv.append("div")
          .style("cursor", "help")
          .style("margin-bottom", "6px")
          .style("text-align", "left")
          .html(`<strong>${m.label}:</strong><br>${formatMetric(m.value)}`)
          .on("mouseover", (event) => {
            const tooltip = d3.select("body").selectAll(".tooltip").data([0]).join("div").attr("class", "tooltip");
            tooltip.text(m.desc)
              .style("opacity", 1)
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 10) + "px");
          })
          .on("mousemove", (event) => {
            d3.select(".tooltip")
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 10) + "px");
          })
          .on("mouseout", () => {
            d3.select(".tooltip").style("opacity", 0);
          });
      });
    }
  });
}