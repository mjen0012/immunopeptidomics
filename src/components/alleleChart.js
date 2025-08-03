/*****************************************************************
 *  alleleChart() → HTMLElement   ·   v7
 *  - Accepts mode as string OR AsyncGenerator (Generators.input)
 *  - Waits for initial mode before first draw (no EL flicker)
 *  - Re-renders on every mode change; still resizes responsively
 *  - Keeps label band (no top clipping); robust percentile key
 *****************************************************************/
import * as d3 from "npm:d3";

export function alleleChart({
  data       = [],
  alleles    = [],
  mode       = "EL",                  // "EL" | "BA" | AsyncGenerator
  classType  = "I",                   // "I"  | "II"
  baseCell   = 28,
  height0    = 320,
  margin     = { top: 80, right: 24, bottom: 24, left: 140 },
  showNumbers = false
} = {}) {

  /* ── guard ───────────────────────────────────────────────── */
  if (!alleles?.length || !data?.length) {
    const span = document.createElement("span");
    span.textContent =
      "Select alleles to see cached results (then click Run for fresh predictions).";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── helpers ─────────────────────────────────────────────── */
  const isAsyncIterable = (v) => v && typeof v[Symbol.asyncIterator] === "function";

  function resolvePctKey(keys, cls, m) {
    const norm = s => String(s).toLowerCase().replace(/[\s_-]+/g, "");
    const lut  = new Map(keys.map(k => [norm(k), k]));
    const cI_EL  = ["netmhcpan_el_percentile","netmhcpanelpercentile","elpercentile"];
    const cI_BA  = ["netmhcpan_ba_percentile","netmhcpanbapercentile","bapercentile"];
    const cII_EL = ["netmhciipan_el_percentile","netmhciipanelpercentile","elpercentile"];
    const cII_BA = ["netmhciipan_ba_percentile","netmhciipanbapercentile","bapercentile"];
    const cands = cls === "I" ? (m === "EL" ? cI_EL : cI_BA)
                              : (m === "EL" ? cII_EL : cII_BA);
    for (const c of cands) if (lut.has(c)) return lut.get(c);
    const rx = (m === "EL") ? /el.*percent/i : /ba.*percent/i;
    const found = keys.find(k => rx.test(k));
    return found ?? null;
  }

  /* ── dynamic label band to prevent top clipping ──────────── */
  const maxLabelLen = alleles.reduce((m, a) => Math.max(m, a?.length ?? 0), 0);
  const approxCharW = 6.5;
  const approxTextW = maxLabelLen * approxCharW;
  const textH       = 12;
  const rot         = Math.PI / 4;
  const rotatedHeight = approxTextW * Math.sin(rot) + textH * Math.cos(rot);
  const xLabelBand  = Math.max(44, Math.min(120, Math.round(rotatedHeight + 10)));

  /* ── wrapper & draw ──────────────────────────────────────── */
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width: 100%;
    height: ${height0}px;
    overflow: hidden;
  `;

  let curMode;             // "EL" | "BA"
  let ro;                  // ResizeObserver
  let roActive = false;

  const draw = (wrapperWidth) => {
    if (!curMode) return; // wait for first mode
    // keys may come from cache or API; resolve per render
    const keys0  = Object.keys(data[0] ?? {});
    const pctKey = resolvePctKey(keys0, classType, curMode);
    console.debug("[alleleChart] class:", classType, "mode:", curMode, "pctKey:", pctKey);

    if (!pctKey) {
      wrapper.innerHTML = "";
      const span = document.createElement("span");
      span.textContent = "No percentile column found in data.";
      span.style.color = "crimson";
      wrapper.appendChild(span);
      return;
    }

    // Prepare rows/peptides
    const rows = data.filter(d => alleles.includes(d.allele));
    const peptides = [...new Set(rows.map(d => d.peptide))].sort(d3.ascending);
    const nRows = peptides.length;
    const nCols = alleles.length;

    if (nRows === 0 || nCols === 0) {
      wrapper.innerHTML = "";
      const span = document.createElement("span");
      span.textContent = "No matching rows for the selected alleles.";
      span.style.fontStyle = "italic";
      wrapper.appendChild(span);
      return;
    }

    // Build lookup
    const lookup = new Map();
    for (const d of rows) {
      const v = +d[pctKey];
      if (Number.isFinite(v)) lookup.set(`${d.allele}|${d.peptide}`, v);
    }

    // Color scale
    const colour = d3.scaleLinear()
      .domain([0, 50, 100])
      .range(["#0074D9", "#ffffff", "#e60000"]);

    // Compute sizes
    const fitH = Math.floor((height0 - margin.top - margin.bottom - xLabelBand) / nRows);
    const fitW = Math.floor((wrapperWidth - margin.left - margin.right) / nCols);
    const cell = Math.max(10, Math.min(baseCell, fitH, fitW));

    const w = margin.left + nCols * cell + margin.right;
    const h = margin.top  + xLabelBand + nRows * cell + margin.bottom;

    // SVG
    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .style("font-family", "sans-serif")
      .style("font-size", 12);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top + xLabelBand})`);

    // Cells
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

    // X labels
    const xg = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top + xLabelBand - 2})`);
    alleles.forEach((al, i) => {
      xg.append("text")
        .attr("transform", `translate(${i * cell + cell / 2}, 0) rotate(-45)`)
        .attr("text-anchor", "start")
        .text(al);
    });

    // Y labels
    const yg = svg.append("g")
      .attr("transform", `translate(${margin.left - 8},${margin.top + xLabelBand})`);
    peptides.forEach((pep, i) => {
      yg.append("text")
        .attr("x", 0)
        .attr("y", i * cell + cell / 2 + 4)
        .attr("text-anchor", "end")
        .text(pep);
    });

    // Commit
    wrapper.innerHTML = "";
    wrapper.appendChild(svg.node());
  };

  // Set up resize observer (activated on first draw)
  ro = new ResizeObserver(entries => {
    for (const e of entries) draw(e.contentRect.width);
  });

  // Handle mode as string OR stream
  if (isAsyncIterable(mode)) {
    // Subscribe; first emission gives current value, then changes
    (async () => {
      for await (const m of mode) {
        curMode = (m === "BA") ? "BA" : "EL";
        if (!roActive) {
          ro.observe(wrapper); // start listening to size after first mode
          roActive = true;
        }
        draw(wrapper.getBoundingClientRect().width);
      }
    })();
  } else {
    // Simple string mode
    curMode = (mode === "BA") ? "BA" : "EL";
    ro.observe(wrapper);
    roActive = true;
    draw(wrapper.getBoundingClientRect().width);
  }

  return wrapper;
}
