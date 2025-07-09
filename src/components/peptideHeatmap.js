/*****************************************************************
 *  peptideHeatmap() → SVGElement   ·   v5
 *  --------------------------------------------------------------
 *  New in v5
 *    1. Top-row letters are white (#fff).
 *    2. In “Properties” mode, the top-row cells use the
 *       amino-acid palette (no hard-coded #006DAE).
 *****************************************************************/
import * as d3 from "npm:d3";
import { aminoacidPalette } from "/components/palettes.js";

export function peptideHeatmap({
  data,
  selected,
  topN       = 4,
  colourMode = "Mismatches",                 // "Mismatches" | "Properties"
  cell       = 31,
  margin     = { top: 20, right: 150, bottom: 20, left: 4 }
} = {}) {

  /* ── guard: nothing to show ─────────────────────────────────── */
  if (!selected || !data?.length) {
    const span = document.createElement("span");
    span.textContent =
      "Click a peptide in the viewer to see its proportions.";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── assemble rows ──────────────────────────────────────────── */
  const rowMap   = new Map(data.map(d => [d.peptide, d]));
  const selRow   = rowMap.get(selected) ?? {
                     peptide: selected, proportion: 0, frequency: 0, total: 0
                   };

  const others = data
    .filter(d => d.peptide !== selected)
    .sort((a, b) => d3.descending(a.proportion, b.proportion))
    .slice(0, topN);

  const rows = [selRow, ...others];

  /* ── layout constants ───────────────────────────────────────── */
  const maxLen = d3.max(rows, d => d.peptide.length);
  const width  = margin.left + maxLen * cell + margin.right;
  const height = margin.top  + rows.length * cell + margin.bottom;

  const svg = d3.create("svg")
    .attr("width",  width)
    .attr("height", height)
    .attr("font-family", "'Roboto Mono', monospace")
    .attr("font-size", 16);

  const aaColours = aminoacidPalette;

  /* ── draw every row ─────────────────────────────────────────── */
  rows.forEach((row, i) => {
    const y0 = margin.top + i * cell;

    /* background squares --------------------------------------- */
    svg.append("g")
      .attr("transform", `translate(${margin.left},${y0})`)
      .selectAll("rect")
      .data(d3.range(maxLen))
      .enter().append("rect")
        .attr("x", j => j * cell + 0.5)
        .attr("y", 0.5)
        .attr("width",  cell - 1)
        .attr("height", cell - 1)
        .attr("rx", 6)
        .attr("ry", 6)
        .attr("stroke", "#fff")
        .attr("fill", j => {
          const ch = row.peptide[j] ?? "";

          if (colourMode === "Properties") {
            /* Properties mode – whole table coloured by AA */
            return aaColours[ch] ?? "#f9f9f9";
          }

          /* Mismatches mode */
          if (i === 0) return "#006DAE";                 // top row = blue
          return (j < row.peptide.length && ch !== selected[j])
               ? "#ffcccc"                               // mismatch cell
               : "#f9f9f9";                              // default cell
        });

    /* letters --------------------------------------------------- */
    svg.append("g")
      .attr("transform", `translate(${margin.left},${y0})`)
      .selectAll("text")
      .data(row.peptide.split(""))
      .enter().append("text")
        .attr("x", (_, j) => j * cell + cell / 2)
        .attr("y", cell / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .attr("font-weight", i === 0 ? "bold" : null)
        .attr("fill", i === 0 ? "#fff" : "#000")         // ① top row → white
        .text(c => c);

    /* right-hand numeric label --------------------------------- */
    const pct = (row.proportion * 100).toFixed(1);
    svg.append("text")
      .attr("font-family", "'Roboto', sans-serif")
      .attr("font-size", 12)
      .attr("x", margin.left + maxLen * cell + 12)       // extra gap
      .attr("y", y0 + cell / 2)
      .attr("dy", "0.35em")
      .html(`
        <tspan font-weight="bold">${pct}%</tspan>
        <tspan dx="6">(${row.frequency}/${row.total})</tspan>
      `);
  });

  return svg.node();
}
