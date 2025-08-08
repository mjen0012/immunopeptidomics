/*****************************************************************
 *  peptideHeatmap() → HTMLElement   ·   v17
 *  - Extra-safe top band for rotated allele labels (no clipping)
 *  - Slight horizontal cushion for angled headers:
 *      • between counts and first allele column
 *      • a small right-edge pad
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

  alleleData = [],          // snake_case
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

  const selectedNoGaps = String(selected).replace(/-/g, "");
  const aaCols = aminoacidPalette;

  // rows (selected + topN)
  const byPep = new Map(data.map(d => [d.peptide, d]));
  const head  = byPep.get(selectedNoGaps) ?? { peptide:selectedNoGaps, proportion:0, frequency:0, total:0 };
  const rows  = [ head, ...data.filter(d => d.peptide !== selectedNoGaps)
                               .sort((a,b)=>d3.descending(a.proportion,b.proportion))
                               .slice(0, topN) ];
  const nRows   = rows.length;
  const pepCols = Math.max(0, d3.max(rows, d => d.peptide.length) ?? 0);

  // allele lookup
  const scoreKey = mode === "BA" ? "netmhcpan_ba_percentile" : "netmhcpan_el_percentile";
  const pairKey  = (al, pep) => `${String(al).trim()}|${String(pep).trim()}`;
  const lookup   = new Map();
  for (const r of alleleData || []) {
    const pep = r?.peptide, al = r?.allele, val = r?.[scoreKey];
    if (pep && al && Number.isFinite(+val)) lookup.set(pairKey(al, pep), +val);
  }
  const colourPct = d3.scaleLinear().domain([0,50,100]).range(["#0074D9","#ffffff","#e60000"]);

  // ── measurement helpers
  function measureRotBand(fontPx = 12, fontFamily = "sans-serif") {
    const has = showAlleles && alleles?.length;
    if (!has) return 0;
    const svg = d3.create("svg")
      .attr("width",10).attr("height",10)
      .style("position","absolute").style("left","-20000px").style("top","-20000px").style("visibility","hidden");
    document.body.appendChild(svg.node());
    let maxAbove = 0;
    for (const text of alleles) {
      const t = svg.append("text")
        .text(text)
        .attr("transform","rotate(-45)")
        .style("font-family",fontFamily)
        .style("font-size",`${fontPx}px`);
      const b = t.node().getBBox();
      maxAbove = Math.max(maxAbove, -b.y);
      t.remove();
    }
    svg.remove();
    // extra safety: add ~1.1× font height + a few px
    return Math.max(28, Math.round(maxAbove + fontPx * 1.1 + 4));
  }

  function measureMaxTextWidth(strings, fontPx = 12, fontFamily = "sans-serif") {
    if (!strings?.length) return 0;
    const svg = d3.create("svg")
      .attr("width",10).attr("height",10)
      .style("position","absolute").style("left","-20000px").style("top","-20000px").style("visibility","hidden");
    document.body.appendChild(svg.node());
    let maxW = 0;
    for (const s of strings) {
      const t = svg.append("text")
        .text(s)
        .style("font-family",fontFamily)
        .style("font-size",`${fontPx}px`);
      const b = t.node().getBBox();
      maxW = Math.max(maxW, b.width);
      t.remove();
    }
    svg.remove();
    return Math.ceil(maxW);
  }

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `width:100%; height:${height0}px; overflow:hidden;`;

  const draw = (wrapperWidth) => {
    const haveAlleles = showAlleles && Array.isArray(alleles) && alleles.length > 0;

    // slightly smaller right pad when alleles exist (tuned)
    const baseRight = haveAlleles ? Math.max(12, Math.round(baseCell * 0.75))
                                  : margin.right;

    // two-pass sizing
    let cell = baseCell, xLabelBand = 0, labelCols = 0;
    const alleleCols = haveAlleles ? alleles.length : 0;
    const numLabels  = rows.map(r => {
      const pct = Number.isFinite(r.proportion) ? (r.proportion*100).toFixed(1) : "0.0";
      return `${pct}% (${r.frequency}/${r.total})`;
    });

    // small extra horizontal cushion because labels are angled
    let angleGapCols = 0;

    for (let pass = 0; pass < 2; pass++) {
      const labelFontPx = Math.round(cell * 0.42);

      xLabelBand = haveAlleles ? measureRotBand(Math.round(cell * 0.42), "sans-serif") : 0;

      const measuredNumW = measureMaxTextWidth(numLabels, labelFontPx, "'Roboto', sans-serif");
      const pad          = Math.max(6, Math.round(cell * 0.25));

      // extra “angle” cushion between counts and first allele col
      angleGapCols = haveAlleles ? 0.25 : 0;  // ~¼ cell looks right

      labelCols = haveAlleles
        ? Math.max(1, Math.ceil((measuredNumW + pad) / cell) + angleGapCols)
        : 0;

      const labelWidth = labelCols * cell;

      const fitH = Math.floor((height0 - margin.top - margin.bottom - xLabelBand) / Math.max(1, nRows));
      const fitW = Math.floor((
        wrapperWidth - margin.left - baseRight - labelWidth
      ) / Math.max(1, pepCols + alleleCols));

      const next = Math.max(12, Math.min(baseCell, fitH, fitW));
      if (Math.abs(next - cell) < 0.5) break;
      cell = next;
    }

    const labelWidth      = labelCols * cell;
    const rightEdgeCushion= haveAlleles ? Math.round(cell * 0.35) : 0; // small extra on far right
    const w = margin.left + pepCols*cell + labelWidth + alleleCols*cell + baseRight + rightEdgeCushion;
    const h = margin.top  + xLabelBand + nRows*cell + margin.bottom;

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio","xMinYMin meet")
      .style("font-family","'Roboto', sans-serif")
      .style("font-size", `${Math.round(cell*0.5)}px`);

    const yBase = margin.top + xLabelBand;

    rows.forEach((row, i) => {
      const y0 = yBase + i*cell;

      // AA background
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
            if (i === 0) return "#006DAE";
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

      // % + counts
      const pct = Number.isFinite(row.proportion) ? (row.proportion * 100).toFixed(1) : "0.0";
      svg.append("text")
        .attr("x", margin.left + pepCols*cell + 6)
        .attr("y", y0 + cell/2)
        .attr("dy","0.35em")
        .style("font-size", `${Math.round(cell*0.42)}px`)
        .text(`${pct}% (${row.frequency}/${row.total})`);

      // allele overlay
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
              const val = lookup.get(pairKey(al, row.peptide));
              return Number.isFinite(val) ? colourPct(val) : "#f0f0f0";
            })
            .append("title")
              .text(al => {
                const val = lookup.get(pairKey(al, row.peptide));
                const disp = Number.isFinite(val) ? val.toFixed(1) : "—";
                return `${row.peptide} | ${al} • ${mode} percentile: ${disp}`;
              });
      }
    });

    // allele headers (rotated)
    if (haveAlleles) {
      const x0 = margin.left + pepCols*cell + labelWidth;
      const xg = svg.append("g").attr("transform", `translate(${x0},${margin.top + xLabelBand})`);
      alleles.forEach((al, j) => {
        xg.append("text")
          .attr("transform", `translate(${j*cell + cell/2}, 0) rotate(-45)`)
          .attr("text-anchor", "start")
          .style("font-size", `${Math.round(cell*0.42)}px`)
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
