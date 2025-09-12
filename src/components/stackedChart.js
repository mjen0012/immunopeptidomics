/*****************************************************************
 *  Stacked amino-acid bar chart
 *  --------------------------------------------------------------
 *  Required options
 *    data        : [{position, aminoacid, y0, y1}]  (pre-stacked bars)
 *    xScale      : shared linear scale (rescaled by zoom)
 *
 *  Optional
 *    tooltipRows : full rows for each position
 *                  [{position, aminoacid, value, frequency_all, total_all}]
 *                  If omitted, the tooltip will list only residues present
 *                  in the stacked bars (i.e. without the consensus AA).
 *
 *  Returns { update(scale), height }
 *****************************************************************/
import * as d3 from "npm:d3";
import {colourAA} from "/components/palettes.js";

let _id = 0;                       // uid for clipPaths

export function stackedChart(
  slotG,
  {
    data,
    xScale,
    tooltipRows = null,
    sizeFactor  = 1.2,
    margin      = {top:12, right:20, bottom:30, left:40},
    height      = 90 * sizeFactor,
  } = {}
){
  if (!data?.length){
    slotG.append("text")
         .attr("x", margin.left)
         .attr("y", margin.top)
         .attr("font-style","italic")
         .text("No frequency data");
    return {update: () => {}, height};
  }

  /* ——— y-scale ———————————————————————————————————————— */
  const maxY = d3.max(data, d => d.y1);
  const y    = d3.scaleLinear([0,maxY],
              [height - margin.bottom, margin.top]);

  /* ——— clip-path ——————————————————————————————————————— */
  const clipId = `clip-stack-${++_id}`;
  const [x0,x1] = xScale.range();
  slotG.append("defs")
       .append("clipPath")
        .attr("id", clipId)
        .attr("clipPathUnits", "userSpaceOnUse")
       .append("rect")
         .attr("x", x0)
         .attr("y", margin.top)
         .attr("width",  x1 - x0)
         .attr("height", height - margin.top - margin.bottom);

  /* ——— axis (integer ticks) —————————————— */
  const tickLen  = Math.min(6 * sizeFactor, 8);
  const fontSize = Math.min(12 * sizeFactor, 14);
  const strokeW  = Math.min(1.2 * sizeFactor, 2);
  const ax = d3.axisBottom(xScale)
    .tickFormat(d3.format("d"))
    .tickSizeOuter(0)
    .tickSize(tickLen);
  const axisG = slotG.append("g")
    .attr("class","x-axis")
    .attr("font-size",fontSize)
    .attr("transform",`translate(0,${height - margin.bottom})`)
    .call(ax);
  axisG.selectAll("path, line").attr("stroke-width", strokeW);

  // unified axis styling (match peptideScanChart)
  function axisStyling(sel){
    sel.selectAll("path,line").attr("stroke", "#94a3b8").attr("stroke-width", 1);
    sel.selectAll("text")
      .attr("fill", "#334155")
      .attr("font-family", "'Roboto', sans-serif")
      .attr("font-size", 11);
  }
  { // apply unified ticks and styling once initially
    const rng = xScale.range();
    const w   = Math.max(1, (rng[1] - rng[0]) | 0);
    const axU = d3.axisBottom(xScale)
      .tickFormat(d3.format("d"))
      .ticks(Math.min(15, w / 60))
      .tickSizeOuter(0);
    axisG.call(axU);
    axisG.call(axisStyling);
  }

  /* ——— bars (no horizontal gap) ——————————— */
  const bars = slotG.append("g")
    .attr("clip-path",`url(#${clipId})`)
    .selectAll("rect").data(data).enter().append("rect")
      .attr("fill", d => colourAA(d.aminoacid))
      .attr("y",    d => y(d.y1))
      .attr("height",d => y(d.y0)-y(d.y1));

  positionBars(xScale);           // first draw

  const maxPos = d3.max(data, d => d.position);
  function positionBars(scale){
    bars
      .attr("x", d => scale(d.position - 0.5))
      .attr("width", d => Math.max(0,
        scale(d.position + 0.5) - scale(d.position - 0.5)));
  }

  /* ——— tooltip data prep ——————————————— */
  let tooltipMap;
  if (tooltipRows){
    tooltipMap = d3.rollup(
      tooltipRows,
      rows => rows
        .slice()                         // copy
        .sort((a,b)=>d3.descending(a.value,b.value)),
      d => d.position
    );
  } else {
    // derive from bars only (no consensus AA)
    tooltipMap = d3.rollup(
      data,
      rows => rows
        .map(r => ({ aminoacid:r.aminoacid, value:r.y1-r.y0 }))
        .sort((a,b)=>d3.descending(a.value,b.value)),
      d => d.position
    );
  }

  /* ——— tooltip overlay ——————————————— */
  const tooltip = d3.select(document.body)
    .append("div")
      .style("position","absolute")
      .style("pointer-events","none")
      .style("background","#fff")
      .style("border","1px solid #ccc")
      .style("border-radius","4px")
      .style("padding","6px")
      .style("font","12px sans-serif")
      .style("opacity",0);

  const hover = slotG.append("g").attr("class","hover-rects")
    .selectAll("rect")
    .data(d3.group(data, d=>d.position).keys())
    .enter().append("rect")
      .attr("fill","none")
      .attr("y", margin.top)
      .attr("height", height - margin.top - margin.bottom)
      .attr("pointer-events","all")
      .on("mousemove",(e,pos)=>{
          const rows = tooltipMap.get(pos)||[];
          const first = rows[0]||{};
          const pctFmt = v => (v*100).toFixed(1)+"%";
          const lines = rows.map((r,i)=>
              `${i+1}. ${r.aminoacid} – ${pctFmt(r.value)}`
            ).join("<br/>");
          tooltip.html(`<strong>Position:</strong> ${pos}<br/>${lines}`)
                 .style("left", `${e.pageX + 10}px`)
                 .style("top",  `${e.pageY + 10}px`)
                 .style("opacity",1);
      })
      .on("mouseout", ()=>tooltip.style("opacity",0));

  positionHover(xScale);          // first layout

  function positionHover(scale){
    hover
      .attr("x", pos => scale(pos - 0.5))
      .attr("width", pos => Math.max(0,
         scale(pos + 0.5) - scale(pos - 0.5)));
  }

  /* ——— public update hook ————————————— */
  function update(scale){
    positionBars(scale);
    positionHover(scale);
    const rng = scale.range();
    const w   = Math.max(1, (rng[1] - rng[0]) | 0);
    const ax2 = d3.axisBottom(scale)
      .tickFormat(d3.format("d"))
      .ticks(Math.min(15, w / 60))
      .tickSizeOuter(0);
    axisG.call(ax2);
    axisG.call(axisStyling);
  }

  return {update, height};
}
