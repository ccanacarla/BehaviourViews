import { SPEED_LABELS } from './speedSettings.js';
import { parseTrajectoryData } from './dataUtils.js';

/**
 * Desenha a visualização da trajetória.
 *
 * @param {Object|Array} data - Single object or Array of objects (trajectory rows).
 * @param {string} containerSelector
 * @param {Object} [opts]
 * @param {{x:[number,number], y:[number,number]}} [opts.fixedDomain]
 * @param {string} [opts.highlightId] - ID of a trajectory to highlight in multi-view.
 * @param {Set} [opts.highlightLentoIndices]
 * @param {Set} [opts.highlightTurnIndices]
 * @param {Set} [opts.highlightCustomIndices]
 */
export function drawTrajectoryView(data, containerSelector, opts = {}) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  // Handle single item or array
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0 || (rows.length === 1 && !rows[0])) {
    container.append("div")
      .attr("class", "panel-placeholder")
      .append("p").text("Select a trajectory");
    return;
  }

  const isMulti = rows.length > 1;
  const highlightId = opts.highlightId;
  const highlightColor = opts.highlightColor || "#7f7f7eff";

  // Se você não passar fixedDomain, usa este default (ajuste conforme seu dataset)
  const DEFAULT_FIXED_DOMAIN = opts.fixedDomain || { x: [-1, 1], y: [-1, 1] };
  const wrapper = container.append("div")
    .attr("class", "trajectory-view-wrapper")
    .style("width", "100%")
    .style("border-radius", "6px")
    .style("margin-bottom", "10px")
    .style("background", "#fff")
    .style("height", "auto")
    .style("padding", "0px");

  // ==================================================
  // 1) Controles
  // ==================================================
  const controls = wrapper.append("div")
    .attr("class", "trajectory-controls")
    .style("margin-bottom", "10px")
    .style("display", "flex")
    .style("flex-direction", "column") // Stacked vertically
    .style("gap", "8px")
    .style("font-size", "12px")
    .style("background", "#ccccccff")
    .style("padding", "8px")
    .style("border-radius", "6px 6px 0px 0px")
    .style("border", "1px 1px 1px 0px solid #ccc");

  // Animation state (Only for single trajectory)
  let isPlaying = false;
  let animationId = null;
  let currentPointIndex = 0;
  let animationPoints = [];
  let animXScale, animYScale;

  const FPS = 5;
  const frameInterval = 1000 / FPS;
  let lastFrameTime = 0;

  // --- Grupo A: tipo de trajetória ---
  const trajGroup = controls.append("div")
    .style("display", "flex")
    .style("gap", "6px")
    .style("align-items", "center");

  trajGroup.append("span")
    .style("font-weight", "bold")
    .text("Trajectory:");

  const trajOptions = [
    { label: "Original", key: "trajectory_xy" },
    { label: "Translate", key: "trajectory_xy_translate" },
    { label: "Rotate", key: "trajectory_xy_rotated" }
  ];

  let currentKey = trajOptions[0].key;

  const trajectorySelect = trajGroup.append("select")
    .attr("class", "trajectory-mode-select")
    .attr("aria-label", "Trajectory representation");

  trajectorySelect.selectAll("option")
    .data(trajOptions)
    .enter().append("option")
    .attr("value", d => d.key)
    .text(d => d.label);

  trajectorySelect.property("value", currentKey)
    .on("change", function () {
      stopAnimation();
      currentKey = this.value;
      updatePlot();
    });

  // --- Grupo B: modo de escala ---
  const scaleGroup = controls.append("div")
    .style("display", "flex")
    .style("gap", "6px")
    .style("margin-left", "10px")
    .style("align-items", "center");

  scaleGroup.append("span")
    .style("font-weight", "bold")
    .text("Scale:");

  let scaleMode = "auto";
  const scaleOptions = [
    { label: "Auto", value: "auto" },
    { label: "Fixed", value: "fixed" }
  ];

  const scaleSelect = scaleGroup.append("select")
    .attr("class", "trajectory-scale-select")
    .attr("aria-label", "Trajectory scale");

  scaleSelect.selectAll("option")
    .data(scaleOptions)
    .enter().append("option")
    .attr("value", d => d.value)
    .text(d => d.label);

  scaleSelect.property("value", scaleMode)
    .on("change", function () {
      stopAnimation();
      scaleMode = this.value;
      updatePlot();
    });

  // Playback is placed below the SVG, like the Video panel.
  let playBtn, progressBar;

  // ==================================================
  // 2) Área do Plot
  // ==================================================
  const width = 420;
  const height = 150;
  const margin = { top: 0, right: 25, bottom: 10, left: 45 };

  const svg = wrapper.append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("background", "#fff");

  // --- Playback bar below the trajectory plot ---
  if (!isMulti) {
    const playbackContainer = wrapper.append("div")
      .attr("class", "video-controls active trajectory-playback-controls");

    playBtn = playbackContainer.append("button")
      .attr("class", "video-btn")
      .html("▶ Play");

    const progressTrack = playbackContainer.append("div")
      .attr("class", "video-progress-track");

    progressBar = progressTrack.append("div")
      .attr("class", "video-progress-fill")
      .style("width", "0%");

    playBtn.on("click", () => {
      if (isPlaying) pauseAnimation();
      else startAnimation();
    });

    progressTrack.on("click", function (event) {
      if (!animationPoints.length) return;
      const rect = this.getBoundingClientRect();
      if (!rect.width) return;
      const p = (event.clientX - rect.left) / rect.width;
      const clampedP = Math.max(0, Math.min(1, p));
      currentPointIndex = Math.floor(clampedP * (animationPoints.length - 1));
      updateTrackerPosition();
    });
  }

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})
`);

  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const pathsGroup = g.append("g").attr("class", "paths-group");

  const xAxisG = g.append("g")
    .attr("transform", `translate(0, ${innerH})
