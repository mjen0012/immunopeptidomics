/*****************************************************************
 *  Minimal peptide track viewer (no attributes/alleles)
 *  Adds bounded x-zoom + sync hooks to match heatmapChart.
 *  Visible hooks:
 *    onReady(xScaleBase)
 *    onZoom(xScaleCurrent, transform)
 *    element.__setZoom(transform)
 *****************************************************************/
import * as d3 from "npm:d3@7";

export function peptideChartScan({
  data        = [],               // [{ start: 1-based, length, peptide }]
  posExtent   = [1, 100],         // [min,max] genomic/protein coords
  rowHeight   = 18,
  gap         = 2,
  sizeFactor  = 1.1,
  margin      = { top: 18, right: 20, bottom: 24, left: 40 }, // left/right not used for x
  gutterLeft  = 110,
  gutterRight = 12,
  barColor    = "#006DAE",        // fallback when no percentile
  percentileByPeptide = null,     // Map or plain object: { PEPTIDE_UPPER: percentile }
  onReady     = () => {},
  onZoom      = () => {}
} = {}) {
  // Pack into non-overlapping levels (greedy)
  const rows = Array.isArray(data) ? [...data] : [];
  rows.sort((a, b) => d3.ascending(a.start, b.start));
  const levels = [];
  for (const p of rows) {
    let lvl = levels.findIndex(end => p.start >= end);
    if (lvl === -1) { lvl = levels.length; levels.push(0); }
    p.level = lvl;
    levels[lvl] = p.start + p.length;
  }
  const nLevels = Math.max(1, levels.length);


  const height  = margin.top + nLevels * rowHeight + margin.bottom;

  const svg = d3.create("svg")
    .style("width", "100%")
    .attr("viewBox", `0 0 1 ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("font-family", "sans-serif")
    .attr("font-size", 10 * sizeFactor);
  const g = svg.append("g");

  // Clip-path to prevent bars from drawing outside plot area
  const clipId = `clip-${Math.random().toString(36).slice(2)}`;
  const defs   = svg.append("defs");
  const clip   = defs.append("clipPath").attr("id", clipId).append("rect");
  
  // Scales + axis
  const posMin = +posExtent[0] || 1;
  const posMax = +posExtent[1] || 1;
  let xBase = d3.scaleLinear([posMin - 0.5, posMax + 0.5], [0, 1]);
  let viewW = 1;
  let suppressSync = false;
  let lastTransform = d3.zoomIdentity;


  const axisY = height - margin.bottom;
  const axisG = g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${axisY})`)
    .call(d3.axisBottom(xBase).tickFormat(d3.format("d")));

  // Percentile -> colour (match heatmap & peptideScanChart)
  const BLUE_MAX = 2, RED_MIN = 50;
  const pctToFill = (p) => {
    if (p == null || !isFinite(p)) return "#f0f0f0"; // neutral for missing
    const v = +p;
    if (v <= BLUE_MAX) return d3.interpolateBlues(1 - v / BLUE_MAX);
    if (v <= RED_MIN)  return d3.interpolateReds((v - BLUE_MAX) / (RED_MIN - BLUE_MAX));
    return d3.interpolateReds(1);
  };
  const lookupPct = (pep) => {
    const k = String(pep || "").toUpperCase().replace(/-/g, "").trim();
    if (!k) return null;
    if (!percentileByPeptide) return null;
    if (percentileByPeptide instanceof Map) return percentileByPeptide.get(k);
    return percentileByPeptide[k];
  };
  const fillFor = (d) => pctToFill(lookupPct(d.peptide));

  // Bars (clipped to plotting area)
  const barsG = g.append("g").attr("clip-path", `url(#${clipId})`);
  barsG.selectAll("rect")
    .data(rows)
    .enter().append("rect")
      .attr("y", d => margin.top + (nLevels - 1 - d.level) * rowHeight + gap / 2)
      .attr("height", rowHeight - gap)
      .attr("fill", fillFor)
      .attr("stroke", "#444")
      .attr("stroke-width", 0.5 * sizeFactor);

  // Zoom (bounded like heatmapChart)
  const zoom = d3.zoom()
    .scaleExtent([1, (posMax - posMin) / 10])
    .on("zoom", ev => {
      let t = ev.transform;

      // clamp to bounds (without early return)
      const r0 = gutterLeft;
      const r1 = viewW - gutterRight;
      const minX = (1 - t.k) * r1;
      const maxX = (1 - t.k) * r0;
      if (t.x < minX || t.x > maxX) {
        t = d3.zoomIdentity.translate(Math.max(minX, Math.min(maxX, t.x)), t.y).scale(t.k);
        // normalise internal zoom state
        if (t.x !== ev.transform.x || t.k !== ev.transform.k) svg.call(zoom.transform, t);
      }

      const zx = t.rescaleX(xBase);
      barsG.selectAll("rect")
        .attr("x", d => zx(d.start - 0.5) + gap / 2)
        .attr("width", d => Math.max(0, zx(d.start + d.length - 0.5) - zx(d.start - 0.5) - gap));
      axisG.call(d3.axisBottom(zx)
        .tickFormat(d3.format("d"))
        .ticks(Math.min(15, viewW / 60)));

      lastTransform = t;

      if (!suppressSync) onZoom(zx, t);
    });

  // Layout on container resize (match heatmap behaviour)
  function layout(wPx) {
    viewW = Math.max(1, wPx | 0);
    svg.attr("viewBox", `0 0 ${viewW} ${height}`);
    xBase.range([gutterLeft, viewW - gutterRight]);

    // update clip rect to current plot area
    clip
      .attr("x", gutterLeft)
      .attr("y", margin.top)
      .attr("width",  Math.max(1, viewW - gutterLeft - gutterRight))
      .attr("height", Math.max(0, (height - margin.bottom) - margin.top));

    barsG.selectAll("rect")
      .attr("x", d => xBase(d.start - 0.5) + gap / 2)
      .attr("width", d => Math.max(0, xBase(d.start + d.length - 0.5) - xBase(d.start - 0.5) - gap));

    axisG.call(d3.axisBottom(xBase)
      .tickFormat(d3.format("d"))
      .ticks(Math.min(15, viewW / 60)));

    zoom
      .extent([[gutterLeft, 0], [viewW - gutterRight, height]])
      .translateExtent([[gutterLeft, 0], [viewW - gutterRight, height]]);
    svg.call(zoom).on("dblclick.zoom", null);

    onReady(xBase);
  }

  // Public updater (if caller wants to resync scale)
  function updatePosExtent(newExtent = posExtent) {
    const a = +newExtent[0] || 1;
    const b = +newExtent[1] || 1;
    xBase.domain([a - 0.5, b + 0.5]);
    // keep current range (viewW) and redraw
    barsG.selectAll("rect")
      .attr("x", d => xBase(d.start - 0.5) + gap / 2)
      .attr("width", d => Math.max(0, xBase(d.start + d.length - 0.5) - xBase(d.start - 0.5) - gap));
    axisG.call(d3.axisBottom(xBase)
      .tickFormat(d3.format("d"))
      .ticks(Math.min(15, viewW / 60)));
  }

  // Wrapper for resize observation (same pattern as heatmapChart)
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.appendChild(svg.node());
  new ResizeObserver(e => layout(e[0].contentRect.width)).observe(wrapper);

  // Tiny API + metadata + sync hook
  wrapper.__updatePosExtent = updatePosExtent;
  wrapper.__setZoom = (transform) => {
    if (!transform) return;
    // If same transform, skip
    if (lastTransform && transform.k === lastTransform.k && transform.x === lastTransform.x && transform.y === lastTransform.y) return;
    // Clamp to this chart's bounds before applying
    const r0 = gutterLeft;
    const r1 = viewW - gutterRight;
    const minX = (1 - transform.k) * r1;
    const maxX = (1 - transform.k) * r0;
    let t = transform;
    if (t.x < minX || t.x > maxX) {
      t = d3.zoomIdentity.translate(Math.max(minX, Math.min(maxX, t.x)), t.y).scale(t.k);
    }
    suppressSync = true;
    try {
      svg.call(zoom.transform, t);
      lastTransform = t;
    } finally {
      suppressSync = false;
    }
  };
  wrapper.dataset.rows = String(rows.length);
  wrapper.dataset.levels = String(nLevels);
  wrapper.dataset.extentMin = String(posExtent[0]);
  wrapper.dataset.extentMax = String(posExtent[1]);

  return wrapper;
}
