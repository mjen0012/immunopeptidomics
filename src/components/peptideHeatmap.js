/*****************************************************************
 *  peptideHeatmap() → HTMLElement   ·   v13
 *  - Responsive peptide heatmap with optional Class I allele overlay
 *  - Integrates cache+API (chartRowsI) in a single overlay
 *  - IMPORTANT: compares against *ungapped* selected peptide
 *****************************************************************/
import * as d3 from "npm:d3";
import { aminoacidPalette } from "/components/palettes.js";

export function peptideHeatmap({
  data,
  selected,                 // may contain '-' (aligned)
  topN       = 4,
  colourMode = "Mismatches",
  baseCell   = 31,
  height0    = 280,
  margin     = { top:20, right:150, bottom:20, left:4 },

  // ── allele overlay (Class I only for now)
  alleleData = [],          // rows in snake_case (see page normalizers)
  alleles    = [],          // selected alleles (strings)
  mode       = "EL",        // "EL" | "BA"
  showAlleles = true
} = {}) {
  if (!selected || !data?.length) {
    const span = document.createElement("span");
    span.textContent = "Click a peptide in the viewer to see its proportions.";
    span.style.fontStyle = "italic";
    return span;
  }

  // Always use ungapped selected for keying & mismatch logic
  const selectedNoGaps = String(selected).replace(/-/g, "");

  /* ── peptide rows (selected + topN alternatives) ─────────────── */
  const map  = new Map(data.map(d => [d.peptide, d])); // data peptides are ungapped
  const head = map.get(selectedNoGaps) ?? {
    peptide    : selectedNoGaps,
    proportion : 0,
    frequency  : 0,
    total      : 0
  };

  const rows = [
    head,
    ...data
      .filter(d => d.peptide !== selectedNoGaps)
      .sort((a,b)=>d3.descending(a.proportion,b.proportion))
      .slice(0, topN)
  ];

  const nRows   = rows.length;
  const maxLen  = d3.max(rows, d => d.peptide.length) ?? 0;
  const aaCols  = aminoacidPalette;

  /* ── allele value lookup (Class I) ───────────────────────────── */
  const keyOf = (al, pep) => `${String(al).trim()}|${String(pep).trim()}`;
  const scoreKey = mode === "BA" ? "netmhcpan_ba_percentile"
                                 : "netmhcpan_el_percentile";

  const lookup = new Map();
  for (const r of alleleData || []) {
    const pep = r?.peptide;
    const al  = r?.allele;
    const val = r?.[scoreKey];
    if (pep && al && Number.isFinite(+val)) {
      lookup.set(keyOf(al, pep), +val);
    }
  }

  const colourPct = d3.scaleLinear()
    .domain([0, 50, 100])
    .range(["#0074D9", "#ffffff", "#e60000"]);

  /* ── wrapper with fixed height + responsive renderer ─────────── */
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `width:100%; height:${height0}px; overflow:hidden;`;

  const draw = (wrapperWidth) => {
    const haveAlleles = showAlleles && Array.isArray(alleles) && alleles.length > 0;

    const labelWidth  = Math.ceil(baseCell * 8.5);             // room for counts
    const pepCols     = maxLen;
    const alleleCols  = haveAlleles ? alleles.length : 0;

    const fitH = Math.floor((height0 - margin.top - margin.bottom) / Math.max(1, nRows));
    const fitW = Math.floor((
      wrapperWidth - margin.left - margin.right - labelWidth
    ) / Math.max(1, pepCols + alleleCols));

    const cell = Math.max(12, Math.min(baseCell, fitH, fitW));
    const w = margin.left + (pepCols + alleleCols)*cell + labelWidth + margin.right;
    const h = margin.top  + nRows*cell + margin.bottom + 12;

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio","xMinYMin meet")
      .style("font-family","'Roboto', sans-serif")
      .style("font-size", `${Math.round(cell*0.5)}px`);

    rows.forEach((row, i) => {
      const y0 = margin.top + i*cell;

      // AA background cells
      const gBG = svg.append("g").attr("transform",`translate(${margin.left},${y0})`);
      gBG.selectAll("rect")
        .data(d3.range(pepCols))
        .enter().append("rect")
          .attr("x", j=>j*cell+0.5)
          .attr("y", 0.5)
          .attr("width",  cell-1)
          .attr("height", cell-1)
          .attr("rx",6).attr("ry",6)
          .attr("stroke","#fff")
          .attr("fill", j => {
            const ch = row.peptide[j] ?? "";
            if (colourMode === "Properties") return aaCols[ch] ?? "#f9f9f9";
            if (i === 0) return "#006DAE"; // selected row
            // mismatch vs ungapped selected
            return (j < selectedNoGaps.length && j < row.peptide.length && ch !== selectedNoGaps[j])
              ? "#ffcccc" : "#f9f9f9";
          });

      // AA letters
      const gTxt = svg.append("g").attr("transform",`translate(${margin.left},${y0})`);
      gTxt.selectAll("text")
        .data(row.peptide.split(""))
        .enter().append("text")
          .attr("x", (_,j)=>j*cell+cell/2)
          .attr("y", cell/2)
          .attr("dy","0.35em")
          .attr("text-anchor","middle")
          .attr("font-weight", i===0 ? "bold" : null)
          .attr("fill", i===0 ? "#fff" : "#000")
          .text(c=>c);

      // proportion + counts
      const pct = (row.proportion*100);
      const label = svg.append("text")
        .attr("x", margin.left + pepCols*cell + 6)
        .attr("y", y0 + cell/2)
        .attr("dy","0.35em")
        .style("font-size", Math.round(cell*0.42))
        .text(`${Number.isFinite(pct) ? pct.toFixed(1) : "0.0"}%  (${row.frequency}/${row.total})`);
      label.selectAll("tspan").attr("font-weight", "bold");

      // allele overlay (Class I)
      if (haveAlleles) {
        const gA = svg.append("g")
          .attr("transform", `translate(${margin.left + pepCols*cell + labelWidth},${y0})`);
        gA.selectAll("rect")
          .data(alleles)
          .enter().append("rect")
            .attr("x", (_,j)=>j*cell + 0.5)
            .attr("y", 0.5)
            .attr("width",  cell - 1)
            .attr("height", cell - 1)
            .attr("rx",4).attr("ry",4)
            .attr("stroke","#fff")
            .attr("fill", al => {
              const val = lookup.get(keyOf(al, row.peptide));
              return Number.isFinite(val) ? colourPct(val) : "#f0f0f0";
            })
            .append("title")
              .text(al => {
                const val = lookup.get(keyOf(al, row.peptide));
                const disp = Number.isFinite(val) ? val.toFixed(1) : "—";
                return `${row.peptide} | ${al} • ${mode} percentile: ${disp}`;
              });
      }
    });

    // allele column labels (rotated, diagonal)
    if (haveAlleles) {
      const x0 = margin.left + pepCols*cell + labelWidth;
      const y0 = margin.top - 2;
      const xg = svg.append("g").attr("transform", `translate(${x0},${y0})`);
      alleles.forEach((al, j) => {
        xg.append("text")
          .attr("transform", `translate(${j*cell + cell/2}, 0) rotate(-45)`)
          .attr("text-anchor", "start")
          .style("font-size", Math.round(cell*0.42))
          .text(al);
      });
    }

    wrapper.replaceChildren(svg.node());
  };

  const ro = new ResizeObserver(entries => {
    for (const e of entries) draw(e.contentRect.width);
  });
  ro.observe(wrapper);
  draw(wrapper.getBoundingClientRect().width || wrapper.clientWidth || 800);
  return wrapper;
}
