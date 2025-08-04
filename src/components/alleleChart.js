/*****************************************************************
 *  alleleChart() → HTMLElement   ·   v12
 *  - Accurate top band for rotated allele labels
 *  - Optional auto height (height0: null)
 *  - Mode can be string | AsyncGenerator | HTMLInput-like element
 *  - Tooltip on cell hover: peptide, allele, EL%, BA%
 *****************************************************************/
import * as d3 from "npm:d3";

export function alleleChart({
  data       = [],
  alleles    = [],
  mode       = "EL",                  // "EL" | "BA" | AsyncGenerator | radio element
  classType  = "I",                   // "I"  | "II"
  baseCell   = 28,
  height0    = null,                  // ← null ⇒ auto height
  margin     = { top: 4, right: 24, bottom: 24, left: 140 },
  showNumbers = false
} = {}) {

  /* ── guards ───────────────────────────────────────────────── */
  if (!alleles?.length || !data?.length) {
    const span = document.createElement("span");
    span.textContent =
      "Select alleles to see cached results (then click Run for fresh predictions).";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── helpers ─────────────────────────────────────────────── */
  const isAsyncIterable = (v) => v && typeof v[Symbol.asyncIterator] === "function";
  const isEventTarget   = (v) => v && typeof v.addEventListener === "function" && "value" in v;
  const normMode        = (m) => (String(m).toUpperCase().includes("BA") ? "BA" : "EL");

  function resolvePctKey(keys, cls, m) {
    const norm = s => String(s).toLowerCase().replace(/[\s_-]+/g, "");
    const lut  = new Map(keys.map(k => [norm(k), k]));
    const cI_EL  = ["netmhcpan_el_percentile","netmhcpanelpercentile","elpercentile"];
    const cI_BA  = ["netmhcpan_ba_percentile","netmhcpanbapercentile","bapercentile"];
    const cII_EL = ["netmhciipan_el_percentile","netmhciipanelpercentile","elpercentile"];
    const cII_BA = ["netmhciipan_ba_percentile","netmhciipanbapercentile","bapercentile"];
    const cands  = cls === "I" ? (m === "EL" ? cI_EL : cI_BA)
                               : (m === "EL" ? cII_EL : cII_BA);
    for (const c of cands) if (lut.has(c)) return lut.get(c);
    const rx = (m === "EL") ? /el.*percent/i : /ba.*percent/i;
    const found = keys.find(k => rx.test(k));
    return found ?? null;
  }

  /* ── DOM wrapper ─────────────────────────────────────────── */
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    position: relative;               /* for absolute tooltip */
    width: 100%;
    ${height0 ? `height:${height0}px;` : ""} /* auto height when null */
    overflow: hidden;
  `;

  // simple HTML tooltip inside wrapper
  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "absolute",
    top: "0px",
    left: "0px",
    transform: "translate(12px, 12px)",
    background: "rgba(255,255,255,0.98)",
    border: "1px solid #ddd",
    borderRadius: "6px",
    padding: "6px 8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
    font: "12px/1.35 sans-serif",
    pointerEvents: "none",
    display: "none",
    zIndex: 10
  });

  const tipShow = (html, x, y) => {
    tip.innerHTML = html;
    tip.style.display = "block";
    // keep inside the wrapper
    const rect = wrapper.getBoundingClientRect();
    // temporarily place, measure, then clamp
    tip.style.left = `${x - rect.left}px`;
    tip.style.top  = `${y - rect.top }px`;
    const tw = tip.offsetWidth || 160;
    const th = tip.offsetHeight || 60;
    let L = x - rect.left + 12, T = y - rect.top + 12;
    if (L + tw + 8 > rect.width)  L = Math.max(8, rect.width - tw - 8);
    if (T + th + 8 > rect.height) T = Math.max(8, rect.height - th - 8);
    tip.style.left = `${L}px`;
    tip.style.top  = `${T}px`;
  };
  const tipHide = () => { tip.style.display = "none"; };

  wrapper.appendChild(tip);

  let curMode;                     // "EL" | "BA"
  let ro;                          // ResizeObserver
  let roActive = false;
  let disposed = false;
  let renderTick = 0;
  let removeModeListener = null;

  const cleanup = () => {
    disposed = true;
    try { ro && ro.disconnect(); } catch {}
    try { removeModeListener && removeModeListener(); } catch {}
  };

  // stop work if wrapper gets detached
  const detObs = new MutationObserver(() => {
    if (!wrapper.isConnected) {
      cleanup();
      detObs.disconnect();
    }
  });
  detObs.observe(document.documentElement, { childList: true, subtree: true });

  /* ── measure rotated label band accurately ───────────────── */
  function measureLabelBand(fontSize = 12, fontFamily = "sans-serif") {
    if (!alleles.length) return 36; // fallback
    const temp = d3.create("svg")
      .attr("width", 10).attr("height", 10)
      .style("position", "absolute")
      .style("left", "-20000px")
      .style("top",  "-20000px")
      .style("visibility", "hidden");
    document.body.appendChild(temp.node());
    let maxAbove = 0;
    for (const text of alleles) {
      const t = temp.append("text")
        .text(text)
        .attr("transform", "rotate(-45)")
        .style("font-family", fontFamily)
        .style("font-size", `${fontSize}px`);
      const b = t.node().getBBox();
      maxAbove = Math.max(maxAbove, -b.y);
      t.remove();
    }
    temp.remove();
    return Math.max(24, Math.min(72, Math.round(maxAbove + 4))); // tighter minimum
  }

  /* ── draw ────────────────────────────────────────────────── */
  const draw = (wrapperWidth) => {
    if (disposed || !curMode) return;

    const keys0   = Object.keys(data[0] ?? {});
    const pctKey  = resolvePctKey(keys0, classType, curMode);
    const elKey   = resolvePctKey(keys0, classType, "EL");
    const baKey   = resolvePctKey(keys0, classType, "BA");

    wrapper.replaceChildren();      // clear (including old svg), keep tooltip separate
    wrapper.appendChild(tip);       // re-attach tooltip

    if (!pctKey) {
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
      const span = document.createElement("span");
      span.textContent = "No matching rows for the selected alleles.";
      span.style.fontStyle = "italic";
      wrapper.appendChild(span);
      return;
    }

    // lookups for active mode and for both EL/BA (tooltip)
    const lookupPct = new Map();
    const lookupEL  = new Map();
    const lookupBA  = new Map();
    for (const d of rows) {
      const key = `${d.allele}|${d.peptide}`;
      const vp  = +(d[pctKey]);
      if (Number.isFinite(vp)) lookupPct.set(key, vp);
      if (elKey && Number.isFinite(+d[elKey])) lookupEL.set(key, +d[elKey]);
      if (baKey && Number.isFinite(+d[baKey])) lookupBA.set(key, +d[baKey]);
    }

    const colour = d3.scaleLinear().domain([0, 50, 100]).range(["#0074D9", "#ffffff", "#e60000"]);

    const topPad     = Math.max(0, margin?.top ?? 4);
    const xLabelBand = measureLabelBand(12, "sans-serif");

    const fitH = Math.floor(((height0 ?? 1e9) - topPad - margin.bottom - xLabelBand) / nRows);
    const fitW = Math.floor((wrapperWidth - margin.left - margin.right) / nCols);
    const cell = Math.max(10, Math.min(baseCell, isFinite(fitH) ? fitH : baseCell, fitW));

    const w = margin.left + nCols * cell + margin.right;
    const h = topPad + xLabelBand + nRows * cell + margin.bottom;

    if (!height0) wrapper.style.height = `${h}px`;

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width",  "100%")
      .attr("height", "100%")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .style("font-family", "sans-serif")
      .style("font-size", 12);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${topPad + xLabelBand})`);

    const fmt = (v) => (v == null || Number.isNaN(v) ? "—" : `${(+v).toFixed(1)}`);

    for (let yi = 0; yi < nRows; yi++) {
      const pep = peptides[yi];
      for (let xi = 0; xi < nCols; xi++) {
        const al  = alleles[xi];
        const key = `${al}|${pep}`;
        const val = lookupPct.get(key);

        const r = g.append("rect")
          .attr("x", xi * cell + 0.5)
          .attr("y", yi * cell + 0.5)
          .attr("width",  cell - 1)
          .attr("height", cell - 1)
          .attr("fill", val == null ? "#f0f0f0" : colour(val));

        // numbers inside cell (optional)
        if (showNumbers && val != null) {
          g.append("text")
            .attr("x", xi * cell + cell / 2)
            .attr("y", yi * cell + cell / 2 + 3)
            .attr("text-anchor", "middle")
            .attr("pointer-events", "none")
            .attr("font-size", Math.round(cell * 0.42))
            .text(val.toFixed(1));
        }

        // tooltip handlers
        r.on("mouseenter", (ev) => {
            const elV = lookupEL.get(key);
            const baV = lookupBA.get(key);
            tipShow(
              `<div style="font-weight:600; margin-bottom:2px;">${pep}</div>
               <div style="margin-bottom:4px;">${al}</div>
               <div>EL percentile: <b>${fmt(elV)}</b></div>
               <div>BA percentile: <b>${fmt(baV)}</b></div>`,
              ev.clientX, ev.clientY
            );
          })
         .on("mousemove", (ev) => {
            // keep the same content; just move
            tipShow(tip.innerHTML, ev.clientX, ev.clientY);
          })
         .on("mouseleave", tipHide);
      }
    }

    // X labels
    const xg = svg.append("g").attr("transform", `translate(${margin.left},${topPad + xLabelBand - 2})`);
    alleles.forEach((al, i) => {
      xg.append("text")
        .attr("transform", `translate(${i * cell + cell / 2}, 0) rotate(-45)`)
        .attr("text-anchor", "start")
        .text(al);
    });

    // Y labels
    const yg = svg.append("g").attr("transform", `translate(${margin.left - 8},${topPad + xLabelBand})`);
    peptides.forEach((pep, i) => {
      yg.append("text")
        .attr("x", 0)
        .attr("y", i * cell + cell / 2 + 4)
        .attr("text-anchor", "end")
        .text(pep);
    });

    wrapper.appendChild(svg.node());
  };

  const scheduleDraw = () => {
    const myTick = ++renderTick;
    const width = wrapper.getBoundingClientRect().width || wrapper.clientWidth || 800;
    requestAnimationFrame(() => {
      if (disposed) return;
      if (myTick !== renderTick) return; // newer toggle wins
      draw(width);
    });
  };

  // resize observer
  ro = new ResizeObserver(entries => {
    if (disposed) return;
    for (const e of entries) draw(e.contentRect.width);
  });

  /* ── initialize & subscribe to mode changes ───────────────── */
  if (isEventTarget(mode)) {
    const getVal = () => normMode(mode.value);
    const onInput = () => {
      const nm = getVal();
      if (nm === curMode) return;
      curMode = nm;
      scheduleDraw();
    };
    curMode = getVal();
    mode.addEventListener("input", onInput);
    removeModeListener = () => mode.removeEventListener("input", onInput);
    ro.observe(wrapper); roActive = true;
    scheduleDraw();
  }
  else if (isAsyncIterable(mode)) {
    (async () => {
      let first = true;
      for await (const m of mode) {
        if (disposed) break;
        const nm = normMode(m);
        if (nm === curMode && !first) continue;
        curMode = nm;
        if (!roActive) { ro.observe(wrapper); roActive = true; }
        scheduleDraw();
        first = false;
      }
    })();
  }
  else {
    curMode = normMode(mode);
    ro.observe(wrapper); roActive = true;
    scheduleDraw();
  }

  return wrapper;
}
