/*****************************************************************
 *  alleleChart() → HTMLElement   ·   v6
 *  - Fixes top clipping of allele labels (reserves label band)
 *  - Robust percentile key resolution (EL/BA, spaces/underscores)
 *  - Mode switch (EL ↔ BA) updates colors/values immediately
 *****************************************************************/
import * as d3 from "npm:d3";

export function alleleChart({
  data       = [],
  alleles    = [],
  mode       = "EL",                  // "EL" | "BA"
  classType  = "I",                   // "I"  | "II"
  baseCell   = 28,                    // preferred cell size; will shrink/grow
  height0    = 320,                   // fixed card height (px)
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

  /* ── resolve percentile column robustly ──────────────────── */
  function resolvePctKey(keys, cls, m) {
    const norm = s => String(s).toLowerCase().replace(/[\s_-]+/g, "");
    const lut  = new Map(keys.map(k => [norm(k), k]));

    // Candidate lists (most specific → least)
    const cI_EL = ["netmhcpan_el_percentile", "netmhcpanelpercentile", "elpercentile"];
    const cI_BA = ["netmhcpan_ba_percentile", "netmhcpanbapercentile", "bapercentile"];
    const cII_EL = ["netmhciipan_el_percentile","netmhciipanelpercentile","elpercentile"];
    const cII_BA = ["netmhciipan_ba_percentile","netmhciipanbapercentile","bapercentile"];

    const cands = cls === "I"
      ? (m === "EL" ? cI_EL : cI_BA)
      : (m === "EL" ? cII_EL : cII_BA);

    for (const c of cands) {
      if (lut.has(c)) return lut.get(c);
    }
    // Fallback: scan keys for regex like /netmhc.*(iipan|pan).*el.*percent/i
    const rx = (m === "EL")
      ? /el.*percent/i
      : /ba.*percent/i;
    const found = keys.find(k => rx.test(k));
    if (found) return found;

    console.warn("[alleleChart] Could not resolve percentile column. Keys:", keys);
    return null;
  }

  // Gather keys once (merged data share a schema)
  const keys0  = Object.keys(data[0] ?? {});
  const pctKey = resolvePctKey(keys0, classType, mode);
  console.debug("[alleleChart] class:", classType, "mode:", mode, "pctKey:", pctKey);

  if (!pctKey) {
    const span = document.createElement("span");
    span.textContent = "No percentile column found in data.";
    span.style.color = "crimson";
    return span;
  }

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
    const v = +d[pctKey];
    if (Number.isFinite(v)) lookup.set(`${d.allele}|${d.peptide}`, v);
  }

  // Colour scale: blue → white → red
  const colour = d3.scaleLinear()
    .domain([0, 50, 100])
    .range(["#0074D9", "#ffffff", "#e60000"]);

  /* ── dynamic label band to prevent top clipping ──────────── */
  // Estimate how much vertical space rotated (-45°) labels need.
  const maxLabelLen = alleles.reduce((m, a) => Math.max(m, a?.length ?? 0), 0);
  const approxCharW = 6.5;                 // px per character (approx)
  const approxTextW = maxLabelLen * approxCharW;
  const textH       = 12;                   // font-size ≈ 12
  const rot = Math.PI / 4;                  // 45°
  const rotatedHeight = approxTextW * Math.sin(rot) + textH * Math.cos(rot);
  // Clamp to a reasonable band:
  const xLabelBand = Math.max(44, Math.min(120, Math.round(rotatedHeight + 10)));

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
    const fitH = Math.floor((height0 - margin.top - margin.bottom - xLabelBand) / nRows);
    const fitW = Math.floor((wrapperWidth - margin.left - margin.right) / nCols);
    const cell = Math.max(10, Math.min(baseCell, fitH, fitW));   // clamp ≥10px

    const w = margin.left + nCols * cell + margin.right;
    const h = margin.top  + xLabelBand + nRows * cell + margin.bottom;

    // Fresh SVG (responsive via viewBox + preserveAspectRatio)
    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .style("font-family", "sans-serif")
      .style("font-size", 12);

    // Grid group: moved DOWN by xLabelBand to create a safe stripe for labels
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top + xLabelBand})`);

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

    /* ── X-axis labels (alleles) — inside the reserved band ── */
    const xg = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top + xLabelBand - 2})`);

    alleles.forEach((al, i) => {
      xg.append("text")
        .attr("transform", `translate(${i * cell + cell / 2}, 0) rotate(-45)`)
        .attr("text-anchor", "start")  // lean up-right; avoids overlap with left axis
        .text(al);
    });

    /* ── Y-axis labels (peptides) ───────────────────────────── */
    const yg = svg.append("g")
      .attr("transform", `translate(${margin.left - 8},${margin.top + xLabelBand})`);

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
