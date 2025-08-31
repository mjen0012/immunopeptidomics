/*****************************************************************
 *  Minimal peptide track viewer (no attributes/alleles)
 *  Follows external zoom via __setZoom(transform)
 *  Calls onReady(xScaleBase) once laid out so host can sync.
 *****************************************************************/
import * as d3 from "npm:d3";

export function peptideChartScan({
  data        = [],               // [{ start: 1-based, length, peptide }]
  posExtent   = [1, 100],         // [min,max]
  rowHeight   = 18,
  gap         = 2,
  sizeFactor  = 1.1,
  margin      = { top: 18, right: 20, bottom: 24, left: 40 },
  barColor    = "#006DAE",
  // gutters should MATCH the heatmap x-range margins
  gutterLeft  = 90,
  gutterRight = 20,
  onReady     = () => {}
} = {}) {
  // pack into non-overlapping levels (greedy)
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

  const height = margin.top + nLevels * rowHeight + margin.bottom;

  const svg = d3.create("svg")
    .style("width", "100%")
    .attr("viewBox", `0 0 1 ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("font-family", "sans-serif")
    .attr("font-size", 10 * sizeFactor);

  const g = svg.append("g");
  const axisY = height - margin.bottom;
  const axisG = g.append("g").attr("class", "x-axis").attr("transform", `translate(0,${axisY})`);

  const barsG = g.append("g");

  // tooltip (lightweight)
  const tip = d3.select(document.body).append("div")
    .style("position","absolute").style("pointer-events","none")
    .style("background","#fff").style("border","1px solid #ccc")
    .style("border-radius","4px").style("padding","6px")
    .style("font","12px sans-serif").style("opacity",0);

  // scales
  const xBase = d3.scaleLinear().domain([+posExtent[0] || 1, +posExtent[1] || 1]);
  let xCurr = xBase;          // current (transformed) scale we draw with
  let viewW = 1;
  let lastTransform = null;   // saved zoom transform pushed in by host

  // (re)draw bars + axis using xCurr
  function draw() {
    const sel = barsG.selectAll("rect").data(rows, (d,i) => `${d.start}|${d.length}|${i}`);

    sel.enter().append("rect")
      .attr("y", d => margin.top + (nLevels - 1 - d.level) * rowHeight + gap / 2)
      .attr("height", rowHeight - gap)
      .attr("fill", barColor)
      .attr("stroke", "#444")
      .attr("stroke-width", 0.5 * sizeFactor)
      .on("mouseover",(e,d)=>{
        const start = d.start;
        const end   = d.start + d.length - 1;
        tip.html(`
          <strong>Peptide:</strong> ${d.peptide || "(custom)"}<br/>
          <strong>Start–End:</strong> ${start}–${end}<br/>
          <strong>Length:</strong> ${d.length}
        `)
        .style("left",`${e.pageX+10}px`).style("top",`${e.pageY+10}px`).style("opacity",1);
      })
      .on("mousemove",(e)=> tip.style("left",`${e.pageX+10}px`).style("top",`${e.pageY+10}px`))
      .on("mouseout",()=> tip.style("opacity",0));

    // update (enter+update)
    barsG.selectAll("rect")
      .attr("x", d => xCurr(d.start - 0.5) + gap / 2)
      .attr("width", d => Math.max(0, xCurr(d.start + d.length - 0.5) - xCurr(d.start - 0.5) - gap));

    axisG.call(d3.axisBottom(xCurr)
      .tickFormat(d3.format("d"))
      .ticks(Math.min(15, viewW / 60)));
    axisG.selectAll("path,line").attr("stroke","#424242").attr("stroke-width",1.5);
    axisG.selectAll("text").attr("fill","#424242");
  }

  // layout on resize: set range, apply last transform if any, then draw
  function layout(wPx) {
    viewW = Math.max(1, wPx|0);
    svg.attr("viewBox", `0 0 ${viewW} ${height}`);
    xBase.range([gutterLeft, viewW - gutterRight]);
    xCurr = lastTransform ? lastTransform.rescaleX(xBase) : xBase;
    draw();
    onReady(xBase); // host can push existing transform if needed
  }

  // public: update domain (keeps current zoom transform)
  function updatePosExtent(newExtent = posExtent) {
    xBase.domain([+newExtent[0] || 1, +newExtent[1] || 1]);
    xCurr = lastTransform ? lastTransform.rescaleX(xBase) : xBase;
    draw();
  }

  // public: follow an external zoom transform (from heatmap)
  function setZoom(transform) {
    lastTransform = transform || null;
    xCurr = lastTransform ? lastTransform.rescaleX(xBase) : xBase;
    draw();
  }

  // wrapper + resize observer (same pattern as heatmap)
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.appendChild(svg.node());
  new ResizeObserver(e => layout(e[0].contentRect.width)).observe(wrapper);

  // tiny API + metadata
  wrapper.__updatePosExtent = updatePosExtent;
  wrapper.__setZoom = setZoom;
  wrapper.dataset.rows = String(rows.length);
  wrapper.dataset.levels = String(nLevels);
  wrapper.dataset.extentMin = String(posExtent[0]);
  wrapper.dataset.extentMax = String(posExtent[1]);

  return wrapper;
}
