/*****************************************************************
 *  peptideHeatmap() → HTMLElement   ·   v11
 *  - Responsive peptide heatmap with optional Class I allele overlay
 *  - Integrates chartRowsI-style percentile data (EL/BA)
 *****************************************************************/
import * as d3 from "npm:d3";
import { aminoacidPalette } from "/components/palettes.js";

export function peptideHeatmap({
  data,
  selected,
  topN       = 4,
  colourMode = "Mismatches",
  baseCell   = 31,
  height0    = 280,
  margin     = { top:20, right:150, bottom:20, left:4 },

  alleleData = [],     // chartRowsI-style rows
  alleles    = [],     // currently selected alleles
  mode       = "EL",   // EL | BA
  showAlleles = true
} = {}) {
  if (!selected || !data?.length) {
    const span = document.createElement("span");
    span.textContent = "Click a peptide in the viewer to see its proportions.";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── peptide rows ───────────────────────────────────────────── */
  const map  = new Map(data.map(d => [d.peptide, d]));
  const head = map.get(selected) ?? { peptide:selected, proportion:0, frequency:0, total:0 };
  const rows = [
    head,
    ...data.filter(d => d.peptide !== selected)
           .sort((a,b)=>d3.descending(a.proportion,b.proportion))
           .slice(0, topN)
  ];

  const nRows  = rows.length;
  const maxLen = d3.max(rows, d => d.peptide.length);
  const aaColours = aminoacidPalette;

  /* ── allele value lookup ─────────────────────────────────────── */
  const norm = s => String(s || "").trim();
  const scoreKey = mode === "BA" ? "netmhcpan_ba_percentile" : "netmhcpan_el_percentile";
  const lookup = new Map();
  for (const r of alleleData) {
    const pep = norm(r.peptide);
    const al  = norm(r.allele);
    if (pep && al && typeof r[scoreKey] === "number") {
      lookup.set(`${al}|${pep}`, +r[scoreKey]);
    }
  }
  const colour = d3.scaleLinear().domain([0, 50, 100]).range(["#0074D9", "#ffffff", "#e60000"]);

  /* ── wrapper div (fixed height) ─────────────────────────────── */
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `width: 100%; height: ${height0}px; overflow: hidden;`;

  function draw(wrapperWidth){
    const fitH = Math.floor((height0 - margin.top - margin.bottom) / nRows);
    const fitW = Math.floor((wrapperWidth - margin.left - margin.right) / (maxLen + (showAlleles ? alleles.length + 1 : 0)));
    const cell = Math.max(12, Math.min(baseCell, fitH, fitW));

    const w = margin.left + maxLen*cell + (showAlleles ? (alleles.length + 1)*cell : 0) + margin.right;
    const h = margin.top  + nRows*cell + margin.bottom;

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio","xMinYMin meet")
      .attr("font-family","'Roboto Mono', monospace")
      .attr("font-size", Math.round(cell*0.52));

    rows.forEach((row,i)=>{
      const y0 = margin.top + i*cell;

      // ▸ background cells (AA)
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
            if (colourMode === "Properties") return aaColours[ch] ?? "#f9f9f9";
            if (i === 0) return "#006DAE";
            return (j<row.peptide.length && ch!==selected[j]) ? "#ffcccc" : "#f9f9f9";
          });

      // ▸ letters (AA)
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

      // ▸ proportion label
      const pct = (row.proportion*100).toFixed(1);
      svg.append("text")
        .attr("font-family","'Roboto', sans-serif")
        .attr("font-size", Math.round(cell*0.4))
        .attr("x", margin.left + maxLen*cell + 8)
        .attr("y", y0 + cell/2)
        .attr("dy","0.35em")
        .html(`<tspan font-weight="bold">${pct}%</tspan><tspan dx="6">(${row.frequency}/${row.total})</tspan>`);

      // ▸ HLA overlay cells
      if (showAlleles && alleles.length) {
        svg.append("g")
          .attr("transform", `translate(${margin.left + maxLen*cell + cell},${y0})`)
          .selectAll("rect")
          .data(alleles)
          .enter().append("rect")
            .attr("x", (d,j)=>j*cell + 0.5)
            .attr("y", 0.5)
            .attr("width", cell - 1)
            .attr("height", cell - 1)
            .attr("rx",4).attr("ry",4)
            .attr("stroke","#fff")
            .attr("fill", al => {
              const key = `${al}|${row.peptide}`;
              return lookup.has(key) ? colour(lookup.get(key)) : "#f0f0f0";
            })
            .append("title")
              .text(al => {
                const key = `${al}|${row.peptide}`;
                const val = lookup.get(key);
                return `${row.peptide} | ${al}\n${mode} percentile: ${val != null ? val.toFixed(1) : "—"}`;
              });
      }
    });

    // ▸ HLA allele labels (rotated)
    if (showAlleles && alleles.length) {
      const x0 = margin.left + maxLen*cell + cell;
      const y0 = margin.top - 2;
      const xg = svg.append("g")
                    .attr("transform", `translate(${x0},${y0})`);
      alleles.forEach((al, j) => {
        xg.append("text")
          .attr("transform", `translate(${j*cell + cell/2}, 0) rotate(-45)`)
          .attr("text-anchor", "start")
          .attr("font-family", "sans-serif")
          .attr("font-size", Math.round(cell*0.42))
          .text(al);
      });
    }

    wrapper.innerHTML = "";
    wrapper.appendChild(svg.node());
  }

  const ro = new ResizeObserver(entries=>{
    for (const e of entries){ draw(e.contentRect.width); }
  });
  ro.observe(wrapper);
  draw(wrapper.getBoundingClientRect().width);
  return wrapper;
}
