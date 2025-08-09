/*****************************************************************
 *  peptideHeatmap() → HTMLElement   ·   v21a
 *  - v19 layout/reflow (no clipping; same spacing & sizing)
 *  - Dash template: clicked row shows aligned peptide with '-';
 *    alternates use the same gap template; overlay lookups use
 *    ungapped keys so cache/API rows match.
 *****************************************************************/
import * as d3 from "npm:d3";
import { aminoacidPalette } from "/components/palettes.js";

export function peptideHeatmap({
  data,
  selected,                 // aligned, may contain '-'
  topN       = 4,
  colourMode = "Mismatches",
  baseCell   = 31,
  height0    = 280,
  margin     = { top:20, right:150, bottom:20, left:4 },

  alleleData = [],          // snake_case rows (cache + API)
  alleles    = [],          // selected alleles
  mode       = "EL",        // "EL" | "BA" | reactive value string
  showAlleles = true
} = {}) {

  if (!selected || !data?.length) {
    const span = document.createElement("span");
    span.textContent = "Click a peptide in the viewer to see its proportions.";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── helpers ───────────────────────────────────────────────── */
  const aaCols      = aminoacidPalette;
  const selAligned  = String(selected);
  const selNoGaps   = selAligned.replace(/-/g, "");
  const normPep     = s => String(s||"").toUpperCase().replace(/-/g,"").trim();
  const normAllele  = s => String(s||"").toUpperCase().trim();

  // dash-template from the clicked peptide
  const applyTemplate = (ungapped) => {
    const src = (ungapped||"").split("");
    const out = [];
    let k = 0;
    for (let i=0;i<selAligned.length;i++) {
      if (selAligned[i] === "-") out.push("-");
      else out.push(src[k++] ?? "");
    }
    return out.join("");
  };

  // mode is a reactive value or string; compute once per render
  const resolveMode = () => {
    const m = (mode && mode.value !== undefined ? String(mode.value) : String(mode)).toUpperCase();
    return m.includes("BA") ? "BA" : "EL";
  };
  const currentMode = resolveMode();
  const scoreKey = () =>
    currentMode === "BA" ? "netmhcpan_ba_percentile" : "netmhcpan_el_percentile";

  /* ── rows (selected + topN) — keep both display & ungapped keys ─ */
  const byUngapped = new Map(data.map(d => [normPep(d.peptide), d]));
  const headBase   = byUngapped.get(normPep(selNoGaps))
                   ?? { peptide: selNoGaps, proportion:0, frequency:0, total:0 };
  const head       = {
    ...headBase,
    displayPeptide: selAligned,                  // clicked keeps dashes
    ungappedKey   : normPep(headBase.peptide)    // for overlay lookups
  };

  const alts = data
    .filter(d => normPep(d.peptide) !== normPep(selNoGaps))
    .sort((a,b)=>d3.descending(a.proportion,b.proportion))
    .slice(0, topN)
    .map(d => ({
      ...d,
      displayPeptide: applyTemplate(normPep(d.peptide)),
      ungappedKey   : normPep(d.peptide)
    }));

  const rows = [head, ...alts];
  const nRows   = rows.length;
  const pepCols = Math.max(0, d3.max(rows, d => d.displayPeptide.length) ?? 0);

  /* ── allele lookup (keys = ALLELE|UNGAPPED) ──────────────────── */
  const pairKey  = (al, pep) => `${normAllele(al)}|${normPep(pep)}`;
  function buildLookup() {
    const key = scoreKey();
    const map = new Map();
    for (const r of alleleData || []) {
      const pep = r?.peptide, al = r?.allele, val = r?.[key];
      if (pep && al && Number.isFinite(+val)) map.set(pairKey(al, pep), +val);
    }
    return map;
  }
  const lookup = buildLookup();

  const colourPct = d3.scaleLinear().domain([0,50,100]).range(["#0074D9","#ffffff","#e60000"]);

  /* ── measurement helper (v19) ───────────────────────────────── */
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

  /* ── core draw (v19 layout) ─────────────────────────────────── */
  function drawCore(wrapperWidth, opts) {
    const { cell, xLabelBand, labelCols, rightPad, angleGapCols, haveAlleles } = opts;
    const alleleCols  = haveAlleles ? alleles.length : 0;

    const labelWidth = (haveAlleles ? (labelCols + angleGapCols) : 0) * cell;
    const w = margin.left + pepCols*cell + labelWidth + alleleCols*cell + rightPad;
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

      // AA background (displayPeptide)
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
            const ch = row.displayPeptide[j] ?? "";
            if (ch === "-") return "#f9f9f9";
            if (colourMode === "Properties") return aaCols[ch] ?? "#f9f9f9";
            if (i === 0) return "#006DAE";
            return (j < selAligned.length && ch !== selAligned[j]) ? "#ffcccc" : "#f9f9f9";
          });

      // AA letters (displayPeptide)
      const gTxt = svg.append("g").attr("transform",`translate(${margin.left},${y0})`);
      gTxt.selectAll("text")
        .data(row.displayPeptide.split(""))
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

      // allele overlay — lookup by (allele | ungappedKey)
      if (haveAlleles) {
        const gA = svg.append("g")
          .attr("transform", `translate(${margin.left + pepCols*cell + ((labelCols + angleGapCols) * cell)},${y0})`);
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
              const val = lookup.get(pairKey(al, row.ungappedKey));
              return Number.isFinite(val) ? colourPct(val) : "#f0f0f0";
            });
      }
    });

    // allele headers (v19)
    let labelsBBox = null;
    if (haveAlleles) {
      const labelFont = Math.round(cell*0.42);
      const x0 = margin.left + pepCols*cell + ((labelCols + angleGapCols)*cell);
      const xg = svg.append("g").attr("transform", `translate(${x0},${margin.top + xLabelBand})`)
                    .attr("data-role","allele-labels");

      alleles.forEach((al, j) => {
        xg.append("text")
          .attr("transform", `translate(${j*cell + cell/2}, 0) rotate(-45)`)
          .attr("text-anchor", "start")
          .style("font-size", `${labelFont}px`)
          .text(al);
      });

      labelsBBox = xg.node().getBBox();
    }

    return { svg, labelsBBox, w, h };
  }

  /* ── outer draw (v19 reflow) ─────────────────────────────────── */
  const draw = (wrapperWidth) => {
    const outerHaveAlleles = showAlleles && Array.isArray(alleles) && alleles.length > 0;
    const alleleCols  = outerHaveAlleles ? alleles.length : 0;

    // initial guesses (v19 defaults)
    let cell = baseCell;
    let rightPad = outerHaveAlleles ? Math.max(12, Math.round(baseCell * 0.7)) : margin.right;
    let angleGapCols = outerHaveAlleles ? 0.5 : 0; // small angled gap
    let xLabelBand = 0;
    let labelCols = 0;

    // %/count labels (snap to whole cells)
    const numLabels = rows.map(r => {
      const pct = Number.isFinite(r.proportion) ? (r.proportion*100).toFixed(1) : "0.0";
      return `${pct}% (${r.frequency}/${r.total})`;
    });

    // pre-pass to settle cell size
    for (let pass = 0; pass < 2; pass++) {
      const labelFontPx = Math.round(cell * 0.42);

      xLabelBand = outerHaveAlleles ? Math.round(cell * 1.6) : 0;
      const measuredNumW = measureMaxTextWidth(numLabels, labelFontPx, "'Roboto', sans-serif");
      const pad = Math.max(6, Math.round(cell * 0.25));

      labelCols = outerHaveAlleles ? Math.max(1, Math.ceil((measuredNumW + pad) / cell)) : 0;

      const labelW = (outerHaveAlleles ? (labelCols + angleGapCols) : 0) * cell;
      const fitH = Math.floor((height0 - margin.top - margin.bottom - xLabelBand) / Math.max(1, nRows));
      const fitW = Math.floor((
        wrapperWidth - margin.left - rightPad - labelW
      ) / Math.max(1, pepCols + alleleCols));

      const next = Math.max(12, Math.min(baseCell, fitH, fitW));
      if (Math.abs(next - cell) < 0.5) break;
      cell = next;
    }

    // First render
    let { svg, labelsBBox, w } = drawCore(wrapperWidth, {
      cell, xLabelBand, labelCols, rightPad, angleGapCols, haveAlleles: outerHaveAlleles
    });

    // Post-measure reflow if diagonal labels would clip
    if (outerHaveAlleles && labelsBBox) {
      const groupTop   = margin.top + xLabelBand + labelsBBox.y;
      const needTop    = groupTop < 0 ? Math.ceil(-groupTop + 2) : 0;

      const labelGroupX = margin.left + pepCols*cell + (labelCols + angleGapCols)*cell;
      const labelsRight = labelGroupX + labelsBBox.width;
      const needRight   = labelsRight > (w - rightPad) ? Math.ceil(labelsRight - (w - rightPad) + 2) : 0;

      if (needTop > 0 || needRight > 0) {
        xLabelBand += needTop;
        rightPad   += needRight;

        ({ svg } = drawCore(wrapperWidth, {
          cell, xLabelBand, labelCols, rightPad, angleGapCols, haveAlleles: outerHaveAlleles
        }));
      }
    }

    wrapper.replaceChildren(svg.node());
  };

  const ro = new ResizeObserver(entries => {
    for (const e of entries) draw(e.contentRect.width);
  });
  ro.observe(wrapper);
  draw(wrapper.getBoundingClientRect().width || wrapper.clientWidth || 800);

  // NOTE: No event listeners on `mode` here.
  // Observable will re-run the calling cell when `mode` changes,
  // which will rebuild this component with the new value.

  return wrapper;
}
