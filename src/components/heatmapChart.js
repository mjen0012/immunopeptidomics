/*****************************************************************
 *  heatmapChart()  →  HTMLElement      ·  v4  (grey gaps, no key)
 *****************************************************************/
import * as d3 from "npm:d3@7";

export function heatmapChart({
  data,
  posExtent,
  cellHeight = 20,
  sizeFactor = 1.2,
  margin     = { top:16, right:20, bottom:60, left:90 }
} = {}) {

  /* guard */
  if (!data?.length) {
    const span = document.createElement("span");
    span.textContent = "No heat‑map data.";
    span.style.fontStyle = "italic";
    return span;
  }

  /* domains */
  const alleles = [...new Set(data.map(d => d.allele))].sort();
  const [posMin, posMax] = posExtent ?? [
    d3.min(data, d => d.pos),
    d3.max(data, d => d.pos)
  ];

  /* colour scale for non‑gap cells */
  const BLUE_MAX = 2, RED_MIN = 50;
  const colourScale = p => {
    p = +p;
    if (p <= BLUE_MAX) return d3.interpolateBlues(1 - p / BLUE_MAX);
    if (p <= RED_MIN)  return d3.interpolateReds((p - BLUE_MAX) / (RED_MIN - BLUE_MAX));
    return d3.interpolateReds(1);
  };

  /* y‑band */
  const y = d3.scaleBand()
    .domain(alleles)
    .range([margin.top, margin.top + cellHeight * alleles.length])
    .paddingInner(0.05);

  /* scaffold */
  const height0 = y.range()[1] + margin.bottom;
  const svg = d3.create("svg")
    .attr("viewBox", `0 0 1 ${height0}`)
    .attr("font-family", "sans-serif")
    .attr("font-size", 10 * sizeFactor)
    .style("width", "100%");

  const cellG  = svg.append("g"),
        xAxisG = svg.append("g"),
        yAxisG = svg.append("g").attr("transform", `translate(${margin.left-4},0)`);

  /* tooltip */
  const tip = d3.select(document.body).append("div")
    .style("position","absolute").style("pointer-events","none")
    .style("background","#fff").style("border","1px solid #ccc")
    .style("border-radius","4px").style("padding","6px")
    .style("font","12px sans-serif").style("opacity",0);

  /* ─ layout ------------------------------------------------------ */
  let xBase, viewW;
  function layout(wPx){
    viewW = wPx;
    svg.attr("viewBox", `0 0 ${wPx} ${height0}`);

    xBase = d3.scaleLinear(
      [posMin-.5, posMax+.5],
      [margin.left, wPx - margin.right]
    );

    /* update rects */
    const rects = cellG.selectAll("rect")
      .data(data, d => `${d.allele}|${d.pos}`);

    rects.exit().remove();

    rects.enter().append("rect").attr("stroke","none")
      .merge(rects)
        .attr("y", d => y(d.allele))
        .attr("height", y.bandwidth())
        /* ★ 1. gap ⇒ grey ------------------------------------------------ */
        .attr("fill", d => d.aa === "-" ? "#bdbdbd" : colourScale(d.pct))
        .attr("x", d => xBase(d.pos-.5))
        .attr("width", d => Math.max(1, xBase(d.pos+.5)-xBase(d.pos-.5)))
        .on("mouseover",(e,d)=>{ tip.html(`
             <strong>Allele:</strong> ${d.allele}<br/>
             <strong>Position:</strong> ${d.pos}<br/>
             <strong>${d.aa==="-"?"Gap":"Percentile"}:</strong> ${
               d.aa==="-"?"–":(+d.pct).toFixed(2)+" %"
             }<br/>
             <strong>Amino&nbsp;acid:</strong> ${d.aa}<br/>
             <strong>Peptide:</strong> ${d.peptide}`)
           .style("left",`${e.pageX+10}px`).style("top",`${e.pageY+10}px`)
           .style("opacity",1); })
        .on("mousemove",e=>tip.style("left",`${e.pageX+10}px`)
                               .style("top",`${e.pageY+10}px`))
        .on("mouseout", ()=>tip.style("opacity",0));

    /* axes */
    xAxisG.attr("transform",`translate(0,${y.range()[1]})`)
      .call(d3.axisBottom(xBase).tickFormat(d3.format("d"))
              .ticks(Math.min(15,wPx/60))).call(axisStyling);
    yAxisG.call(d3.axisLeft(y).tickSize(0)).call(axisStyling);
  }

  /* zoom */
  const zoom = d3.zoom()
    .scaleExtent([1,(posMax-posMin)/10])
    .on("zoom", ev =>{
      const zx = ev.transform.rescaleX(xBase);
      cellG.selectAll("rect")
        .attr("x", d => zx(d.pos-.5))
        .attr("width", d => Math.max(1, zx(d.pos+.5)-zx(d.pos-.5)));
      xAxisG.call(d3.axisBottom(zx).tickFormat(d3.format("d"))
                    .ticks(Math.min(15,viewW/60))).call(axisStyling);
    });
  svg.call(zoom).on("dblclick.zoom",null);

  /* axis style */
  function axisStyling(g){
    g.selectAll("path,line").attr("stroke","#424242").attr("stroke-width",1.5);
    g.selectAll("text").attr("fill","#424242")
      .attr("font-family","'Roboto Mono', sans-serif")
      .attr("font-size",9*sizeFactor);
  }

  /* ★ 2. legend removed entirely --------------------------------- */

  /* mount */
  const wrapper = document.createElement("div");
  wrapper.style.width="100%";
  wrapper.appendChild(svg.node());
  new ResizeObserver(e=>layout(e[0].contentRect.width)).observe(wrapper);
  return wrapper;
}
