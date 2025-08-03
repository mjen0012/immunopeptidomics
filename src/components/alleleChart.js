/*****************************************************************
 *  alleleChart() → HTMLElement   ·   v5 (fixed-height responsive)
 *****************************************************************/
import * as d3 from "npm:d3";

export function alleleChart({
  data       = [],
  alleles    = [],
  mode       = "EL",                  // "EL" | "BA"
  classType  = "I",                   // "I"  | "II"
  baseCell   = 28,                    // preferred cell size; will shrink/grow
  height0    = 320,                   // fixed card height (px), like peptideHeatmap
  margin     = { top: 80, right: 24, bottom: 24, left: 140 },
  showNumbers = false                 // hide numbers by default
} = {}) {

  /* ── guard ───────────────────────────────────────────────── */
  if (!alleles?.length || !data?.length) {
    const span = document.createElement("span");
    span.textContent =
      "Select alleles to see cached results (then click Run for fresh predictions).";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── pick the percentile column ──────────────────────────── */
  const pctCol =
    classType === "I"
      ? (mode === "EL" ? "netmhcpan_el percentile" : "netmhcpan_ba percentile")
      : (mode === "EL" ? "netmhciipan_el percentile" : "netmhciipan_ba percentile");

  /* ── filter rows to selected alleles & prep structures ───── */
  const rows = data.filter(d => alleles.includes(d.allele));
  const peptides = [...new Set(rows.map(d => d.peptide))].sort(d3.ascending);
  const nRows = peptides.length;
  const nCols = alleles.length;

  if (nRows === 0 || nCols === 0) {
    const span = document.createElement("span");
    span.textContent = "No matching rows for the selected alleles.";
    span.style.fontStyle = "italic";
    return span;
  }

  // Percentiles can arrive as strings; ensure numbers. Ignore NaN in lookup.
  const lookup = new Map();
  for (const d of rows) {
    const v = +d[pctCol];
    if (Number.isFinite(v)) lookup.set(`${d.allele}|${d.peptide}`, v);
  }

  // Colour scale: blue → white → red
  const colour = d3.scaleLinear()
    .domain([0, 50, 100])
    .range(["#0074D9", "#ffffff", "#e60000"]);

  /* ── wrapper div (fixed height, width:100%) ───────────────── */
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width: 100%;
    height: ${height0}px;
    overflow: hidden;
  `;

  /* ── layout + draw (mimics peptideHeatmap) ───────────────── */
  function draw(wrapperWidth) {
    // Choose a cell size that fits both width & height
    const fitH = Math.floor((height0 - margin.top - margin.bottom) / nRows);
    const fitW = Math.floor((wrapperWidth - margin.left - margin.right) / nCols);
    const cell = Math.max(10, Math.min(baseCell, fitH, fitW));   // clamp ≥10px

    const w = margin.left + nCols * cell + margin.right;
    const h = margin.top  + nRows * cell + margin.bottom;

    // Fresh SVG (responsive via viewBox + preserveAspectRatio)
    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .style("font-family", "sans-serif")
      .style("font-size", 12);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    /* ── draw cells ─────────────────────────────────────────── */
    for (let yi = 0; yi < nRows; yi++) {
      const pep = peptides[yi];
      for (let xi = 0; xi < nCols; xi++) {
        const al  = alleles[xi];
        const key = `${al}|${pep}`;
        const val = lookup.get(key);

        g.append("rect")
          .attr("x", xi * cell + 0.5)
          .attr("y", yi * cell + 0.5)
          .attr("width",  cell - 1)
          .attr("height", cell - 1)
          .attr("fill", val == null ? "#f0f0f0" : colour(val));

        if (showNumbers && val != null) {
          g.append("text")
            .attr("x", xi * cell + cell / 2)
            .attr("y", yi * cell + cell / 2 + 3)
            .attr("text-anchor", "middle")
            .attr("pointer-events", "none")
            .attr("font-size", Math.round(cell * 0.42))
            .text(val.toFixed(1));
        }
      }
    }

    /* ── X-axis labels (alleles, above the grid) ────────────── */
    const xg = svg.append("g")
      // draw the labels a little ABOVE the grid, then rotate each label
      .attr("transform", `translate(${margin.left},${margin.top - 10})`);

    alleles.forEach((al, i) => {
      xg.append("text")
        // position at the column center, then rotate -45°
        .attr("transform", `translate(${i * cell + cell / 2}, 0) rotate(-45)`)
        // make labels lean up-right so they don't overlap the left Y labels
        .attr("text-anchor", "start")
        .attr("dy", -4) // lift slightly above the grid top
        .text(al);
    });

    /* ── Y-axis labels (peptides) ───────────────────────────── */
    const yg = svg.append("g")
      .attr("transform", `translate(${margin.left - 8},${margin.top})`);

    peptides.forEach((pep, i) => {
      yg.append("text")
        .attr("x", 0)
        .attr("y", i * cell + cell / 2 + 4)
        .attr("text-anchor", "end")
        .text(pep);
    });

    /* ── wipe & append ──────────────────────────────────────── */
    wrapper.innerHTML = "";
    wrapper.appendChild(svg.node());
  }

  /* ── first draw + resize observer ─────────────────────────── */
  const ro = new ResizeObserver(entries => {
    for (const e of entries) draw(e.contentRect.width);
  });
  ro.observe(wrapper);  // observe itself
  draw(wrapper.getBoundingClientRect().width); // initial

  return wrapper;
}
