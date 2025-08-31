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
  barColor    = "#006DAE",
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
  
  // Scales + axis
  const posMin = +posExtent[0] || 1;
  const posMax = +posExtent[1] || 1;
  let xBase = d3.scaleLinear([posMin - 0.5, posMax + 0.5], [0, 1]);
  let viewW = 1;


  const axisY = height - margin.bottom;
  const axisG = g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${axisY})`)
    .call(d3.axisBottom(xBase).tickFormat(d3.format("d")));

  // Bars
  const barsG = g.append("g");
  barsG.selectAll("rect")
    .data(rows)
    .enter().append("rect")
      .attr("y", d => margin.top + (nLevels - 1 - d.level) * rowHeight + gap / 2)
      .attr("height", rowHeight - gap)
      .attr("fill", barColor)
      .attr("stroke", "#444")
      .attr("stroke-width", 0.5 * sizeFactor);

  // Zoom (bounded like heatmapChart)
  const zoom = d3.zoom()
    .scaleExtent([1, (posMax - posMin) / 10])
    .on("zoom", ev => {
      let t = ev.transform;

      const r0 = gutterLeft;
      const r1 = viewW - gutterRight;
      const minX = (1 - t.k) * r1;
      const maxX = (1 - t.k) * r0;
      if (t.x < minX || t.x > maxX) {
        t = d3.zoomIdentity.translate(Math.max(minX, Math.min(maxX, t.x)), t.y).scale(t.k);
        svg.call(zoom.transform, t);
        return;
      }

      const zx = t.rescaleX(xBase);
      barsG.selectAll("rect")
        .attr("x", d => zx(d.start - 0.5) + gap / 2)
        .attr("width", d => Math.max(0, zx(d.start + d.length - 0.5) - zx(d.start - 0.5) - gap));
      axisG.call(d3.axisBottom(zx)
        .tickFormat(d3.format("d"))
        .ticks(Math.min(15, viewW / 60)));

      onZoom(zx, t);
    });

  // Layout on container resize (match heatmap behaviour)
  function layout(wPx) {
    viewW = Math.max(1, wPx | 0);
    svg.attr("viewBox", `0 0 ${viewW} ${height}`);
    xBase.range([gutterLeft, viewW - gutterRight]);

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
  wrapper.__setZoom = (transform) => { if (transform) svg.call(zoom.transform, transform); };
  wrapper.dataset.rows = String(rows.length);
  wrapper.dataset.levels = String(nLevels);
  wrapper.dataset.extentMin = String(posExtent[0]);
  wrapper.dataset.extentMax = String(posExtent[1]);

  return wrapper;
}
