/*****************************************************************
 *  sequenceCompareChart()  ·  v5
 *  --------------------------------------------------------------
 *  Args
 *    refRows   – [{position, aminoacid}]   // reference (aligned_sequence)
 *    consRows  – [{position, aminoacid}]   // consensus AA
 *    xScale    – shared scale (updated by zoom)
 *    colourMode– "Mismatches" | "Properties"   ← NEW
 *
 *  Visual
 *    • cell colours switch on colourMode
 *    • mismatch red  = #ff7575
 *    • gap cells (-/-) = #D9D9D9
 *    • bold 16 px monospace letters
 *    • bold bridge symbols (“|” or “—”)
 *****************************************************************/
import * as d3 from "npm:d3";
import { aminoacidPalette } from "/components/palettes.js";

let _uid = 0;

export function sequenceCompareChart(
  slotG,
  {
    refRows,
    consRows,
    xScale,
    colourMode = "Mismatches",            // ← NEW
    cell       = 24,
    gapRows    = 28,                      // a bit more vertical space
    sizeFactor = 1.0,
    margin     = {top:12, right:20, bottom:30, left:40}
  } = {}
){
  /* ── early-out guard ───────────────────────────────────────── */
  if (!refRows?.length || !consRows?.length){
    slotG.append("text")
         .attr("x", margin.left)
         .attr("y", margin.top)
         .attr("font-style","italic")
         .text("No reference / consensus data");
    return {update:()=>{}, height:margin.top+margin.bottom+cell*2+gapRows};
  }

  /* ── look-up helpers ───────────────────────────────────────── */
  const refMap  = new Map(refRows .map(r => [r.position, r.aminoacid]));
  const consMap = new Map(consRows.map(r => [r.position, r.aminoacid]));
  const isMatch = p => refMap.get(p) === consMap.get(p);

  /* ── layout dims ───────────────────────────────────────────── */
  const rows = [refRows, consRows];
  const height = margin.top + cell*2 + gapRows + margin.bottom;
  const rowY   = i => margin.top + i*(cell+gapRows);

  /* ── clip-path (to x-axis range) ───────────────────────────── */
  const [x0,x1] = xScale.range();
  const clipId  = `clip-seqcmp-${++_uid}`;
  slotG.append("defs").append("clipPath")
      .attr("id", clipId)
    .append("rect")
      .attr("x", x0)
      .attr("y", margin.top)
      .attr("width",  x1 - x0)
      .attr("height", cell*2 + gapRows);

  const g = slotG.append("g")
    .attr("clip-path", `url(#${clipId})`);

  /* ── colour helper ─────────────────────────────────────────── */
  const aaColours = aminoacidPalette;
  const fillColour = (aa, pos) => {
    if (colourMode === "Properties")
      return aaColours[aa] ?? "#f9f9f9";

    /* mismatch / match scheme */
    if (aa === "-" && refMap.get(pos) === "-" && consMap.get(pos) === "-")
      return "#D9D9D9";
    return isMatch(pos) ? "#55a0fb" : "#ff7575";
  };

  /* ── draw the two rows ─────────────────────────────────────── */
  rows.forEach((arr, idx) => {
    const rowG = g.append("g")
      .attr("transform",`translate(0,${rowY(idx)})`);

    /* cells */
    rowG.selectAll("rect")
      .data(arr)
      .enter().append("rect")
        .attr("y", 0)
        .attr("height", cell)
        .attr("rx", 6).attr("ry", 6)
        .attr("stroke", "#fff")
        .attr("fill", d => fillColour(d.aminoacid, d.position));

    /* letters (bold, monospace) */
    rowG.selectAll("text")
      .data(arr)
      .enter().append("text")
        .attr("y", cell/2)
        .attr("dy","0.35em")
        .attr("font-family","'Roboto Mono', monospace")
        .attr("font-weight","bold")
        .attr("fill","#333")
        .attr("text-anchor","middle")
        .text(d => d.aminoacid)
        .attr("class","aa-label");
  });

  /* ── bridge symbols between rows ───────────────────────────── */
  const midY = margin.top + cell + gapRows/2;
  const bridgeG = g.append("g")
    .attr("transform",`translate(0,${midY})`);

  bridgeG.selectAll("text")
    .data(refRows)
    .enter().append("text")
      .attr("dy","0.35em")
      .attr("font-family","'Roboto Mono', monospace")
      .attr("font-weight",900)                    // extra bold
      .attr("fill","#555")
      .attr("text-anchor","middle")
      .text(d => isMatch(d.position) ? "|" : "—")
      .attr("class","bridge-label");

  /* ── layout helpers ────────────────────────────────────────── */
  function position(scale){
    rows.forEach((arr, idx) => {
      const rowSel = g.select(`g:nth-child(${idx+1})`);
      rowSel.selectAll("rect")
        .attr("x", d => scale(d.position-0.5))
        .attr("width", d => Math.max(0,
            scale(d.position+0.5) - scale(d.position-0.5)));
      rowSel.selectAll("text.aa-label")
        .attr("x", d => scale(d.position));
    });
    bridgeG.selectAll("text.bridge-label")
      .attr("x", d => scale(d.position));
  }

  /* hide letters until cells are wide enough */
  function adaptLabels(scale){
    const w = scale(2)-scale(1);
    const show = w >= 14;
    const fAA = Math.min(w*0.7, 16*sizeFactor);
    const fBr = Math.min(w*0.6, 14*sizeFactor);
    g.selectAll("text.aa-label")
      .style("display", show?null:"none")
      .attr("font-size", fAA);
    bridgeG.selectAll("text.bridge-label")
      .style("display", show?null:"none")
      .attr("font-size", fBr);
  }

  /* initial render */
  position(xScale); adaptLabels(xScale);

  /* x-axis (unified styling) */
  function axisStyling(sel){
    sel.selectAll("path,line").attr("stroke", "#94a3b8").attr("stroke-width", 1);
    sel.selectAll("text")
      .attr("fill", "#334155")
      .attr("font-family", "'Roboto', sans-serif")
      .attr("font-size", 11);
  }
  const [rx0, rx1] = xScale.range();
  const ax = d3.axisBottom(xScale)
    .tickFormat(d3.format("d"))
    .ticks(Math.min(15, (rx1 - rx0) / 60))
    .tickSizeOuter(0);
  const axisG = slotG.append("g")
    .attr("class","x-axis")
    .attr("transform",`translate(0,${margin.top+cell*2+gapRows})`)
    .call(ax);
  axisG.call(axisStyling);

  /* ── public updater for shared zoom ────────────────────────── */
  function update(s){
    position(s); adaptLabels(s);
    const rng = s.range();
    const w   = Math.max(1, (rng[1] - rng[0]) | 0);
    const ax2 = d3.axisBottom(s)
      .tickFormat(d3.format("d"))
      .ticks(Math.min(15, w / 60))
      .tickSizeOuter(0);
    axisG.call(ax2);
    axisG.call(axisStyling);
  }

  return {update, height};
}