`);

  const yAxisG = g.append("g");

  // Single mode markers
  const startPoint = g.append("circle")
    .attr("r", 4)
    .attr("fill", "green")
    .style("display", "none");

  const endPoint = g.append("circle")
    .attr("r", 4)
    .attr("fill", "red")
    .style("display", "none");

  const tracker = g.append("circle")
    .attr("r", 5)
    .attr("fill", "blue")
    .attr("stroke", "white")
    .attr("stroke-width", 1.5)
    .style("display", "none");

  // ==================================================
  // 3) Atualização do Plot
  // ==================================================
  function pauseAnimation() {
    isPlaying = false;
    if (playBtn) playBtn.html("▶ Play");
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
  }

  function stopAnimation() {
    pauseAnimation();
    currentPointIndex = 0;
    if (progressBar) progressBar.style("width", "0%");

    if (animationPoints.length > 0) {
      updateTrackerPosition();
      tracker.style("display", null);
    } else {
      tracker.style("display", "none");
    }
  }

  function startAnimation() {
    if (!animationPoints.length) return;
    isPlaying = true;
    if (playBtn) playBtn.html("⏸ Pause");

    if (currentPointIndex >= animationPoints.length - 1) {
      currentPointIndex = 0;
    }
    lastFrameTime = performance.now();
    animationId = requestAnimationFrame(animate);
  }

  function updateTrackerPosition() {
    const p = animationPoints[currentPointIndex];
    if (p && animXScale && animYScale) {
      tracker
        .attr("cx", animXScale(p[0]))
        .attr("cy", animYScale(p[1]));
    }
    if (progressBar && animationPoints.length > 0) {
      const pct = currentPointIndex / (animationPoints.length - 1);
      progressBar.style("width", `${pct * 100}%`);
    }
  }

  function animate(currentTime) {
    if (!isPlaying) return;

    const deltaTime = currentTime - lastFrameTime;

    if (deltaTime >= frameInterval) {
      updateTrackerPosition();
      currentPointIndex++;
      lastFrameTime = currentTime - (deltaTime % frameInterval);
    }

    if (currentPointIndex < animationPoints.length) {
      animationId = requestAnimationFrame(animate);
    } else {
      pauseAnimation();
    }
  }

  function updatePlot() {
    // Parse all trajectories
    const parsedData = rows.map(d => {
      const r = d.raw || d;
      const val = r[currentKey] ? (r[currentKey].raw || r[currentKey]) : "";
      return {
        id: r.trajectory_id,
        label: r.trajectory_label,
        points: parseTrajectoryData(val)
      };
    }).filter(d => d.points.length > 0);

    if (parsedData.length === 0) {
      animationPoints = [];
      stopAnimation();
      pathsGroup.selectAll("*").remove();
      return;
    }

    // Determine target for single-mode features
    // If multi but highlightId exists, we can optionally point to that. 
    // But for simplicity, animation/start/end is only for strict single mode.
    if (!isMulti) {
      animationPoints = parsedData[0].points;
    } else {
      animationPoints = [];
    }

    // Determine domain
    let xDomain, yDomain;

    if (scaleMode === "fixed") {
      xDomain = DEFAULT_FIXED_DOMAIN.x;
      yDomain = DEFAULT_FIXED_DOMAIN.y;
    } else {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

      parsedData.forEach(d => {
        const xe = d3.extent(d.points, p => p[0]);
        const ye = d3.extent(d.points, p => p[1]);
        if (xe[0] < minX) minX = xe[0];
        if (xe[1] > maxX) maxX = xe[1];
        if (ye[0] < minY) minY = ye[0];
        if (ye[1] > maxY) maxY = ye[1];
      });

      const xPad = (maxX - minX) * 0.1 || 1;
      const yPad = (maxY - minY) * 0.1 || 1;
      xDomain = [minX - xPad, maxX + xPad];
      yDomain = [minY - yPad, maxY + yPad];
    }

    const xScale = d3.scaleLinear().domain(xDomain).range([0, innerW]);
    const yScale = d3.scaleLinear()
      .domain(yDomain)
      .range(currentKey === "trajectory_xy_rotated" ? [innerH, 0] : [0, innerH]);

    animXScale = xScale;
    animYScale = yScale;

    const line = d3.line()
      .x(p => xScale(p[0]))
      .y(p => yScale(p[1]));

    xAxisG.call(d3.axisBottom(xScale).ticks(5));
    yAxisG.call(d3.axisLeft(yScale).ticks(5));

    // Bind data to paths
    const paths = pathsGroup.selectAll(".traj-path")
      .data(parsedData, d => d.id);

    paths.exit().remove();

    const pathsEnter = paths.enter().append("path")
      .attr("class", "traj-path")
      .attr("fill", "none")
      .attr("stroke-linecap", "round");

    pathsEnter.merge(paths)
      .attr("d", d => line(d.points))
      .attr("stroke", d => {
        if (highlightId && d.id === highlightId) return highlightColor; // Selected: Dynamic color
        return "#646ec7";
      })
      .attr("stroke-width", d => {
        if (highlightId && d.id === highlightId) return 3;
        return isMulti ? 1 : 2;
      })
      .attr("opacity", d => {
        if (highlightId && d.id === highlightId) return 1;
        if (highlightId) return 0.1; // Dim others significantly
        return isMulti ? 0.3 : 1;
      })
      // Sort to ensure highlighted is on top
      .selection().sort((a, b) => {
        if (a.id === highlightId) return 1;
        if (b.id === highlightId) return -1;
        return 0;
      });

    // Clean up single-mode overlays if switching to multi
    g.selectAll(".highlight-group").remove();
    startPoint.style("display", "none");
    endPoint.style("display", "none");

    // Re-add single mode overlays if strictly single
    if (!isMulti && parsedData[0]) {
      const points = parsedData[0].points;
      const pStart = points[0];
      const pEnd = points[points.length - 1];

      startPoint.style("display", null)
        .attr("cx", xScale(pStart[0])).attr("cy", yScale(pStart[1]));
      endPoint.style("display", null)
        .attr("cx", xScale(pEnd[0])).attr("cy", yScale(pEnd[1]));

      if (opts.highlightLentoIndices || opts.highlightTurnIndices || opts.highlightCustomIndices || opts.highlightSegmentInterval || (opts.customMotifs && opts.customMotifs.length > 0)) {
        const hG = g.append("g").attr("class", "highlight-group");
        const drawHighlights = (indices, color, type) => {
          if (!indices || indices.size === 0) return;
          points.forEach((p, i) => {
            const showTooltip = (event) => {
              const tooltip = d3.select("body").selectAll(".tooltip").data([0]).join("div").attr("class", "tooltip");
              tooltip.text(type)
                .style("opacity", 1)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
            };
            const moveTooltip = (event) => {
              d3.select(".tooltip")
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
            };
            const hideTooltip = () => {
              d3.select(".tooltip").style("opacity", 0);
            };

            if (i < points.length - 1 && indices.has(i) && indices.has(i + 1)) {
              hG.append("line")
                .attr("x1", xScale(p[0])).attr("y1", yScale(p[1]))
                .attr("x2", xScale(points[i + 1][0])).attr("y2", yScale(points[i + 1][1]))
                .attr("stroke", color).attr("stroke-width", 4)
                .attr("stroke-opacity", 0.6)
                .style("cursor", "pointer")
                .on("mouseover", showTooltip)
                .on("mousemove", moveTooltip)
                .on("mouseout", hideTooltip);
            }
            if (indices.has(i)) {
              hG.append("circle")
                .attr("cx", xScale(p[0])).attr("cy", yScale(p[1]))
                .attr("r", 3).attr("fill", color)
                .style("cursor", "pointer")
                .on("mouseover", showTooltip)
                .on("mousemove", moveTooltip)
                .on("mouseout", hideTooltip);
            }
          });
        };
        if (opts.highlightLentoIndices) drawHighlights(opts.highlightLentoIndices, "orange", SPEED_LABELS[0]);
        if (opts.highlightTurnIndices) drawHighlights(opts.highlightTurnIndices, "#9b59b6", "Abrupt Turn");
        if (opts.highlightCustomIndices) {
          const customColor = opts.customMotifColor || "#16a085";
          const customName = opts.customMotifName || "Custom Motif";
          drawHighlights(opts.highlightCustomIndices, customColor, customName);
        }
        if (opts.customMotifs && Array.isArray(opts.customMotifs)) {
          opts.customMotifs.forEach(m => {
            if (m.indices && m.indices.size > 0) {
              drawHighlights(m.indices, m.color || "#16a085", m.name || "Custom Motif");
            }
          });
        }

        if (opts.highlightSegmentInterval) {
          const { startIndex, endIndex } = opts.highlightSegmentInterval;
          if (startIndex != null && endIndex != null) {
            const start = Math.min(startIndex, endIndex);
            const end = Math.max(startIndex, endIndex);

            // Draw the segment path
            hG.append("path")
              .datum(points.slice(start, end + 1))
              .attr("d", line)
              .attr("fill", "none")
              .attr("stroke", "#8e44ad") // Purple matching .frame-selected-interval
              .attr("stroke-width", 4)
              .attr("opacity", 1);
          }
        }
      }
    }

    // Title update
    const r = rows[0].raw || rows[0];
    const titleText = isMulti
      ? `${parsedData.length} Trajectories Selected`
      : `Trajectory ${r.trajectory_label || r.trajectory_id || r.id}`;

    wrapper.select(".chart-title").remove();
    wrapper.insert("div", "svg")
      .attr("class", "chart-title")
      .text(titleText);

    wrapper.select(".chart-title").remove();
    wrapper.insert("div", "svg")
      .attr("class", "chart-title")
      .html(`${titleText}`);

    stopAnimation();
  }

  updatePlot();
}
