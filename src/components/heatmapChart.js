// components/heatmapChart.js  (minor visible hooks only; logic unchanged)
/*****************************************************************
 *  heatmapChart()  →  HTMLElement  · v6+hooks
 *  - Clip-safe rows (no spill into y-axis)
 *  - Bounded pan/zoom
 *  - Row click toggles an allele; emits onRowToggle(allele|null)
 *  - Sync hooks:
 *      onReady(xScaleBase)
 *      onZoom(xScaleCurrent, transform)
 *      element.__setZoom(transform)
 *****************************************************************/
import * as d3 from "npm:d3@7";

export function heatmapChart({
  data,
  posExtent,
  cellHeight = 20,
  sizeFactor = 1.2,
  margin     = { top:16, right:20, bottom:60, left:90 }, // left kept for vertical spacing only
  gutterLeft = 110,
  gutterRight= 12,
  onReady    = () => {},
  onZoom     = () => {},
  onRowToggle= () => {}
} = {}) {
  if (!data?.length) {
    const span = document.createElement("span");
    span.textContent = "No heat-map data.";
    span.style.fontStyle = "italic";
    return span;
  }

  const alleles = [...new Set(data.map(d => d.allele))].sort(d3.ascending);
  const [posMin, posMax] = posExtent ?? [
    d3.min(data, d => d.pos),
    d3.max(data, d => d.pos)
  ];

  const BLUE_MAX = 2, RED_MIN = 50;
  const colourScale = p => {
    p = +p;
    if (p <= BLUE_MAX) return d3.interpolateBlues(1 - p / BLUE_MAX);
    if (p <= RED_MIN)  return d3.interpolateReds((p - BLUE_MAX) / (RED_MIN - BLUE_MAX));
    return d3.interpolateReds(1);
  };

  const y = d3.scaleBand()
    .domain(alleles)
    .range([margin.top, margin.top + cellHeight * alleles.length])
    .paddingInner(0.05);

  const height0 = y.range()[1] + margin.bottom;
  const svg = d3.create("svg")
    .attr("viewBox", `0 0 1 ${height0}`)
    .attr("font-family", "sans-serif")
    .attr("font-size", 10 * sizeFactor)
    .style("width", "100%")
    .style("touch-action", "none");

  const clipId = `clip-${Math.random().toString(36).slice(2)}`;
  const defs   = svg.append("defs");
  const clip   = defs.append("clipPath").attr("id", clipId).append("rect");

  const cellG  = svg.append("g").attr("clip-path", `url(#${clipId})`);
  const xAxisG = svg.append("g");
  const yAxisG = svg.append("g").attr("transform", `translate(${gutterLeft - 4},0)`);

  const tip = d3.select(document.body).append("div")
    .style("position","absolute").style("pointer-events","none")
    .style("background","#fff").style("border","1px solid #ccc")
    .style("border-radius","4px").style("padding","6px")
    .style("font","12px sans-serif").style("opacity",0);

  function axisStyling(g){
    g.selectAll("path,line").attr("stroke","#424242").attr("stroke-width",1.5);
    g.selectAll("text").attr("fill","#424242")
      .attr("font-family","'Roboto Mono', sans-serif")
      .attr("font-size",9*sizeFactor);
  }

  let xBase, viewW;
  let suppressSync = false;
  let lastTransform = d3.zoomIdentity;
  let selectedAllele = null;

  function renderRowHighlight() {
    yAxisG.selectAll(".tick text")
      .attr("font-weight", d => d === selectedAllele ? 700 : 400)
      .attr("fill", d => d === selectedAllele ? "#111" : "#424242");
  }

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
      cellG.selectAll("rect")
        .attr("x", d => zx(d.pos - 0.5))
        .attr("width", d => Math.max(1, zx(d.pos + 0.5) - zx(d.pos - 0.5)));
      xAxisG.call(d3.axisBottom(zx).tickFormat(d3.format("d")).ticks(Math.min(15, viewW / 60))).call(axisStyling);

      lastTransform = t;

      if (!suppressSync) onZoom(zx, t);
    });

  function toggleAllele(a) {
    selectedAllele = (selectedAllele === a ? null : a);
    renderRowHighlight();
    onRowToggle(selectedAllele);
  }

  function layout(wPx){
    viewW = wPx;
    svg.attr("viewBox", `0 0 ${wPx} ${height0}`);

    xBase = d3.scaleLinear([posMin - .5, posMax + .5], [gutterLeft, wPx - gutterRight]);

    clip
      .attr("x", gutterLeft)
      .attr("y", margin.top)
      .attr("width",  Math.max(1, wPx - gutterLeft - gutterRight))
      .attr("height", y.range()[1] - margin.top);

    const rects = cellG.selectAll("rect").data(data, d => `${d.allele}|${d.pos}`);
    rects.exit().remove();
    rects.enter().append("rect").attr("stroke","none")
      .merge(rects)
        .attr("y", d => y(d.allele))
        .attr("height", y.bandwidth())
        .attr("fill", d => d.aa === "-" ? "#bdbdbd" : colourScale(d.pct))
        .attr("x", d => xBase(d.pos - .5))
        .attr("width", d => Math.max(1, xBase(d.pos + .5) - xBase(d.pos - .5)))
        .on("click", (_, d) => toggleAllele(d.allele))
        .on("mouseover",(e,d)=>{ tip.html(`
             <strong>Allele:</strong> ${d.allele}<br/>
             <strong>Position:</strong> ${d.pos}<br/>
             <strong>${d.aa==="-"?"Gap":"Percentile"}:</strong> ${d.aa==="-"?"–":(+d.pct).toFixed(2)+" %"}<br/>
             <strong>Amino acid:</strong> ${d.aa}<br/>
             <strong>Peptide:</strong> ${d.peptide}`)
           .style("left",`${e.pageX+10}px`).style("top",`${e.pageY+10}px`).style("opacity",1); })
        .on("mousemove",e=>tip.style("left",`${e.pageX+10}px`).style("top",`${e.pageY+10}px`))
        .on("mouseout", ()=>tip.style("opacity",0));

    xAxisG.attr("transform",`translate(0,${y.range()[1]})`)
      .call(d3.axisBottom(xBase).tickFormat(d3.format("d")).ticks(Math.min(15,wPx/60))).call(axisStyling);
    yAxisG.call(d3.axisLeft(y).tickSize(0)).call(axisStyling);

    yAxisG.selectAll(".tick").on("click", (_, a) => toggleAllele(a));
    renderRowHighlight();

    zoom
      .extent([[gutterLeft, 0], [wPx - gutterRight, height0]])
      .translateExtent([[gutterLeft, 0], [wPx - gutterRight, height0]]);
    svg.call(zoom).on("dblclick.zoom", null);

    onReady(xBase);
  }

  const wrapper = document.createElement("div");
  wrapper.style.width="100%";
  wrapper.appendChild(svg.node());
  new ResizeObserver(e=>layout(e[0].contentRect.width)).observe(wrapper);

  // visible hooks
  wrapper.dataset.rows    = String(data.length);
  wrapper.dataset.alleles = String(alleles.length);
  wrapper.dataset.posMin  = String(posMin);
  wrapper.dataset.posMax  = String(posMax);

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

  return wrapper;
}
