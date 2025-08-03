/*****************************************************************
 *  alleleChart() → HTMLElement   ·   v8
 *  - Accepts mode as string OR AsyncGenerator (Generators.input)
 *  - Dedupes mode changes, latest-toggle-wins rendering
 *  - Cleans up observers when detached (no zombie draws)
 *  - Prevents top clipping of allele labels (label band)
 *  - Robust percentile key resolution (EL/BA, spaces/underscores)
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
  const normMode = (m) => (String(m).toUpperCase().includes("BA") ? "BA" : "EL");

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

  let curMode;                 // "EL" | "BA"
  let ro;                      // ResizeObserver
  let roActive = false;
  let disposed = false;
  let renderTick = 0;          // latest-toggle-wins counter

  const cleanup = () => {
    disposed = true;
    try { ro && ro.disconnect(); } catch {}
  };

  // If this element ever gets detached, stop listening/resizing
  const detObs = new MutationObserver(() => {
    if (!wrapper.isConnected) {
      cleanup();
      detObs.disconnect();
    }
  });
  // Observe the whole document for removals (cheap enough here)
  detObs.observe(document.documentElement, { childList: true, subtree: true });

  const draw = (wrapperWidth) => {
    if (disposed || !curMode) return;

    const keys0  = Object.keys(data[0] ?? {});
    const pctKey = resolvePctKey(keys0, classType, curMode);
    console.debug("[alleleChart] class:", classType, "mode:", curMode, "pctKey:", pctKey);

    if (!pctKey) {
      wrapper.replaceChildren();
      const span = document.createElement("span");
      span.textContent = "No percentile column found in data.";
      span.style.color = "crimson";
      wrapper.appendChild(span);
      return;
    }

    const rows = data.filter(d => alleles.includes(d.allele));
    const peptides = [...new Set(rows.map(d => d.peptide))].sort(d3.ascending);
    const nRows = peptides.length;
    const nCols = alleles.length;

    if (nRows === 0 || nCols === 0) {
      wrapper.replaceChildren();
      const span = document.createElement("span");
      span.textContent = "No matching rows for the selected alleles.";
      span.style.fontStyle = "italic";
      wrapper.appendChild(span);
      return;
    }

    const lookup = new Map();
    for (const d of rows) {
      const v = +d[pctKey];
      if (Number.isFinite(v)) lookup.set(`${d.allele}|${d.peptide}`, v);
    }

    const colour = d3.scaleLinear().domain([0, 50, 100]).range(["#0074D9", "#ffffff", "#e60000"]);

    const fitH = Math.floor((height0 - margin.top - margin.bottom - xLabelBand) / nRows);
    const fitW = Math.floor((wrapperWidth - margin.left - margin.right) / nCols);
    const cell = Math.max(10, Math.min(baseCell, fitH, fitW));

    const w = margin.left + nCols * cell + margin.right;
    const h = margin.top  + xLabelBand + nRows * cell + margin.bottom;

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .style("font-family", "sans-serif")
      .style("font-size", 12);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + xLabelBand})`);

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

    const xg = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + xLabelBand - 2})`);
    alleles.forEach((al, i) => {
      xg.append("text")
        .attr("transform", `translate(${i * cell + cell / 2}, 0) rotate(-45)`)
        .attr("text-anchor", "start")
        .text(al);
    });

    const yg = svg.append("g").attr("transform", `translate(${margin.left - 8},${margin.top + xLabelBand})`);
    peptides.forEach((pep, i) => {
      yg.append("text")
        .attr("x", 0)
        .attr("y", i * cell + cell / 2 + 4)
        .attr("text-anchor", "end")
        .text(pep);
    });

    wrapper.replaceChildren(svg.node());
  };

  const scheduleDraw = () => {
    const myTick = ++renderTick;
    const width = wrapper.getBoundingClientRect().width || wrapper.clientWidth || 800;
    // ensure latest-toggle wins if multiple toggles happen quickly
    requestAnimationFrame(() => {
      if (disposed) return;
      if (myTick !== renderTick) return; // a newer toggle arrived; skip
      draw(width);
    });
  };

  // Resize observer: redraw on container width changes
  ro = new ResizeObserver(entries => {
    if (disposed) return;
    for (const e of entries) draw(e.contentRect.width);
  });

  // Initialize & subscribe to mode changes
  if (isAsyncIterable(mode)) {
    (async () => {
      let first = true;
      for await (const m of mode) {
        if (disposed) break;
        const nm = normMode(m);
        if (nm === curMode && !first) continue; // dedupe repeats
        curMode = nm;
        if (!roActive) { ro.observe(wrapper); roActive = true; }
        scheduleDraw();
        first = false;
      }
    })();
  } else {
    curMode = normMode(mode);
    ro.observe(wrapper);
    roActive = true;
    scheduleDraw();
  }

  return wrapper;
}
