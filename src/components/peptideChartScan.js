/*****************************************************************
 *  Minimal peptide track viewer (no attributes/alleles)
 *  API mirrors heatmapChart style: returns an <svg> element.
 *****************************************************************/
import * as d3 from "npm:d3";

export function peptideChartScan({
  data        = [],               // [{ start: 1-based, length, peptide }]
  posExtent   = [1, 100],         // [min,max] genomic/protein coords
  rowHeight   = 18,
  gap         = 2,
  sizeFactor  = 1.1,
  margin      = { top: 18, right: 20, bottom: 24, left: 40 },
  barColor    = "#006DAE"
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

  // SVG scaffolding with responsive viewBox
  const width   = 900; // logical width; scales with CSS width:100%
  const height  = margin.top + nLevels * rowHeight + margin.bottom;

  const svg = d3.create("svg")
    .attr("width", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svg.append("g");

  // Scales + axis
  const x = d3.scaleLinear()
    .domain([+posExtent[0] || 1, +posExtent[1] || 1])
    .range([margin.left, width - margin.right]);

  const axisY = height - margin.bottom;
  const axisG = g.append("g")
    .attr("class", "x-axis")
    .attr("font-size", 10 * sizeFactor)
    .attr("transform", `translate(0,${axisY})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  // Bars
  const barsG = g.append("g");
  barsG.selectAll("rect")
    .data(rows)
    .enter().append("rect")
      .attr("x", d => x(d.start - 0.5) + gap / 2)
      .attr("width", d => {
        const w = x(d.start + d.length - 0.5) - x(d.start - 0.5) - gap;
        return Math.max(0, w);
      })
      .attr("y", d => margin.top + (nLevels - 1 - d.level) * rowHeight + gap / 2)
      .attr("height", rowHeight - gap)
      .attr("fill", barColor)
      .attr("stroke", "#444")
      .attr("stroke-width", 0.5 * sizeFactor);

  // Public updater (if caller wants to resync scale)
  function updatePosExtent(newExtent = posExtent) {
    x.domain([+newExtent[0] || 1, +newExtent[1] || 1]);
    barsG.selectAll("rect")
      .attr("x", d => x(d.start - 0.5) + gap / 2)
      .attr("width", d => Math.max(0, x(d.start + d.length - 0.5) - x(d.start - 0.5) - gap));
    axisG.call(d3.axisBottom(x).tickFormat(d3.format("d")));
  }

  // A tiny API for the host code (optional)
  svg.node().__updatePosExtent = updatePosExtent;
  svg.node().dataset.rows = String(rows.length);
  svg.node().dataset.levels = String(nLevels);
  svg.node().dataset.extentMin = String(posExtent[0]);
  svg.node().dataset.extentMax = String(posExtent[1]);

  return svg.node();
}
