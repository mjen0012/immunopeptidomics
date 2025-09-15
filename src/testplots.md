---
theme: [air]
title: Test Plots
slug: test
toc: false
---

<style>
.plot-wrap { display:flex; flex-direction:column; gap: 1rem; }
.controls  { display:flex; flex-wrap:wrap; gap:.75rem 1rem; align-items:center; }
.legend    { display:flex; flex-wrap:wrap; gap:.5rem 1rem; font: 12px/1.2 var(--theme-font-sans, ui-sans-serif, system-ui); }
.legend .swatch { width:12px; height:12px; border-radius:3px; display:inline-block; margin-right:6px; }
.chart     { border:1px solid var(--theme-border,#e5e7eb); border-radius:8px; padding:12px; background: var(--theme-background, #fff); }
.file-heading { font-weight:600; font-size:16px; padding: 4px 0; }
.tooltip { position:absolute; pointer-events:none; background:rgba(17,17,17,0.92); color:#fff; border-radius:6px; padding:8px 10px; font: 12px/1.4 var(--theme-font-sans, ui-sans-serif, system-ui); box-shadow:0 8px 24px rgba(0,0,0,0.25); transform:translate(-50%, -120%); }
</style>

```js
import * as d3 from "npm:d3";
```

```js
// Load annotated predictions (concatenated across proteins)
// Expected columns: protein, allele, peptide, netmhcpan_el_percentile, proportion_all, root, ...
const raw = await FileAttachment("data/predictions_annotated.csv").csv({ typed: true });

// Normalize types and filter to rows where root equals peptide (uploaded “root” peptides)
const rowsAll = raw.map(r => ({
  protein: String(r.protein ?? "").trim(),
  allele: String(r.allele ?? "").trim(),
  peptide: String(r.peptide ?? "").toUpperCase(),
  root: String(r.root ?? "").toUpperCase(),
  proportion_all: +r.proportion_all,
  netmhcpan_el_percentile: +r.netmhcpan_el_percentile
}));

const rows = rowsAll.filter(r => r.peptide && r.root && r.peptide === r.root);

// Unique allele list for control (prepend "All")
const alleleList = ["All", ...Array.from(new Set(rows.map(d => d.allele))).sort()];

// Unique proteins and a color scale
const proteins = Array.from(new Set(rows.map(d => d.protein))).sort();
const colour  = d3.scaleOrdinal(proteins, d3.schemeTableau10);
```

```js
// Allele radio control
const alleleRadio = Inputs.radio(alleleList, { label: "Allele", value: alleleList[0] });
```

```js
// Helper to compute filtered data on demand (root-only)
function getFilteredRows() {
  const sel = alleleRadio.value;
  // Use the pre-filtered root-only dataset to avoid including window peptides
  return rows.filter(r => sel === "All" ? true : r.allele === sel);
}
```

```js
function scatterPlot({ data, width=820, height=460, margin={top:30,right:24,bottom:48,left:54},
                       xAccessor=d=>d.proportion_all,
                       yAccessor=d=>d.netmhcpan_el_percentile,
                       yScaleKind="linear",
                       xLabel="Proportion (all)", yLabel="Percentile (el)",
                       colorScale=colour,
                       tooltipHTML = (d, fmtProp, fmtPct) => (
                         `<div><b>${d.protein}</b> · ${d.allele}</div>`+
                         `<div>${d.peptide}</div>`+
                         `<div>prop_all: ${fmtProp(d.proportion_all)}</div>`+
                         `<div>EL%: ${fmtPct(d.netmhcpan_el_percentile)}</div>`
                       ) }) {
  const W = width, H = height;
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  const svg = d3.create("svg").attr("width", W).attr("height", H);

  const x = d3.scaleLinear()
    .domain(d3.extent(data, xAccessor))
    .nice()
    .range([margin.left, W - margin.right]);

  // y scale: linear or log2 with floor at 0.02 (handles tiny/zero-like values)
  const yFloor = 0.02;
  const yDomainRaw = d3.extent(data, yAccessor);
  const yDomain = [Math.max(yFloor, yDomainRaw[0] ?? yFloor), Math.max(yFloor, yDomainRaw[1] ?? yFloor)];
  const y = yScaleKind === "log2"
    ? d3.scaleLog().base(2).domain(yDomain).nice()
        .range([H - margin.bottom, margin.top])
    : d3.scaleLinear().domain(yDomain).nice()
        .range([H - margin.bottom, margin.top]);

  // axes
  const xAxis = g => g.attr("transform", `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat(d3.format(".2f")))
    .call(g => g.append("text")
      .attr("x", W - margin.right)
      .attr("y", 36)
      .attr("fill", "currentColor")
      .attr("text-anchor", "end")
      .attr("font-weight", 600)
      .text(xLabel));

  const yAxis = g => g.attr("transform", `translate(${margin.left},0)`) 
    .call(yScaleKind === "log2" ? d3.axisLeft(y).ticks(6, "~g") : d3.axisLeft(y))
    .call(g => g.append("text")
      .attr("x", 0)
      .attr("y", -16)
      .attr("fill", "currentColor")
      .attr("text-anchor", "start")
      .attr("font-weight", 600)
      .text(yLabel));

  svg.append("g").call(xAxis);
  svg.append("g").call(yAxis);

  // dots
  const r = 3.0;
  const gDots = svg.append("g")
    .attr("fill", "none")
    .attr("stroke-opacity", 0.9);

  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.style.display = 'none';
  wrap.appendChild(svg.node());
  wrap.appendChild(tip);

  const fmtProp = d3.format(".3f");
  const fmtPct  = d3.format(".2f");

  function showTip(evt, d) {
    tip.innerHTML = tooltipHTML(d, fmtProp, fmtPct);
    const rect = wrap.getBoundingClientRect();
    const ex = evt.clientX - rect.left;
    const ey = evt.clientY - rect.top;
    tip.style.left = `${ex}px`;
    tip.style.top  = `${ey}px`;
    tip.style.display = 'block';
  }
  function hideTip(){ tip.style.display = 'none'; }

  gDots.selectAll("circle")
    .data(data)
    .join("circle")
      .attr("cx", d => x(xAccessor(d)))
      .attr("cy", d => y(Math.max(yFloor, yAccessor(d))))
      .attr("r", r)
      .attr("fill", d => colorScale(d.protein))
      .on("pointerenter", (evt,d)=> showTip(evt,d))
      .on("pointermove", (evt,d)=> showTip(evt,d))
      .on("pointerleave", hideTip);

  return wrap;
}
```

```js
// Build a static legend node
const legend = (() => {
  const wrap = document.createElement('div');
  wrap.className = 'legend';
  for (const p of proteins) {
    const item = document.createElement('span');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = colour(p);
    item.appendChild(sw);
    item.appendChild(document.createTextNode(p));
    wrap.appendChild(item);
  }
  return wrap;
})();

// Reactive chart containers (return DOM nodes, update on allele change)
function reactiveChart({ yScaleKind = 'linear', yLabel }) {
  const mount = document.createElement('div');
  mount.className = 'chart';
  const render = () => {
    const w = Math.max(360, Math.round(mount.getBoundingClientRect().width || 820));
    const node = scatterPlot({ data: getFilteredRows(), yScaleKind, yLabel, width: w });
    mount.replaceChildren(node);
  };
  render();
  (async () => { for await (const _ of Generators.input(alleleRadio)) render(); })();
  // Re-render on resize for responsiveness
  if ('ResizeObserver' in globalThis) {
    const ro = new ResizeObserver(() => render());
    queueMicrotask(() => ro.observe(mount));
    if (typeof invalidation !== 'undefined' && invalidation?.then) invalidation.then(() => ro.disconnect());
  }
  return mount;
}

const chartLinear = reactiveChart({ yScaleKind: 'linear' });
const chartLog    = reactiveChart({ yScaleKind: 'log2',   yLabel: 'Percentile (el) (log2)' });
```

<div class="plot-wrap">
  <div class="controls">${alleleRadio} ${legend}</div>
  <div class="file-heading">1) Root peptides only (linear y-axis)</div>
  ${chartLinear}
  <div class="file-heading">2) Root peptides only (log2 y-axis, floor 0.02)</div>
  ${chartLog}
  </div>

```js
// 3) Binders-per-peptide chart (y = count of alleles with EL% ≤ 2 for each root peptide)
// Build aggregated dataset per protein+peptide.
const rootGroups = d3.rollup(rows, v => ({
  protein: v[0].protein,
  peptide: v[0].peptide,
  proportion_all: v[0].proportion_all,
  binders: v.reduce((acc,d) => acc + ((+d.netmhcpan_el_percentile) <= 2 ? 1 : 0), 0),
  alleles: new Set(v.map(d => d.allele)).size
}), d => `${d.protein}|${d.peptide}`);
const rowsBinders = Array.from(rootGroups.values());

function scatterBinders({ width=820, height=460, margin={top:30,right:24,bottom:48,left:54} }){
  // Reuse scatterPlot by passing a custom yAccessor and yLabel; tooltips adapted.
  // Forge data records compatible with scatterPlot's tooltip expectations.
  const data = rowsBinders.map(r => ({
    protein: r.protein,
    allele: `${r.binders}/${r.alleles} binders`,
    peptide: r.peptide,
    proportion_all: r.proportion_all,
    netmhcpan_el_percentile: r.binders // hijack field to carry y value
  }));
  return scatterPlot({
    data, width, height, margin,
    yScaleKind: 'linear', yLabel: 'Binder count',
    tooltipHTML: (d, fmtProp) => (
      `<div><b>${d.protein}</b></div>`+
      `<div>${d.peptide}</div>`+
      `<div>prop_all: ${fmtProp(d.proportion_all)}</div>`+
      `<div>binders: ${d.netmhcpan_el_percentile}</div>`
    )
  });
}

function reactiveChartBinders(){
  const mount = document.createElement('div');
  mount.className = 'chart';
  const render = () => {
    const w = Math.max(360, Math.round(mount.getBoundingClientRect().width || 820));
    const node = scatterBinders({ width: w });
    mount.replaceChildren(node);
  };
  render();
  if ('ResizeObserver' in globalThis) {
    const ro = new ResizeObserver(() => render());
    queueMicrotask(() => ro.observe(mount));
    if (typeof invalidation !== 'undefined' && invalidation?.then) invalidation.then(() => ro.disconnect());
  }
  return mount;
}

const chartBinders = reactiveChartBinders();
```

<div class="file-heading">3) Root peptides: y = number of allele binders (EL% ≤ 2)</div>
${chartBinders}

```js
// 4) Windows-aware conservation score per root peptide (across all alleles)
// For each root peptide, and for each allele where the ROOT has EL% ≤ 2,
// sum the proportion_all for ALL peptides whose root includes this peptide and
// also have EL% ≤ 2 for that allele. Count those peptides as "windows".

// Build set of qualifying (protein|root|allele) where root itself ≤ 2
const qualifies = new Set(
  rows
    .filter(r => (+r.netmhcpan_el_percentile) <= 2)
    .map(r => `${r.protein}|${r.peptide}|${r.allele}`)
);

// Aggregate across rowsAll
const winAgg = new Map(); // key: protein|root -> { protein, peptide, score, count, alleles:Set }
for (const r of rowsAll) {
  const roots = String(r.root || '').split(';').map(s => s.trim()).filter(Boolean);
  if (!roots.length) continue;
  for (const rt of roots) {
    const keyQA = `${r.protein}|${rt}|${r.allele}`;
    if (!qualifies.has(keyQA)) continue;                 // root not ≤2 for this allele
    if ((+r.netmhcpan_el_percentile) > 2) continue;     // this peptide not ≤2 for this allele

    const k = `${r.protein}|${rt}`;
    let e = winAgg.get(k);
    if (!e) {
      e = { protein: r.protein, peptide: rt, score: 0, count: 0, alleles: new Set() };
      winAgg.set(k, e);
    }
    e.score += (+r.proportion_all) || 0;
    e.count += 1;
    e.alleles.add(r.allele);
  }
}
const rowsWindows = Array.from(winAgg.values()).map(e => ({
  protein: e.protein,
  peptide: e.peptide,
  score: e.score,
  count: e.count,
  alleleCount: e.alleles.size
}));

function scatterWindows({ width=820, height=460, margin={top:30,right:24,bottom:48,left:54} }) {
  // Adapt to scatterPlot with custom accessors and tooltip
  return scatterPlot({
    data: rowsWindows,
    width, height, margin,
    yScaleKind: 'linear',
    xAccessor: d => d.score,
    yAccessor: d => d.count,
    xLabel: 'Windows score (sum of prop_all ≤ 2)',
    yLabel: 'Windows count (≤ 2)',
    tooltipHTML: (d, fmtProp) => (
      `<div><b>${d.protein}</b></div>`+
      `<div>${d.peptide}</div>`+
      `<div>score: ${fmtProp(d.score)}</div>`+
      `<div>windows: ${d.count} · alleles: ${d.alleleCount}</div>`
    )
  });
}

function reactiveChartWindows(){
  const mount = document.createElement('div');
  mount.className = 'chart';
  const render = () => {
    const w = Math.max(360, Math.round(mount.getBoundingClientRect().width || 820));
    const node = scatterWindows({ width: w });
    mount.replaceChildren(node);
  };
  render();
  if ('ResizeObserver' in globalThis) {
    const ro = new ResizeObserver(() => render());
    queueMicrotask(() => ro.observe(mount));
    if (typeof invalidation !== 'undefined' && invalidation?.then) invalidation.then(() => ro.disconnect());
  }
  return mount;
}

const chartWindows = reactiveChartWindows();
```

<div class="file-heading">4) Root peptides: windows score and count (EL% ≤ 2)</div>
${chartWindows}
```

```js
// 5) Windows-aware score/count per root peptide filtered by selected allele
// For the chosen allele, require the ROOT to have EL% <= 2 for that allele,
// then sum/count window peptides (any peptide whose roots include the ROOT) with EL% <= 2 for that allele.

function rowsWindowsForAllele(allele) {
  if (allele === "All") return rowsWindows; // fall back to all-alleles aggregate (chart 4 dataset)

  // Qualifying set: (protein|root|allele) where the root itself is <= 2 for the selected allele
  const qualifies = new Set(
    rows
      .filter(r => r.allele === allele && (+r.netmhcpan_el_percentile) <= 2)
      .map(r => `${r.protein}|${r.peptide}|${r.allele}`)
  );

  const agg = new Map(); // key: protein|root -> { protein, peptide, score, count }
  for (const r of rowsAll) {
    if (r.allele !== allele) continue;
    const roots = String(r.root || '').split(';').map(s => s.trim()).filter(Boolean);
    if (!roots.length) continue;
    if ((+r.netmhcpan_el_percentile) > 2) continue; // this peptide not <= 2 for this allele
    for (const rt of roots) {
      const keyQA = `${r.protein}|${rt}|${r.allele}`;
      if (!qualifies.has(keyQA)) continue; // root doesn't qualify for this allele
      const k = `${r.protein}|${rt}`;
      let e = agg.get(k);
      if (!e) {
        e = { protein: r.protein, peptide: rt, score: 0, count: 0 };
        agg.set(k, e);
      }
      e.score += (+r.proportion_all) || 0;
      e.count += 1;
    }
  }
  return Array.from(agg.values());
}

function scatterWindowsAllele({ width=820, height=460, margin={top:30,right:24,bottom:48,left:54} }) {
  const sel = alleleRadio.value;
  const data = rowsWindowsForAllele(sel);
  const isAll = sel === "All";
  return scatterPlot({
    data,
    width, height, margin,
    yScaleKind: 'linear',
    xAccessor: d => d.score,
    yAccessor: d => d.count,
    xLabel: 'Windows score (sum of prop_all <= 2)',
    yLabel: 'Windows count (<= 2)',
    tooltipHTML: (d, fmtProp) => (
      isAll
        ? (`<div><b>${d.protein}</b></div>`+
           `<div>${d.peptide}</div>`+
           `<div>score: ${fmtProp(d.score)}</div>`+
           `<div>windows: ${d.count}</div>`)
        : (`<div><b>${d.protein}</b> | ${sel}</div>`+
           `<div>${d.peptide}</div>`+
           `<div>score: ${fmtProp(d.score)}</div>`+
           `<div>windows: ${d.count}</div>`)
    )
  });
}

function reactiveChartWindowsAllele(){
  const mount = document.createElement('div');
  mount.className = 'chart';
  const render = () => {
    const w = Math.max(360, Math.round(mount.getBoundingClientRect().width || 820));
    const node = scatterWindowsAllele({ width: w });
    mount.replaceChildren(node);
  };
  render();
  (async () => { for await (const _ of Generators.input(alleleRadio)) render(); })();
  if ('ResizeObserver' in globalThis) {
    const ro = new ResizeObserver(() => render());
    queueMicrotask(() => ro.observe(mount));
    if (typeof invalidation !== 'undefined' && invalidation?.then) invalidation.then(() => ro.disconnect());
  }
  return mount;
}

const chartWindowsAllele = reactiveChartWindowsAllele();
```

<div class="file-heading">5) Root peptides: windows score and count by allele (EL% <= 2)</div>
${chartWindowsAllele}
