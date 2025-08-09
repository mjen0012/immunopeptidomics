/*****************************************************************
 *  peptideHeatmap() → HTMLElement   ·   v20
 *  - Responsive peptide heatmap with optional Class I allele overlay
 *  - Matches allele cache/API rows even when display uses gapped peptides
 *  - Accurate top band for rotated allele labels; compact right spacing
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

  alleleData = [],          // chartRowsI-style rows (snake_case keys)
  alleles    = [],          // currently selected alleles
  mode       = "EL",        // EL | BA | HTMLInput-like
  showAlleles = true
} = {}) {

  const isEventTarget = (v) => v && typeof v.addEventListener === "function" && "value" in v;
  const curMode = isEventTarget(mode) ? (String(mode.value).toUpperCase().includes("BA") ? "BA" : "EL")
                                      : (String(mode).toUpperCase().includes("BA") ? "BA" : "EL");

  if (!selected || !data?.length) {
    const span = document.createElement("span");
    span.textContent = "Click a peptide in the viewer to see its proportions.";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── helpers ─────────────────────────────────────────────────── */
  const normPep = s => String(s || "").toUpperCase().replace(/-/g, "").trim();
  const scoreKey = curMode === "BA" ? "netmhcpan_ba_percentile" : "netmhcpan_el_percentile";
  const colour = d3.scaleLinear().domain([0, 50, 100]).range(["#0074D9", "#ffffff", "#e60000"]);
  const aaColours = aminoacidPalette;

  // dash template from the clicked peptide (aligned)
  const selAligned   = String(selected || "");
  const dashIdx      = [];
  for (let i=0;i<selAligned.length;i++) if (selAligned[i] === "-") dashIdx.push(i);
  const selUngapped  = normPep(selAligned);

  // insert dashes into an ungapped peptide at the selected dash positions
  function withTemplateDashes(ungapped) {
    const arr = ungapped.split("");
    const out = [];
    let k = 0;
    for (let i = 0; i < selAligned.length; i++) {
      if (selAligned[i] === "-") out.push("-");
      else                       out.push(arr[k++] ?? "");
    }
    return out.join("");
  }

  /* ── prepare rows (clicked + topN) ───────────────────────────── */
  // index data by UNGAPPED peptide (from SQL/counted substrings)
  const byUngapped = new Map(data.map(d => [normPep(d.peptide), d]));

  // head: use the SQL row when available (by ungapped), but display aligned
  const headBase = byUngapped.get(selUngapped)
               ?? { peptide: selUngapped, proportion: 0, frequency: 0, total: 0 };
  const headDisp = { ...headBase, displayPeptide: selAligned };

  // next topN (by proportion) – exclude the clicked peptide’s ungapped form
  const others = data
    .filter(d => normPep(d.peptide) !== selUngapped)
    .sort((a,b)=>d3.descending(a.proportion,b.proportion))
    .slice(0, topN)
    .map(d => ({ ...d, displayPeptide: withTemplateDashes(normPep(d.peptide)) }));

  const rows = [headDisp, ...others];
  const nRows  = rows.length;
  const maxLen = d3.max(rows, d => d.displayPeptide.length);

  /* ── allele value lookup (keys = ALLELE|UNGAPPED_PEPTIDE) ─────── */
  const lookup = new Map();
  for (const r of alleleData) {
    const pep = normPep(r.peptide);
    const al  = String(r.allele || "").toUpperCase().trim();
    if (pep && al && typeof r[scoreKey] === "number") {
      lookup.set(`${al}|${pep}`, +r[scoreKey]);
    }
  }

  /* ── wrapper div (fixed height) ──────────────────────────────── */
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:relative; width: 100%; height: ${height0}px; overflow: hidden;`;

  function measureRotatedBand(texts, cell, fontSize = 12) {
    if (!texts?.length) return 34;
    const svg = d3.create("svg").attr("width", 1).attr("height", 1)
      .style("position","absolute").style("left","-99999px").style("top","-99999px");
    document.body.appendChild(svg.node());
    let maxAbove = 0;
    for (const t of texts) {
      const n = svg.append("text").text(t)
        .attr("transform","rotate(-45)")
        .style("font-family","sans-serif")
        .style("font-size", `${fontSize}px`);
      const b = n.node().getBBox();
      maxAbove = Math.max(maxAbove, -b.y);
      n.remove();
    }
    svg.remove();
    // a little extra headroom for the diagonal
    return Math.min(96, Math.max(28, Math.round(maxAbove + 6)));
  }

  function draw(wrapperWidth){
    const anyAlleles = (showAlleles && alleles.length);
    const labelFont  = Math.round(baseCell*0.42);
    const topLabelBand = anyAlleles ? measureRotatedBand(alleles, baseCell, labelFont) : 0;

    // width for the percentage/count label block (measure roughly from text length)
    const example = `${(rows[0].proportion*100).toFixed(1)}% (${rows[0].frequency}/${rows[0].total})`;
    const estLabel = Math.ceil(Math.max(90, example.length * Math.max(7, baseCell*0.32)));

    const fitH = Math.floor((height0 - margin.top - margin.bottom - topLabelBand) / nRows);
    const fitW = Math.floor((wrapperWidth - margin.left - margin.right - estLabel - (anyAlleles ? alleles.length*baseCell : 0)) / maxLen);
    const cell = Math.max(12, Math.min(baseCell, fitH, fitW));

    const labelWidth = estLabel; // adapt to text size
    const gridW = maxLen*cell;
    const alleleW = anyAlleles ? alleles.length*cell : 0;
    const totalW = margin.left + gridW + labelWidth + alleleW + margin.right;
    const h = margin.top  + topLabelBand + nRows*cell + margin.bottom + 6;

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${totalW} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio","xMinYMin meet")
      .attr("font-family","'Roboto Mono', monospace")
      .attr("font-size", Math.round(cell*0.52));

    rows.forEach((row,i)=>{
      const y0 = margin.top + topLabelBand + i*cell;

      // ▸ AA background (display string with template dashes)
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
            const ch = row.displayPeptide[j] ?? "";
            if (ch === "-") return "#f9f9f9";
            if (colourMode === "Properties") return aaColours[ch] ?? "#f9f9f9";
            if (i === 0) return "#006DAE";
            return (j<row.displayPeptide.length && ch!==selAligned[j]) ? "#ffcccc" : "#f9f9f9";
          });

      // ▸ AA letters
      svg.append("g")
        .attr("transform",`translate(${margin.left},${y0})`)
        .selectAll("text")
        .data(row.displayPeptide.split(""))
        .enter().append("text")
          .attr("x", (_,j)=>j*cell+cell/2)
          .attr("y", cell/2)
          .attr("dy","0.35em")
          .attr("text-anchor","middle")
          .attr("font-weight", i===0?"bold":null)
          .attr("fill", i===0?"#fff":"#000")
          .text(c=>c);

      // ▸ proportion/count label (tight to grid)
      const pct = (row.proportion*100).toFixed(1);
      svg.append("text")
        .attr("font-family","'Roboto', sans-serif")
        .attr("font-size", Math.round(cell*0.4))
        .attr("x", margin.left + gridW + 6)
        .attr("y", y0 + cell/2)
        .attr("dy","0.35em")
        .html(`<tspan font-weight="bold">${pct}%</tspan><tspan dx="6">(${row.frequency}/${row.total})</tspan>`);

      // ▸ allele overlay (keys use ungapped peptide)
      if (anyAlleles) {
        const pepKey = normPep(row.peptide); // original ungapped key from data
        const xAllele = margin.left + gridW + labelWidth;

        svg.append("g")
          .attr("transform", `translate(${xAllele},${y0})`)
          .selectAll("rect")
          .data(alleles)
          .enter().append("rect")
            .attr("x", (_d,j)=>j*cell + 0.5)
            .attr("y", 0.5)
            .attr("width", cell - 1)
            .attr("height", cell - 1)
            .attr("rx",4).attr("ry",4)
            .attr("stroke","#fff")
            .attr("fill", al => {
              const key = `${String(al).toUpperCase()}|${pepKey}`;
              return lookup.has(key) ? colour(lookup.get(key)) : "#f0f0f0";
            })
            .append("title")
              .text(al => {
                const key = `${String(al).toUpperCase()}|${pepKey}`;
                const val = lookup.get(key);
                return `${row.displayPeptide} | ${al}\n${curMode} percentile: ${val != null ? (+val).toFixed(1) : "—"}`;
              });
      }
    });

    // ▸ allele labels (diagonal) — start right after the count label
    if (anyAlleles) {
      const x0 = margin.left + gridW + labelWidth;
      const y0 = margin.top + topLabelBand - 2;
      const xg = svg.append("g").attr("transform", `translate(${x0},${y0})`);
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

  // keep in sync with radio toggle if provided
  if (isEventTarget(mode)) mode.addEventListener("input", () => draw(wrapper.getBoundingClientRect().width));

  return wrapper;
}
