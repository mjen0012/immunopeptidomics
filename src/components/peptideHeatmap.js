/*****************************************************************
 *  peptideHeatmap() → HTMLElement   ·   v10  (height & width responsive)
 *****************************************************************/
import * as d3 from "npm:d3";
import { aminoacidPalette } from "/components/palettes.js";

export function peptideHeatmap({
  data,
  selected,
  topN       = 4,
  colourMode = "Mismatches",                 // "Mismatches" | "Properties"
  baseCell   = 31,                           // preferred, will shrink / grow
  height0    = 280,                          // fixed card height (px)
  margin     = { top:20, right:150, bottom:20, left:4 }
} = {}) {

  /* ── guard ───────────────────────────────────────────────── */
  if (!selected || !data?.length) {
    const span = document.createElement("span");
    span.textContent =
      "Click a peptide in the viewer to see its proportions.";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── build the row list once ─────────────────────────────── */
  const map   = new Map(data.map(d => [d.peptide, d]));
  const head  = map.get(selected) ?? {
                  peptide:selected, proportion:0, frequency:0, total:0
                };
  const rows  = [
    head,
    ...data
      .filter(d => d.peptide !== selected)
      .sort((a,b)=>d3.descending(a.proportion,b.proportion))
      .slice(0, topN)
  ];
  const nRows   = rows.length;
  const maxLen  = d3.max(rows, d => d.peptide.length);
  const aaColours = aminoacidPalette;

  /* ── wrapper div (fixed height) ──────────────────────────── */
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width : 100%;
    height: ${height0}px;
    overflow: hidden;
  `;

  /* ── layout + draw function ─────────────────────────────── */
  function draw(wrapperWidth){
    // decide the cell size from BOTH dimensions
    const fitH = Math.floor(
      (height0 - margin.top - margin.bottom) / nRows
    );
    const fitW = Math.floor(
      (wrapperWidth - margin.left - margin.right) / maxLen
    );
    const cell = Math.max(12, Math.min(baseCell, fitH, fitW));   // clamp ≥12

    /* geometry */
    const w = margin.left + maxLen*cell + margin.right;
    const h = margin.top  + nRows*cell   + margin.bottom;

    /* fresh SVG */
    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio","xMinYMin meet")
      .attr("font-family","'Roboto Mono', monospace")
      .attr("font-size", Math.round(cell*0.52));

    rows.forEach((row,i)=>{
      const y0 = margin.top + i*cell;

      /* background cells */
      svg.append("g")
        .attr("transform",`translate(${margin.left},${y0})`)
        .selectAll("rect")
        .data(d3.range(maxLen))
        .enter().append("rect")
          .attr("x", j=>j*cell+0.5)
          .attr("y", 0.5)
          .attr("width", cell-1)
          .attr("height",cell-1)
          .attr("rx",6).attr("ry",6)
          .attr("stroke","#fff")
          .attr("fill", j=>{
            const ch = row.peptide[j] ?? "";
            if (colourMode==="Properties") return aaColours[ch] ?? "#f9f9f9";
            if (i===0) return "#006DAE";
            return (j<row.peptide.length && ch!==selected[j])
                 ? "#ffcccc" : "#f9f9f9";
          });

      /* letters */
      svg.append("g")
        .attr("transform",`translate(${margin.left},${y0})`)
        .selectAll("text")
        .data(row.peptide.split(""))
        .enter().append("text")
          .attr("x", (_,j)=>j*cell+cell/2)
          .attr("y", cell/2)
          .attr("dy","0.35em")
          .attr("text-anchor","middle")
          .attr("font-weight", i===0?"bold":null)
          .attr("fill", i===0?"#fff":"#000")
          .text(c=>c);

      /* numeric label */
      const pct = (row.proportion*100).toFixed(1);
      svg.append("text")
        .attr("font-family","'Roboto', sans-serif")
        .attr("font-size", Math.round(cell*0.4))
        .attr("x", margin.left + maxLen*cell + 12)
        .attr("y", y0 + cell/2)
        .attr("dy","0.35em")
        .html(
          `<tspan font-weight="bold">${pct}%</tspan>`+
          `<tspan dx="6">(${row.frequency}/${row.total})</tspan>`
        );
    });

    /* wipe & append */
    wrapper.innerHTML = "";
    wrapper.appendChild(svg.node());
  }

  /* ── first draw + resize observer ───────────────────────── */
  const ro = new ResizeObserver(entries=>{
    for (const e of entries){
      draw(e.contentRect.width);
    }
  });
  ro.observe(wrapper);               // observe itself
  draw(wrapper.getBoundingClientRect().width); // initial

  return wrapper;
}
