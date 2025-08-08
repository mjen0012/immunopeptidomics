/*****************************************************************
 *  peptideHeatmap() → HTMLElement   ·   v19
 *  - Two-phase layout: render → measure → auto-reflow
 *  - Guarantees no clipping of rotated allele labels (top/right)
 *  - %/count column snaps to whole cells; small angled-gap included
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

  // measurement helpers
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

  // ---- core draw (returns the svg and layout metrics we used) ----
  function drawCore(wrapperWidth, opts) {
    const {
      cell, xLabelBand, labelCols, rightPad, angleGapCols
    } = opts;

    const haveAlleles = showAlleles && Array.isArray(alleles) && alleles.length > 0;
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
            });
      }
    });

    // allele headers
    let labelsBBox = null;
    if (haveAlleles) {
      const labelFont = Math.round(cell*0.42);
      const x0 = margin.left + pepCols*cell + labelWidth;
      const xg = svg.append("g").attr("transform", `translate(${x0},${margin.top + xLabelBand})`)
                    .attr("data-role","allele-labels");

      alleles.forEach((al, j) => {
        xg.append("text")
          .attr("transform", `translate(${j*cell + cell/2}, 0) rotate(-45)`)
          .attr("text-anchor", "start")
          .style("font-size", `${labelFont}px`)
          .text(al);
      });

      // **measure AFTER rendering in the real SVG**
      labelsBBox = xg.node().getBBox();
      // add titles (after bbox) if you want
    }

    return { svg, labelsBBox, w, h, labelWidth };
  }

  // ---- outer draw that may reflow once if clipping is detected ----
  const draw = (wrapperWidth) => {
    const haveAlleles = showAlleles && Array.isArray(alleles) && alleles.length > 0;
    const alleleCols  = haveAlleles ? alleles.length : 0;

    // initial guesses
    let cell = baseCell;
    let rightPad = haveAlleles ? Math.max(12, Math.round(baseCell * 0.7)) : margin.right;
    let angleGapCols = haveAlleles ? 0.5 : 0; // small angled gap
    let xLabelBand = 0;
    let labelCols = 0;

    // %/count text measurement (snapped to whole cells)
    const numLabels = rows.map(r => {
      const pct = Number.isFinite(r.proportion) ? (r.proportion*100).toFixed(1) : "0.0";
      return `${pct}% (${r.frequency}/${r.total})`;
    });

    // pre-pass to settle cell size based on height/width constraints
    for (let pass = 0; pass < 2; pass++) {
      const labelFontPx = Math.round(cell * 0.42);

      xLabelBand = haveAlleles ? Math.round(cell * 1.6) : 0; // a safe starting band
      const measuredNumW = measureMaxTextWidth(numLabels, labelFontPx, "'Roboto', sans-serif");
      const pad = Math.max(6, Math.round(cell * 0.25));

      labelCols = haveAlleles ? Math.max(1, Math.ceil((measuredNumW + pad) / cell)) : 0;

      const labelW = (haveAlleles ? (labelCols + angleGapCols) : 0) * cell;
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
      cell, xLabelBand, labelCols, rightPad, angleGapCols
    });

    // Post-measure: if labels would clip or crowd, bump band/rightPad and redraw once
    if (haveAlleles && labelsBBox) {
      // absolute top of labels in SVG coords
      const groupTop = margin.top + xLabelBand + labelsBBox.y;
      const needTop  = groupTop < 0 ? Math.ceil(-groupTop + 2) : 0;

      // absolute right of labels in SVG coords
      const labelGroupX = margin.left + pepCols*cell + (labelCols + angleGapCols)*cell;
      const labelsRight = labelGroupX + labelsBBox.width;
      const needRight   = labelsRight > (w - rightPad) ? Math.ceil(labelsRight - (w - rightPad) + 2) : 0;

      if (needTop > 0 || needRight > 0) {
        // recompute using larger band/pad and render again
        xLabelBand += needTop;
        rightPad   += needRight;

        // rebuild with updated metrics
        ({ svg } = drawCore(wrapperWidth, {
          cell, xLabelBand, labelCols, rightPad, angleGapCols
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
  return wrapper;
}
