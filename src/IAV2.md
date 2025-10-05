---
theme: [wide, air, alt]
title: Influenza A (IAV) with netMHC
slug: IAV
toc: false
---

<!-- Banner -->
```js
const banner = await FileAttachment("banner_static.jpg").image();
banner.alt = "";
banner.className = "banner__bg";
```

```js
// Responsive dashboard renderer (fills the card height and resizes on layout changes)
function createIAVDashboardResponsive({
  rowHeight   = 18,
  gap         = 2,
  sizeFactor  = 1.8,
  margin      = {top:20,right:20,bottom:12,left:56}
} = {}){
  const root = document.createElement('div');
  root.style.width = '100%';
  root.style.display = 'block';
  root.style.height = 'auto';
  root.style.minHeight = '0';

  // ===== TUNABLE CONSTANTS (adjust to tweak behaviour) =====
  // Per-chart height bounds (px)
  const MIN_PER_CHART   = 90;        // minimum height a chart can shrink to
  const MAX_PER_CHART   = 200;       // cap so charts don't get too tall
  // Extra offsets inside the SVG stack (px)
  const SVG_TOP_OFFSET    = 0;       // base space before the first (peptide) chart
  const SVG_BOTTOM_OFFSET = 0;       // base space after the last (conservation) chart
  
  // schedule renders to avoid thrash when many observers fire at once
  let framePending = false;
  const scheduleRender = () => {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => { framePending = false; render(); });
  };

  const render = () => {
    const t0 = performance.now();
    root.innerHTML = '';

    // Derive per-chart height from available container space (4 primary charts)
    const nPrimary = 4;
    // Prefer actual space the dashboard root currently has (fills the card)
    let avail = Math.floor(root.getBoundingClientRect().height);
    if (!(avail > 0)) {
      // Fallback until ResizeObserver ticks
      avail = Math.round(140*sizeFactor*nPrimary);
    }

    const availAdj = Math.max(0, avail - SVG_TOP_OFFSET - SVG_BOTTOM_OFFSET);
    const perRaw   = Math.floor(availAdj / nPrimary) || Math.round(140*sizeFactor);
    const perH     = Math.max(MIN_PER_CHART, Math.min(perRaw, MAX_PER_CHART));

    // --- Build a fresh dashboard SVG (re-using existing chart components) ---
    // Avoid hard dependencies; use globals and defaults so we can render immediately.
    const proteinNow = (globalThis.__committedProteinId || globalThis.DEFAULT_PROTEIN || 'M1');
    const pepData = (Array.isArray(globalThis.__peptidesAligned) ? globalThis.__peptidesAligned : [])
      .filter(d => d.protein === proteinNow);
    const colourAttrNow = (globalThis.__colourAttrNow != null ? globalThis.__colourAttrNow : 'Proportion');
    const selI = Array.isArray(globalThis.__selectedI) ? globalThis.__selectedI : [];
    const percModeNow = (globalThis.__percMode != null ? globalThis.__percMode : 'EL');
    const inProportionMode = (String(colourAttrNow) === 'Proportion');
    // Always use Proportion mode immediately; if the getter isn't ready yet, fall back to 0 so bars are light (not grey)
    const useProp = inProportionMode;
    const pepDataForChart = useProp
      ? pepData.map(d => ({
          ...d,
          attribute_1: (typeof globalThis.__getPeptideProportion === 'function')
                        ? globalThis.__getPeptideProportion(d)
                        : (typeof d.proportion === 'number' ? d.proportion : 0)
        }))
      : pepData;
    const colourByForChart = useProp ? 'attribute_1' : colourAttrNow;
    let colourScale = null;
    const normAllele = s => String(s || '').toUpperCase().replace(/^HLA-/, '').trim();
    const isAlleleNow = (!inProportionMode && !/^attribute_[123]$/i.test(String(colourAttrNow)) && selI.some(a => normAllele(a) === normAllele(colourAttrNow)));
    if (!isAlleleNow) {
      if (useProp) {
        colourScale = v => d3.interpolateBlues(Math.max(0, Math.min(1, Number(v))));
      } else {
        const vals = pepData.map(d => d?.[colourAttrNow]);
        const keys = [...new Set(vals.filter(v => v != null && String(v).trim() !== "").map(String))].sort();
        colourScale = makePeptideScale(keys.length ? keys : ["dummy"]);
      }
    }

    const stackedBarsSafe = Array.isArray(globalThis.__stackedBars) ? globalThis.__stackedBars : [];
    const maxPos = Math.max(
      pepData.length ? d3.max(pepData, d => d.start + d.length) : 1,
      (stackedBarsSafe.length ? d3.max(stackedBarsSafe, d => d.position) : 1)
    );
    const svgWidth = (typeof width !== 'undefined' ? width : 900);
    const x0       = d3.scaleLinear([0.5, maxPos + 0.5], [margin.left, svgWidth - margin.right]);
    let   xCurrent = x0;

    const svg = d3.create('svg').style('width','100%').attr('font-family','sans-serif');
    const content = svg.append('g'); // charts live under this group so we can shift them
    let yOff = 0; // accumulate chart heights only; we will add top/bottom pad later
    const slot = () => content.append('g').attr('transform',`translate(0,${yOff})`);

    const addYLabel = (g,h,text) => {
      const x = Math.max(8, margin.left * 0.5); const y = h/2;
      let ff = 'Roboto, sans-serif', fw = 500, fs = 18, fc = '#222';
      try { const t = document.querySelector('.metric-card h2'); if (t){ const cs = getComputedStyle(t); ff = cs.fontFamily||ff; fw = cs.fontWeight||fw; fs = parseFloat(cs.fontSize)||fs; fc = cs.color||fc; } } catch {}
      g.append('text')
        .attr('transform',`translate(${x},${y}) rotate(-90)`).attr('text-anchor','middle').attr('dominant-baseline','middle')
        .style('font-family',ff).attr('font-weight',fw).attr('font-size',fs).attr('fill',fc)
        .style('pointer-events','none').text(text);
    };

    const computeLevels = rows => { const arr = Array.isArray(rows) ? rows.slice().sort((a,b)=>d3.ascending(a.start,b.start)) : []; const levels=[]; for (const p of arr){ let lvl = levels.findIndex(end => p.start >= end); if (lvl === -1){ lvl = levels.length; levels.push(0); } levels[lvl] = p.start + p.length; } return Math.max(1, levels.length); };

    // Peptides (cap row height for consistency)
    // Use smaller top margin on the first chart to reduce top card gap
    const marginFirst = { ...margin, top: 4 };
    const marginMid   = { ...margin };
    const marginLast  = { ...margin, bottom: 6 };
    const gPep = slot();
    let pep = { update: () => {}, height: perH };
    let pepBlockHeight = perH;
    if (!pepDataForChart.length) {
      gPep.append('text')
        .attr('x', marginFirst.left)
        .attr('y', marginFirst.top + 14)
        .attr('font-style', 'italic')
        .attr('fill', '#555')
        .text('Upload peptides to view tracks.');
      addYLabel(gPep, pepBlockHeight, 'Peptides');
      yOff += pepBlockHeight;
    } else {
      const nLevels = computeLevels(pepDataForChart);
      const pepBaseInner = Math.max(24, perH - marginFirst.top - marginFirst.bottom);
      const pepTargetRH = Math.max(12, Math.round(16 * sizeFactor));
      const pepRowHeight = Math.max(7, Math.min(pepTargetRH, pepBaseInner / Math.max(1, nLevels)));
      const alleleDataForChart = selI.length ? (globalThis.__chartRowsI || []) : [];
      pep = peptideChart(gPep, { data:pepDataForChart, xScale:xCurrent, rowHeight:pepRowHeight, gap, sizeFactor, margin: marginFirst,
        colourBy:colourByForChart, colourScale, isAlleleColour:isAlleleNow, missingColor:'#f0f0f0', alleleData:alleleDataForChart,
        alleles:selI, percentileMode:percModeNow,
        onClick:d=>{ setSelectedPeptide(d.peptide_aligned); setSelectedStart(d.start); setSelectedLength(d.length); } });
      const fallbackPepHeight = marginFirst.top + marginFirst.bottom + nLevels * pepRowHeight;
      const measuredPepHeight = (pep && typeof pep.height === 'number') ? pep.height : fallbackPepHeight;
      const neededPepHeight = Math.max(fallbackPepHeight, measuredPepHeight);
      pepBlockHeight = Math.max(perH, neededPepHeight);
      addYLabel(gPep, pepBlockHeight, 'Peptides');
      yOff += pepBlockHeight;
    }

    // Sequences
    const gSeq = slot(); const seqGapRows = Math.max(20, Math.round(28 * sizeFactor));
    const seqCell = Math.max(12, Math.floor((perH - margin.top - margin.bottom - seqGapRows)/2));
    const refRowsNow = Array.isArray(globalThis.__refRows) ? globalThis.__refRows : [];
    const consRowsNow = Array.isArray(globalThis.__consensusRows) ? globalThis.__consensusRows : [];
    const seqcmp = sequenceCompareChart(gSeq, { refRows:refRowsNow, consRows:consRowsNow, xScale:xCurrent, colourMode:(typeof colourMode!=='undefined'?colourMode:'Mismatches'), sizeFactor, margin: marginMid, gapRows:seqGapRows, cell:seqCell });
    addYLabel(gSeq, perH, 'Sequences');
    yOff += perH;

    // Diversity
    const gStack = slot();
    const aaFreqNow = Array.isArray(globalThis.__aaFrequencies) ? globalThis.__aaFrequencies : [];
    const stack = stackedChart(gStack, { data: stackedBarsSafe, tooltipRows: aaFreqNow.map(d=>({position:d.position, aminoacid:d.aminoacid, value:d.value_selected})), xScale:xCurrent, sizeFactor, margin: marginMid, height:perH });
    addYLabel(gStack, perH, 'Diversity');
    yOff += perH;

    // Conservation
    const gArea = slot();
    const areaDataNow = Array.isArray(globalThis.__areaData) ? globalThis.__areaData : [];
    const area = areaChart(gArea, { data: areaDataNow, xScale:xCurrent, sizeFactor, margin: marginLast, height:perH });
    addYLabel(gArea, perH, 'Conservation');
    yOff += perH;

    // Distribute any leftover space equally above and below charts so the block fills the card neatly
    const spare      = Math.max(0, availAdj - yOff);
    // Keep top padding minimal and consistent; push remaining space below
    const dynTopPad  = SVG_TOP_OFFSET;
    const dynBotPad  = SVG_BOTTOM_OFFSET + spare;
    content.attr('transform', `translate(0,${dynTopPad})`);

    // Finalize & zoom
    const totalH = yOff + dynTopPad + dynBotPad;
    const svgH = Math.max(1, Math.round(totalH));
    svg.attr('height', svgH).style('height', `${svgH}px`).attr('viewBox', `0 0 ${svgWidth} ${totalH}`);
    root.style.minHeight = `${svgH}px`;
    root.style.height = `${svgH}px`;
    const updaters = [pep.update, stack.update, seqcmp.update, area.update];
    const EPS=1e-6; const zoom = d3.zoom().scaleExtent([1,15]).translateExtent([[margin.left,0],[svgWidth-margin.right,totalH]]).on('zoom', ev => { if (Math.abs(ev.transform.k-1)<EPS && Math.abs(ev.transform.x)>EPS){ svg.call(zoom.transform, d3.zoomIdentity); return; } xCurrent = ev.transform.rescaleX(x0); updaters.forEach(fn=>fn(xCurrent)); });
    svg.call(zoom);

    root.appendChild(svg.node());
  };

  // Re-render on container or left-panel changes without forcing explicit heights
  const ro = new ResizeObserver(() => scheduleRender());
  queueMicrotask(()=> ro.observe(root));
  const leftPanel = Array.from(document.querySelectorAll('.layout-20-80 .card'))
    .find(el => el.querySelector('.file-heading')?.textContent?.includes('Control Panel'));
  let roLeft = null;
  if (leftPanel && 'ResizeObserver' in window){
    roLeft = new ResizeObserver(() => scheduleRender());
    roLeft.observe(leftPanel);
  }
  window.addEventListener('resize', scheduleRender);
  // React to data readiness events
  addEventListener('peptides-ready', scheduleRender);
  addEventListener('tallies-ready',  scheduleRender);
  addEventListener('aligned-ready',  scheduleRender);
  // DB-derived series readiness
  addEventListener('aa-ready',       scheduleRender);
  addEventListener('area-ready',     scheduleRender);
  addEventListener('stacked-ready',  scheduleRender);
  // UI controls and async data affecting colours/alleles
  addEventListener('colourAttr-change', scheduleRender);
  addEventListener('allele-change',     scheduleRender);
  addEventListener('alleleRows-ready',  scheduleRender);
  addEventListener('percMode-change',   scheduleRender);
  if (typeof invalidation !== 'undefined' && invalidation?.then) invalidation.then(()=> {
    ro.disconnect(); if (roLeft) roLeft.disconnect();
    window.removeEventListener('resize', scheduleRender);
    removeEventListener('peptides-ready', scheduleRender);
    removeEventListener('tallies-ready',  scheduleRender);
    removeEventListener('aligned-ready',  scheduleRender);
    removeEventListener('aa-ready',       scheduleRender);
    removeEventListener('area-ready',     scheduleRender);
    removeEventListener('stacked-ready',  scheduleRender);
    removeEventListener('colourAttr-change', scheduleRender);
    removeEventListener('allele-change',     scheduleRender);
    removeEventListener('alleleRows-ready',  scheduleRender);
    removeEventListener('percMode-change',   scheduleRender);
  });

  // initial paint
  render();
  return root;
}
```

<style>
@import url("https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@300;400;700&display=swap");

/* ------------- banner shell --------------------------------------- */
.banner {
  position: relative;
  height: 200px;
  width: 100vw;
  left: 50%;
  margin-left: -50vw;
  margin-top: calc(-1 * var(--observable-layout-spacing-block, 2rem));
  margin-bottom: var(--observable-layout-spacing-block, 1rem);

  background: none;           /* handled by the <img> element */
  display: flex;
  align-items: center;
  padding-left: 4rem;
  font-family: "Roboto Condensed", sans-serif;
  overflow: hidden;
}

/* background image fills the box */
.banner__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

/* ------------- text ---------------------------------------------- */
.banner__text {
  position: relative;
  z-index: 2;
}
.banner__text h1 {
  margin: 0;
  font-size: 64px;
  font-weight: 400;
  color: #fff;
  line-height: 1;
}
.banner__text h2 {
  margin: 0;
  font-size: 36px;
  font-weight: 300;
  color: #fff;
}

/* ------------- translucent ----------------------------------- */
.banner__logo {
  position: absolute;
  top: 0;
  right: 200px;              /* 30-px inset from edge */
  width: 88px;
  height: 100%;
  fill: rgba(255,255,255,0.30);
  z-index: 1;
  pointer-events: none;
}
</style>

<header class="banner">
  ${banner}

  <div class="banner__text">
    <h1>PEPTIDE VIEWER</h1>
    <h2>Influenza A</h2>
  </div>

  <svg class="banner__logo" viewBox="0 0 1 1" preserveAspectRatio="none">
    <polygon points="0.5745 0,0.5 0.33,0.42 0,0 0,0 1,0.27 1,0.27 0.59,
                     0.37 1,0.634 1,0.736 0.59,0.736 1,1 1,1 0,0.5745 0" />      
  </svg>
</header>

<!-- Dashboard CSS -->

<style>
/* 20 % / 80 % grid with uniform gap */
.layout-20-80 {
  display: grid;
  grid-template-columns: 20% 80%;
  gap: var(--observable-layout-spacing-block, 1rem);
}
/* kill the card??s default margin so gap rules all */
.layout-20-80 .card { margin: 0; }

/* mobile */
@media (max-width: 640px) {
  .layout-20-80 { grid-template-columns: 1fr; }
}

/* left-hand small headings */
.file-heading {
  font-family: "Roboto", sans-serif;
  font-weight: 700;
  font-size: 20px;
  margin: 0 0 0.5rem 0;
  color: #000;
}
</style>

<!-- HTML -->
<div class="layout-20-80">

  <!-- Row 1 20 % Select files -->
  <div class="card" style="display:flex; flex-direction:column; gap:1rem;">
    <div class="file-heading">1. Select Files</div>
    ${referencefasta}
    ${peptideinput}
    <div class="download-row">
      ${downloadFastaBtn}
      ${downloadPeptideBtn}
    </div>
  </div>
  <!-- Row 1 80 % Filters -->
  <div class="card" style="display:flex; flex-direction:column; gap:1rem;">
    <div class="file-heading">2. Filter</div>
    <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:1rem;">
      ${proteinInput}
      ${genotypeInput}
      <div style="display:flex; flex-direction:column; gap:.75rem;">
        ${hostInput}
        ${hostCategoryBox}
      </div>
      ${countryInput}
      ${collectionDateInput}
      ${releaseDateInput}
    </div>
    <div style="grid-column:1 / -1; justify-self:start;">
      ${applyButtonInput}
      ${clearButtonInput}
    </div>
  </div>

  <!-- Row 2-4 20 % continuous sidebar card -->
  <div class="card" style="grid-row: 2 / span 3;">
    <div class="file-heading">3. Control Panel</div>
    <br>${facetSelectInput}</br>
    ${colourAttrInput}
    <br>${peptideKeyEl}</br>
    <br>${colourModeInput}</br>
    <br>${aaKeyEl}</br>
    <br>${seqSetInput}</br>
    ${statusBanner}
    ${alleleCtrl1}
    ${alleleCtrl2}
    ${percentileModeInput}
    ${mhcClassInput}
    <br>${runBtnI}</br>
    <br>${runBtnII}</br>
    <br>${downloadCSVI}
    ${downloadCSVII}
    ${downloadCSVI_annot}

  </div>

  <!-- Right column wrapper spans rows 2?4 so left panel sizing does not bloat the metric-row -->
  <div class="right-stack">
    <!-- Row 2 80 % metric cards (fit to content) -->
    <div class="metric-row" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem;">
      ${allSeqCard}
      ${uniqueSeqCard}
      ${alignedPepsCard}
      ${conservedCard}
    </div>
    <!-- Row 3 80 % two equal cards -->
    <div class="card">${heatmapSVG2}</div>
    <!-- Row 4 80 % single wide card (flex-fills remainder) -->
    <div class="card dashboard-card">
      ${dashboardSlot}
    </div>
  </div>

</div>

<style>
/* dashboard (charts) card: equal padding and top-aligned content */
.dashboard-card {
  padding: 1rem;               /* equal padding on all sides */
  display: flex;
  flex-direction: column;      /* stack dashboard root and future controls */
  align-items: stretch;        /* let content fill available width */
  align-self: stretch;         /* participate in flex sizing of column */
  overflow: visible;           /* keep charts visible when they grow */
}
.dashboard-card > * {
  flex: 1 1 auto;
  min-height: 0;               /* enable children to shrink if needed */
  width: 100%;
}
.dashboard-card svg {
  display: block;              /* remove inline svg gaps */
  margin: 0;
  width: 100%;
  height: auto;                /* let SVG dictate its own height */
  min-height: 0;
}

/* right column wrapper spans rows 2-4, manages its own vertical flow */
.right-stack {
  grid-column: 2 / 3;
  grid-row: 2 / span 3;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-self: stretch;
  min-height: 0;              /* allow flex items to shrink without overflow */
}
.right-stack .dashboard-card {
  flex: 1 1 auto;
  min-height: clamp(320px, 45vh, 560px); /* keep charts legible yet responsive */
}
.right-stack > * { margin: 0; }
</style>

<!-- Imports and Loading Data -->
```js
/* Imports */
import {extendDB, sql, extended, getOrCreateDB} from "./components/extenddb.js"
import {DuckDBClient} from "npm:@observablehq/duckdb";
import * as duckdb from "@duckdb/duckdb-wasm";
import {dropSelect} from "./components/dropSelect.js";
import {comboSelect} from "./components/comboSelect.js"
import {dateSelect} from "./components/dateSelect.js";
import {uploadButton} from "./components/uploadButton.js";
import {checkboxSelect} from "./components/checkboxSelect.js";
import {filterButton} from "./components/filterButton.js";
import {downloadButton} from "./components/downloadButton.js";
import {metricCard} from "./components/metricCard.js";
import {peptideChart} from "./components/peptideChart.js";
import {stackedChart} from "./components/stackedChart.js";
import {makePeptideScale, colourAA} from "./components/palettes.js";
import { peptideHeatmap } from "./components/peptideHeatmap.js";
import {areaChart} from "./components/areaChart.js";
import {sequenceCompareChart} from "./components/sequenceCompareChart.js";
import {alleleChart} from "./components/alleleChart.js";
import {aaColourKey} from "./components/aaColourKey.js";
import {runButton} from "./components/runButton.js";
import {peptideColourKey} from "./components/peptideColourKey.js";
import * as d3 from "npm:d3";
import {comboSelectLazy} from "./components/comboSelectLazy.js";
```

```js
/* Peptide Query Data (unified tallies) */
const peptideProps = {
  toArray: async () => {
    const start = Number(selectedStart);
    const len   = Number(selectedLength);
    if (!(start > 0 && len > 0)) return [];

    const rows = await getWindowTalliesRows([{ start, len }]);

    const sel = selectedPeptide;
    if (sel && !rows.some(r => String(r.peptide).toUpperCase() === String(sel).toUpperCase())) {
      const tA = rows[0]?.total_all ?? 0;
      const tU = rows[0]?.total_unique ?? 0;
      rows.push({
        peptide           : sel,
        frequency_all     : 0,
        total_all         : tA,
        proportion_all    : 0.0,
        frequency_unique  : 0,
        total_unique      : tU,
        proportion_unique : 0.0
      });
    }

    return rows.map(r => ({
      peptide            : r.peptide,
      frequency_all      : Number(r.frequency_all),
      total_all          : Number(r.total_all),
      proportion_all     : Number(r.proportion_all),
      frequency_unique   : Number(r.frequency_unique),
      total_unique       : Number(r.total_unique),
      proportion_unique  : Number(r.proportion_unique)
    }));
  }
};
```

```js

/* Wrap Database */
const db = await getOrCreateDB(() =>
  DuckDBClient.of({
    // Keep local attachments for these tables
    sequencecalc: FileAttachment("data/IAV8_sequencecalc.parquet").parquet(),
    hla: FileAttachment("data/HLAlistClassI.parquet").parquet()
  })
);

// Initialize proteins temp table/view to a default protein so dependent cells can run
const DEFAULT_PROTEIN = "M1";
{
  const url0 = `https://gbxc45oychilox63.public.blob.vercel-storage.com/${encodeURIComponent(DEFAULT_PROTEIN)}.parquet`;
  await db.sql`CREATE OR REPLACE TABLE proteins_cache AS
    SELECT * FROM read_parquet('${url0}')`;
  await db.sql`CREATE OR REPLACE VIEW proteins AS SELECT * FROM proteins_cache`;
  globalThis.__proteinViewState = { last: DEFAULT_PROTEIN };
}
```

```js
// Perf helpers (no-op instrumentation)
{
  const g = globalThis;
  if (!g.__perfUtils) {
    async function perfAsync(_label, fn) {
      return fn();
    }
    g.__perfUtils = { perfAsync };
  }
}
```

<!-- Filter Buttons + Helpers -->
```js
/* Filter Helpers */
const proteinOptions = [
  {id: "M1",    label: "Matrix 1 (M1)"},
  {id: "M2",    label: "Matrix 2 (M2)"},
  {id: "HA",    label: "Hemagglutinin (HA)"},
  {id: "PAX",   label: "Polymerase Acidic X (PA-X)"},
  {id: "NA",    label: "Neuraminidase (NA)"},
  {id: "PB1F2", label: "PB1-F2 (PB1-F2)"},
  {id: "NP",    label: "Nucleocapsid (NP)"},
  {id: "NS1",   label: "Nonstructural 1 (NS1)"},
  {id: "NS2",   label: "Nonstructural 2 (NS2)"},
  {id: "PA",    label: "Polymerase Acidic (PA)"},
  {id: "PB1",   label: "Polymerase Basic 1 (PB1)"},
  {id: "PB2",   label: "Polymerase Basic 2 (PB2)"}
];
```

```js
/* Lazy fetchers for genotype / host / country (paged + searchable) */
const PAGE_INIT_LAZY  = 20;
const PAGE_LIMIT_LAZY = 50;

async function fetchGenotypes({ q = "", offset = 0, limit = PAGE_LIMIT_LAZY } = {}) {
  if (!q || q.trim().length < 2) {
    const rows = await (globalThis.__perfUtils?.perfAsync?.("sql: genotypes initial", async () => (await db.sql`
      SELECT TRIM(genotype) AS val, COUNT(*) AS n
      FROM proteins
      WHERE genotype IS NOT NULL AND LENGTH(TRIM(genotype)) > 0
      GROUP BY 1
      ORDER BY n DESC, val ASC
      LIMIT ${PAGE_INIT_LAZY} OFFSET ${offset}
    `).toArray()));
    return rows.map(r => r.val);
  }
  const like = `%${q}%`;
  const rows = await (globalThis.__perfUtils?.perfAsync?.("sql: genotypes search", async () => (await db.sql`
    SELECT TRIM(genotype) AS val
    FROM proteins
    WHERE genotype IS NOT NULL AND LENGTH(TRIM(genotype)) > 0
      AND genotype ILIKE ${like}
    GROUP BY 1
    ORDER BY val ASC
    LIMIT ${limit} OFFSET ${offset}
  `).toArray()));
  return rows.map(r => r.val);
}

async function fetchHosts({ q = "", offset = 0, limit = PAGE_LIMIT_LAZY } = {}) {
  if (!q || q.trim().length < 2) {
    const rows = await (globalThis.__perfUtils?.perfAsync?.("sql: hosts initial", async () => (await db.sql`
      SELECT TRIM(host) AS val, COUNT(*) AS n
      FROM proteins
      WHERE host IS NOT NULL AND LENGTH(TRIM(host)) > 0
      GROUP BY 1
      ORDER BY n DESC, val ASC
      LIMIT ${PAGE_INIT_LAZY} OFFSET ${offset}
    `).toArray()));
    return rows.map(r => r.val);
  }
  const like = `%${q}%`;
  const rows = await (globalThis.__perfUtils?.perfAsync?.("sql: hosts search", async () => (await db.sql`
    SELECT TRIM(host) AS val
    FROM proteins
    WHERE host IS NOT NULL AND LENGTH(TRIM(host)) > 0
      AND host ILIKE ${like}
    GROUP BY 1
    ORDER BY val ASC
    LIMIT ${limit} OFFSET ${offset}
  `).toArray()));
  return rows.map(r => r.val);
}

async function fetchCountries({ q = "", offset = 0, limit = PAGE_LIMIT_LAZY } = {}) {
  if (!q || q.trim().length < 2) {
    const rows = await (globalThis.__perfUtils?.perfAsync?.("sql: countries initial", async () => (await db.sql`
      SELECT TRIM(country) AS val, COUNT(*) AS n
      FROM proteins
      WHERE country IS NOT NULL AND LENGTH(TRIM(country)) > 0
      GROUP BY 1
      ORDER BY n DESC, val ASC
      LIMIT ${PAGE_INIT_LAZY} OFFSET ${offset}
    `).toArray()));
    return rows.map(r => r.val);
  }
  const like = `%${q}%`;
  const rows = await (globalThis.__perfUtils?.perfAsync?.("sql: countries search", async () => (await db.sql`
    SELECT TRIM(country) AS val
    FROM proteins
    WHERE country IS NOT NULL AND LENGTH(TRIM(country)) > 0
      AND country ILIKE ${like}
    GROUP BY 1
    ORDER BY val ASC
    LIMIT ${limit} OFFSET ${offset}
  `).toArray()));
  return rows.map(r => r.val);
}

```

```js
const genotypeInput = comboSelectLazy({
  label: "Genotype",
  placeholder: "e.g. H5N1",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,
  pageLimit: 50,
  fetch: ({ q, offset, limit }) => fetchGenotypes({ q, offset, limit })
});
const selectedGenotypes = Generators.input(genotypeInput);

const hostInput = comboSelectLazy({
  label: "Host",
  placeholder: "e.g. Gallus gallus",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,
  pageLimit: 50,
  fetch: ({ q, offset, limit }) => fetchHosts({ q, offset, limit })
});
const selectedHosts = Generators.input(hostInput);

const safe = arr => Array.isArray(arr) ? arr : [];

const countryInput = comboSelectLazy({
  label: "Country",
  placeholder: "e.g. Antarctica",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,
  pageLimit: 50,
  fetch: ({ q, offset, limit }) => fetchCountries({ q, offset, limit })
});
const selectedCountries = Generators.input(countryInput);

```

```js
/* Filter Buttons */
const proteinInput = dropSelect(proteinOptions, {
  label: "Protein",
  fontFamily: "'Roboto', sans-serif"
});
const selectedProtein = Generators.input(proteinInput);

const hostCategoryBox = checkboxSelect(["Human", "Non-human"]);
const hostCategory = Generators.input(hostCategoryBox);

const collectionDateInput = dateSelect({
  label: "Collection date",
  fontFamily: "'Roboto', sans-serif"
});
const selectedDates = Generators.input(collectionDateInput);

const releaseDateInput = dateSelect({
  label: "Release date",
  fontFamily: "'Roboto', sans-serif"
});
const selectedReleaseDates = Generators.input(releaseDateInput); 
```

```js
/* Apply Filters Button */
const applyButtonInput  = filterButton("Apply filters",  {color:"#006DAE"});
const applyTrigger = Generators.input(applyButtonInput);
```

```js
/* Apply Filters Function */
function commit(element) {
  return Generators.observe((change) => {
    const update = () => change(element.value);
    update();
    applyButtonInput.addEventListener("input", update);
    return () => applyButtonInput.removeEventListener("input", update);
  });
}

/* Committed Filters */
const proteinCommitted         = commit(proteinInput);
const genotypesCommitted       = commit(genotypeInput);
const hostsCommitted           = commit(hostInput);
const hostCategoryCommitted    = commit(hostCategoryBox);
const countriesCommitted       = commit(countryInput);
const collectionDatesCommitted = commit(collectionDateInput);
const releaseDatesCommitted    = commit(releaseDateInput);
```

```js
/* Clear Filters Button */
const clearButtonInput  = filterButton("Clear filters",  {color:"#A3A3A3"});

clearButtonInput.addEventListener("input", () => {
  proteinInput.clear();
  genotypeInput.clear();
  hostInput.clear();
  countryInput.clear();
  hostCategoryBox.clear();
  collectionDateInput.clear();
  releaseDateInput.clear();
});
```

<!-- Summary Stat Cards -->
```js
/* Current Counts */
const total_all_count = positionStats.toArray()[0]?.total_all ?? 0;
const total_unique_count = positionStats.toArray()[0]?.total_unique ?? 0;

/* Previous Counts */
const total_count_previous = getPrevTotal(total_all_count);
const total_unique_previous = getPrevUnique(total_unique_count);
```

```js
/* Previous Count Tracker */
function trackPrev() {
  let prev;
  return function (current) {
    const value = prev === undefined ? null : prev;
    prev = current;
    return value;
  };
}

const getPrevTotal = trackPrev();
const getPrevUnique = trackPrev();
```

```js
/* Peptide Alignment Count Tracker */
const aligned_count    = peptidesAligned.filter(d => d.peptide_aligned)?.length ?? 0;
const nonaligned_count = peptidesAligned.length - aligned_count;
```

<!-- Input Reference FASTA Alignment -->
```js
/* Input FASTA Button */
/* Reference FASTA Button */
const referencefasta = uploadButton({
  label: "Upload Reference",
  accept: ".fasta",
  required: false,
  tooltipTitle: "Upload Reference Sequence",
  tooltipBody: "Upload a reference sequence set to use for peptide alignment, and matching. Format accepted: .fasta"
});
const referenceFile = Generators.input(referencefasta);
```

```js
/* Normaliser (kept from your code) */
const normProtein = s => String(s ?? "").trim().replace(/\s+/g, "").toUpperCase();

/* Tiny per-protein cache for sequencecalc */
if (!globalThis.__seqProfileCache) {
  globalThis.__seqProfileCache = { protein: null, profile: null };
}

/* Fetch + build */
async function loadSeqProfileFor(proteinId) {
  const pid = normProtein(proteinId);
  if (!pid) return null;

  if (globalThis.__seqProfileCache.protein === pid &&
      globalThis.__seqProfileCache.profile) {
    return globalThis.__seqProfileCache.profile;
  }

  const rows = await (globalThis.__perfUtils?.perfAsync?.(`sql: seqProfile for ${pid}`, async () => (await db.sql`
    SELECT position, aminoacid, value
    FROM   sequencecalc
    WHERE  protein = ${pid}
  `).toArray()))

  // Build an array (1-based positions) of Maps
  const arr = [];
  for (const r of rows) {
    const pos  = Number(r.position);
    const aa   = String(r.aminoacid);
    const val  = Number(r.value);
    while (arr.length < pos) arr.push(new Map());
    arr[pos - 1].set(aa, val);
  }

  globalThis.__seqProfileCache = { protein: pid, profile: arr };
  return arr;
}
```

```js
/* Banded Needleman-Wunsch with Dynamic Band Width */
function nwAffineBanded(ref, freqs, baseBandWidth = 75, gOpen = -5, gExt = -2) {
  const __t0 = performance.now();
  try {
  const M = freqs.length, N = ref.length;
  const lengthDiff = Math.abs(M - N);
  const bandWidth = Math.max(baseBandWidth, lengthDiff + 20);

  const Mx = Array.from({ length: M + 1 }, () => Array(N + 1).fill(-1e9)),
        Ix = Array.from({ length: M + 1 }, () => Array(N + 1).fill(-1e9)),
        Iy = Array.from({ length: M + 1 }, () => Array(N + 1).fill(-1e9));

  const TBM = Array.from({ length: M + 1 }, () => Array(N + 1).fill(0)),
        TBIx= Array.from({ length: M + 1 }, () => Array(N + 1).fill(0)),
        TBIy= Array.from({ length: M + 1 }, () => Array(N + 1).fill(0));

  Mx[0][0] = 0;
  for (let i = 1; i <= bandWidth && i <= M; ++i) { Ix[i][0] = gOpen + (i-1)*gExt; TBIx[i][0] = 1; }
  for (let j = 1; j <= bandWidth && j <= N; ++j) { Iy[0][j] = gOpen + (j-1)*gExt; TBIy[0][j] = 2; }

  for (let i = 1; i <= M; ++i) {
    const j_start = Math.max(1, i - bandWidth);
    const j_end = Math.min(N, i + bandWidth);
    const freqMap = freqs[i-1];

    for (let j = j_start; j <= j_end; ++j) {
      const residue = ref[j-1];
      const freq = freqMap.get(residue) || 0;
      
      let subst;
      if (freq > 0) {
        subst = 2 * Math.log(freq / 0.05);
      } else if (freqMap.has("X")) {
        subst = 0;
      } else {
        subst = -5;
      }
      
      const mFrom = [ Mx[i-1][j-1] + subst, Ix[i-1][j-1] + subst, Iy[i-1][j-1] + subst ];
      Mx[i][j]  = Math.max(...mFrom);
      TBM[i][j] = mFrom.indexOf(Mx[i][j]);

      const ixFromM = Mx[i-1][j] + gOpen;
      const ixFromI = Ix[i-1][j] + gExt;
      if (ixFromM >= ixFromI) { Ix[i][j] = ixFromM; TBIx[i][j] = 0; }
      else                    { Ix[i][j] = ixFromI; TBIx[i][j] = 1; }

      const iyFromM = Mx[i][j-1] + gOpen;
      const iyFromI = Iy[i][j-1] + gExt;
      if (iyFromM >= iyFromI) { Iy[i][j] = iyFromM; TBIy[i][j] = 0; }
      else                    { Iy[i][j] = iyFromI; TBIy[i][j] = 2; }
    }
  }

  let aln_b = "";
  let i = M, j = N;
  let state;
  const m_final = Mx[i][j], i_final = Ix[i][j], y_final = Iy[i][j];
  if (m_final >= i_final && m_final >= y_final) state = 0;
  else if (i_final >= y_final)                  state = 1;
  else                                          state = 2;

  while (i > 0 || j > 0) {
    if (state === 0) {
        if(j > 0) aln_b = ref[j-1] + aln_b;
        state = TBM[i][j];
        i--; j--;
    } else if (state === 1) {
        aln_b = "-" + aln_b;
        state = TBIx[i][j];
        i--;
    } else {
        if(j > 0) aln_b = ref[j-1] + aln_b;
        state = TBIy[i][j];
        j--;
    }
     if (i <= 0 && j <= 0) break;
  }
  return aln_b;
  } finally {
    const dt = performance.now() - __t0;
    const s = (globalThis.__nwPerf = globalThis.__nwPerf || { count: 0, totalMs: 0, maxMs: 0 });
    s.count += 1;
    s.totalMs += dt;
    if (dt > s.maxMs) s.maxMs = dt;
  }
}
```

```js
/* The alignment table now pulls the profile only for the committed protein */
/* Align every protein in the uploaded reference FASTA (on file input) */
const allAlignedFromReference = referenceFile ? await (async () => {
  const __t0 = performance.now();
  // --- parse FASTA text ? [{protein, raw_sequence}]
  const txt = await referenceFile.text();
  const entries = (() => {
    const out = [];
    let header = null, seq = [];
    for (const line of txt.split(/\r?\n/)) {
      if (line.startsWith(">")) {
        if (header) out.push({ protein: header.replace(/^>\s*/, "").trim(), raw_sequence: seq.join("").replace(/\s+/g, "") });
        header = line;
        seq = [];
      } else if (line.trim()) {
        seq.push(line.trim());
      }
    }
    if (header) out.push({ protein: header.replace(/^>\s*/, "").trim(), raw_sequence: seq.join("").replace(/\s+/g, "") });
    return out;
  })();

try { globalThis.__committedProteinId = committedProteinId; } catch {}
  // --- build a profile for every distinct protein header found
  const ids = [...new Set(entries.map(d => normProtein?.(d.protein) ?? d.protein))].filter(Boolean);
  const profilePairs = await Promise.all(ids.map(async id => [id, await loadSeqProfileFor(id)]));
  const profileMap = new Map(profilePairs); // id -> profile|null

  // --- align all rows (skip those with no profile by leaving null)
  const out = entries.map(e => {
    const id   = (normProtein?.(e.protein) ?? e.protein);
    const prof = profileMap.get(id);
    const aln  = prof ? nwAffineBanded(e.raw_sequence, prof) : null;
    return { protein: e.protein, aligned_sequence: aln };
  });
  return out;
})() : [];

/* Optional: keep the old name so downstream code continues to work */
const fastaAligned = allAlignedFromReference;

// after computing `const fastaAligned = allAlignedFromReference;`
globalThis.__alignedSequences = fastaAligned;        // stash for non-reactive access
dispatchEvent(new Event("aligned-ready"));           // notify listeners

/* Resolve the profile once (reactive to committed protein) and finalise alignment */
const __profileForCommitted = await loadSeqProfileFor(proteinCommitted);

for (const row of fastaAligned) {
  if (row._needsProfile) {
    const freqs = __profileForCommitted;
    row.aligned_sequence = freqs
      ? nwAffineBanded(row.raw_sequence, freqs)
      : "Error: No profile for this protein.";
  } else if (row.aligned_sequence == null) {
    row.aligned_sequence = "Error: No profile for this protein.";
  }
  delete row._needsProfile;
}
```

<!-- Input Peptide Alignment -->
```js
/* Input Peptide Button */
const peptideinput = uploadButton({
  label: "Upload Peptides",
  accept: ".csv",
  required: false,
  tooltipTitle: "Upload Peptide Set",
  tooltipBody: "Upload a set of peptides to align and compare. Format accepted: .csv"
});
const peptideFile = Generators.input(peptideinput);
```

```js
/* Read Peptide File + Normalisation */
const peptidesRaw = peptideFile
  ? (await (await peptideFile.text()).trim())
      .split(/\r?\n/)
      .map(line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/))
      .map(row => row.map(cell => cell.replace(/^"|"$/g, "")))
      .reduce((acc, row, i, arr) => {
        if (i === 0) {
          const hdrs = row.map(h =>
            h.toLowerCase().replace(/\s+/g, "_")
          );
          acc.headers = hdrs;
        } else {
          const obj = {};
          row.forEach((v, j) => (obj[acc.headers[j]] = v.trim()));
          acc.rows.push(obj);
        }
        return acc;
      }, { headers: [], rows: [] }).rows
  : [];

/* Keep Original Columns */
const peptidesClean = peptidesRaw.map(d => {
  const o = {
    peptide : d.peptide?.toUpperCase?.() ?? "",
    protein : d.protein?.trim?.() ?? ""
  };
  ["attribute_1", "attribute_2", "attribute_3"].forEach((k, i) => {
    const src = Object.keys(d).find(h => h.startsWith("attribute") && +h.match(/\d+/)?.[0] === i+1);
    if (src) o[k] = d[src];
  });
  return o;
});
```

```js
/* Reference Grids */
const alignRefMap = new Map(
  (fastaAligned ?? []).map(d => [d.protein, d.aligned_sequence])
);

/* Align Peptides to Reference */
function alignPeptideToRef(peptide, refAlign) {
  const p     = peptide.toUpperCase();
  const ungap = refAlign.replace(/-/g, "");
  const idxRaw = ungap.indexOf(p);
  if (idxRaw === -1) return { start_raw: null, start_aln: null, aligned: null };

  let rawCounter = 0, startAln = null;
  for (let i = 0; i < refAlign.length; ++i) {
    if (refAlign[i] !== "-") {
      if (rawCounter === idxRaw) { startAln = i + 1; break; }
      rawCounter++;
    }
  }

  let aligned = "", collectedRaw = 0;
  for (let i = startAln - 1; i < refAlign.length; ++i) {
    const ch = refAlign[i];
    aligned += ch;
    if (ch !== "-") {
      collectedRaw++;
      if (collectedRaw === p.length) break;
    }
  }

  return { start_raw: idxRaw + 1, start_aln: startAln, aligned };
}

/* Peptide Alignment Table */
const peptidesAligned = peptidesClean.map(d => {
  const ref  = alignRefMap.get(d.protein);

  const { start_raw, start_aln, aligned } = ref
        ? alignPeptideToRef(d.peptide, ref)
        : { start_raw: null, start_aln: null, aligned: null };

  return {
    ...d,
    /* FIELD NAMES */
    length_raw       : d.peptide.length,               // ungapped length
    length           : aligned ? aligned.length : null,/* aligned length */
    start_raw        : start_raw,                      // optional info
    start            : start_aln,                      // aligned coord
    peptide_aligned  : aligned,                        // string incl. gaps
    aligned_length   : aligned ? aligned.length : null // kept for legacy
  };
});

// wherever peptidesAligned is produced:
globalThis.__peptidesAligned = peptidesAligned;   // stash for non-reactive access
dispatchEvent(new Event("peptides-ready"));       // notify button enabler
```
```js
// Perf: size of peptidesAligned array and NW totals
(function(){
  const s = globalThis.__nwPerf;
})();
```
```js
/* Distinct (start,len) windows for uploaded peptides - use RAW (ungapped) coords */
const peptideWindows = (() => {
  const pid = committedProteinId; // reactive
  if (!pid) return [];
  const key = r => `${r.start}|${r.length}`;
  const map = new Map();
  for (const r of peptidesAligned) {
    if ((r.protein || "").toUpperCase() !== pid) continue;
    if (!r.start || !r.length) continue;
    const k = key(r);
    map.set(k, { start: +r.start, len: +r.length });
  }
  return [...map.values()];
})();
```

```js
/* ------------------------------------------------------------------
   Unified cached window tallies (per (start,len) over filtered set)
   - Returns rows: start,len,peptide, frequency_all/unique, total_all/unique,
                   proportion_all/unique
   - Cached by committed protein, active filters, and windows
-------------------------------------------------------------------*/
if (!globalThis.__windowTalliesCache) {
  globalThis.__windowTalliesCache = { key: null, rows: [] };
}

async function getWindowTalliesRows(windows) {
  const pid = committedProteinId; // reactive dep
  const wins = (windows || [])
    .map(w => ({ start: Math.trunc(w.start), len: Math.trunc(w.len) }))
    .filter(w => Number.isFinite(w.start) && w.start > 0 && Number.isFinite(w.len) && w.len > 0);

  const winsKey = wins
    .map(w => `${w.start}|${w.len}`)
    .sort((a,b)=>a.localeCompare(b))
    .join(",");

  const filterKey = JSON.stringify({
    protein         : pid,
    genotypes       : [...genotypesCommitted].sort(),
    hosts           : [...hostsCommitted].sort(),
    hostCategory    : [...hostCategoryCommitted].sort(),
    countries       : [...countriesCommitted].sort(),
    collectionDates : collectionDatesCommitted,
    releaseDates    : releaseDatesCommitted,
    windowsKey      : winsKey
  });


  if (globalThis.__windowTalliesCache?.key === filterKey) {
    return globalThis.__windowTalliesCache.rows || [];
  }

  if (!wins.length) {
    globalThis.__windowTalliesCache = { key: filterKey, rows: [] };
    return [];
  }

  const q = await db.sql`
    WITH
    params(start, len) AS (
      VALUES ${joinSql(wins.map(w => sql`(${w.start}, ${w.len})`))}
    ),

    filtered AS (
      /* Sequences scoped to committed protein via 'proteins' view */
      SELECT sequence
      FROM   proteins
      WHERE  1=1
        AND ${ genotypesCommitted.length
                ? sql`genotype IN (${ genotypesCommitted })` : sql`TRUE` }
        AND ${ hostsCommitted.length
                ? sql`host IN (${ hostsCommitted })` : sql`TRUE` }
        AND ${
              hostCategoryCommitted.includes('Human') &&
              !hostCategoryCommitted.includes('Non-human')
                ? sql`host = 'Homo sapiens'`
                : (!hostCategoryCommitted.includes('Human') &&
                   hostCategoryCommitted.includes('Non-human'))
                    ? sql`host <> 'Homo sapiens'`
                    : sql`TRUE`
            }
        AND ${ countriesCommitted.length
                ? sql`country IN (${ countriesCommitted })` : sql`TRUE` }

        AND ${
          collectionDatesCommitted.from || collectionDatesCommitted.to
            ? sql`
                TRY_CAST(
                  CASE
                    WHEN collection_date IS NULL OR collection_date = '' THEN NULL
                    WHEN LENGTH(collection_date)=4  THEN collection_date || '-01-01'
                    WHEN LENGTH(collection_date)=7  THEN collection_date || '-01'
                    ELSE collection_date
                  END AS DATE
                )
                ${
                  collectionDatesCommitted.from && collectionDatesCommitted.to
                    ? sql`BETWEEN CAST(${collectionDatesCommitted.from} AS DATE)
                             AND   CAST(${collectionDatesCommitted.to  } AS DATE)`
                    : collectionDatesCommitted.from
                        ? sql`>= CAST(${collectionDatesCommitted.from} AS DATE)`
                        : sql`<= CAST(${collectionDatesCommitted.to   } AS DATE)`
                }
              ` : sql`TRUE`
        }

        AND ${
          releaseDatesCommitted.from || releaseDatesCommitted.to
            ? sql`
                TRY_CAST(
                  CASE
                    WHEN release_date IS NULL OR release_date = '' THEN NULL
                    WHEN LENGTH(release_date)=4 THEN release_date || '-01-01'
                    WHEN LENGTH(release_date)=7 THEN release_date || '-01'
                    ELSE release_date
                  END AS DATE
                )
                ${
                  releaseDatesCommitted.from && releaseDatesCommitted.to
                    ? sql`BETWEEN CAST(${releaseDatesCommitted.from} AS DATE)
                             AND   CAST(${releaseDatesCommitted.to  } AS DATE)`
                    : releaseDatesCommitted.from
                        ? sql`>= CAST(${releaseDatesCommitted.from} AS DATE)`
                        : sql`<= CAST(${releaseDatesCommitted.to   } AS DATE)`
                }
              ` : sql`TRUE`
        }
    ),

    ex_all AS (
      SELECT p.start, p.len,
             SUBSTR(f.sequence, CAST(p.start AS BIGINT), CAST(p.len AS BIGINT)) AS peptide
      FROM filtered f
      CROSS JOIN params p
    ),
    cnt_all AS (
      SELECT start, len, peptide, COUNT(*) AS cnt_all
      FROM   ex_all
      GROUP  BY start, len, peptide
    ),
    tot_all AS (
      SELECT start, len, SUM(cnt_all) AS total_all
      FROM   cnt_all
      GROUP  BY start, len
    ),

    filtered_u AS ( SELECT DISTINCT sequence FROM filtered ),
    ex_u AS (
      SELECT p.start, p.len,
             SUBSTR(u.sequence, CAST(p.start AS BIGINT), CAST(p.len AS BIGINT)) AS peptide
      FROM filtered_u u
      CROSS JOIN params p
    ),
    cnt_u AS (
      SELECT start, len, peptide, COUNT(*) AS cnt_unique
      FROM   ex_u
      GROUP  BY start, len, peptide
    ),
    tot_u AS (
      SELECT start, len, SUM(cnt_unique) AS total_unique
      FROM   cnt_u
      GROUP  BY start, len
    )

    SELECT
      COALESCE(a.start, u.start)      AS start,
      COALESCE(a.len,   u.len)        AS len,
      COALESCE(a.peptide, u.peptide)  AS peptide,
      COALESCE(a.cnt_all,   0)::INT   AS frequency_all,
      COALESCE(tA.total_all,0)::INT   AS total_all,
      CASE WHEN tA.total_all IS NULL OR tA.total_all = 0
           THEN 0.0 ELSE a.cnt_all * 1.0 / tA.total_all END AS proportion_all,
      COALESCE(u.cnt_unique,0)::INT   AS frequency_unique,
      COALESCE(tU.total_unique,0)::INT AS total_unique,
      CASE WHEN tU.total_unique IS NULL OR tU.total_unique = 0
           THEN 0.0 ELSE u.cnt_unique * 1.0 / tU.total_unique END AS proportion_unique
    FROM        cnt_all a
    FULL  JOIN  cnt_u   u USING (start, len, peptide)
    LEFT  JOIN  tot_all tA USING (start, len)
    LEFT  JOIN  tot_u   tU USING (start, len)
  `;

  const rows = await q.toArray();
  globalThis.__windowTalliesCache = { key: filterKey, rows };
  return rows;
}
```

```js
/* Workset for Class I predictions (per protein) */
const peptidesIWorkset = (() => {
  const pid = committedProteinId; // reactive
  if (!pid) return [];

  const set = new Set();

  // uploaded peptides
  for (const r of peptidesClean) {
    if ((r.protein || "").toUpperCase() !== pid) continue;
    const pep = (r.peptide || "").toUpperCase().replace(/-/g,"");
    if (pep.length >= 8 && pep.length <= 14) set.add(pep);
  }

  // top candidates from the SQL above (already ungapped substrings)
  for (const r of topCandidatesByWindow) {
    const p = (r.peptide || "").toUpperCase().replace(/-/g, "");
    if (p.length >= 8 && p.length <= 14) set.add(p);
  }

  return [...set];
})();
```

```js
// Reactive enabler
{
  const ready = (fastaAligned ?? []).some(d => typeof d.aligned_sequence === "string" && d.aligned_sequence.length > 0);

  const fallbackSetDisabled = (el, flag) => {
    const btn = el?.querySelector?.(".dl-btn");
    const tip = el?.querySelector?.(".dl-tip");
    if (btn) {
      btn.disabled = !!flag;
      btn.setAttribute("aria-disabled", flag ? "true" : "false");
    }
    if (tip) {
      const title = tip.querySelector(".dl-tip-title");
      const body  = tip.querySelector(".dl-tip-body");
      if (title) title.textContent = flag ? "Upload a reference" : "Download Aligned FASTA";
      if (body)  body.textContent  = flag
        ? "Upload a reference FASTA and wait for alignment to finish to enable this download."
        : "Aligned sequences for all proteins in the uploaded reference.";
    }
  };

  (downloadFastaBtn.setDisabled ?? ((flag) => fallbackSetDisabled(downloadFastaBtn, flag)))(!ready);
}
```

```js
{
  allSeqCard.set({
    title: "All sequences",
    current: Number.isFinite(total_all_count) ? total_all_count : "--",
    previous: Number.isFinite(total_count_previous) ? total_count_previous : undefined,
    hideDelta: false
  });

  uniqueSeqCard.set({
    title: "Unique sequences",
    current: Number.isFinite(total_unique_count) ? total_unique_count : "--",
    previous: Number.isFinite(total_unique_previous) ? total_unique_previous : undefined,
    hideDelta: false
  });
}
```

```js
// All sequences
const allSeqCard = metricCard({
  title: "All sequences",
  current: Number.isFinite(total_all_count) ? total_all_count : "--",
  previous: Number.isFinite(total_count_previous) ? total_count_previous : undefined,
  hideDelta: false
});

// Unique sequences
const uniqueSeqCard = metricCard({
  title: "Unique sequences",
  current: Number.isFinite(total_unique_count) ? total_unique_count : "--",
  previous: Number.isFinite(total_unique_previous) ? total_unique_previous : undefined,
  hideDelta: false
});

// Renders instantly; shows placeholder values until data exists
const alignedPepsCard = metricCard({
  title: `Aligned peptides (${proteinCommitted ?? "?"})`,
  current: "--",
  previous: undefined,
  hideDelta: true
});


// Renders right away with placeholders
const conservedCard = metricCard({
  title: `Conserved peptides (${proteinCommitted ?? "?"}) >95%`,
  current: "--",
  previous: undefined,
  hideDelta: true
});
```

```js
{
  const normProt = s => (typeof normProtein === "function" ? normProtein(s) : (s ?? "")).trim();
  const normPep  = s => String(s ?? "").toUpperCase().replace(/\s+/g, "");

  // prefer 'proportion_all', fall back to 'proportion_unique'
  const getProp = (r) => {
    let p = r?.proportion_all;
    if (!Number.isFinite(p)) p = r?.proportion_unique;
    return Number.isFinite(p) ? p : NaN;
  };

  const compute = async () => {
    const protein = proteinCommitted ?? "";

    // 1) USER PEPTIDES for the selected protein (deduped)
    const pepRows = Array.isArray(globalThis.__peptidesAligned) ? globalThis.__peptidesAligned : [];
    const userPeps = new Set(
      pepRows
        .filter(r => {
          const rp = r?.protein ?? r?.gene ?? r?.header ?? r?.name;
          return normProt(rp) === normProt(protein);
        })
        .map(r => normPep(r?.peptide ?? r?.peptide_seq ?? r?.pep ?? r?.sequence ?? r?.seq))
        .filter(s => s.length > 0)
    );

    // If no user peptides yet, show placeholders
    if (userPeps.size === 0) {
      conservedCard.set({
        title: `Conserved peptides (${protein || "?"}) >95%`,
        current: "--",
        previous: undefined,
        hideDelta: true
      });
      return;
    }

    // 2) TALLIES ROWS (await if promise)
    let rows = globalThis.__windowTalliesRows;
    if (rows && typeof rows.then === "function") {
      try { rows = await rows; } catch { rows = []; }
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      conservedCard.set({
        title: `Conserved peptides (${protein || "?"}) >95%`,
        current: "--",
        previous: undefined,
        hideDelta: true
      });
      return;
    }

    // Rows should already be for committed protein; keep a strict match if a field exists
    const protMatch = r => {
      const rp = r?.protein ?? r?.gene ?? r?.header ?? r?.name;
      return rp == null || normProt(rp) === normProt(protein);
    };
    const subset = rows.filter(protMatch);

    // 3) Build peptide ? proportion map (use MAX across windows for safety)
    const pepToProp = new Map();
    for (const r of subset) {
      const pep = normPep(r?.peptide);
      if (!pep || !userPeps.has(pep)) continue; // only user's peptides
      const p = getProp(r);
      if (!Number.isFinite(p)) continue;
      const prev = pepToProp.get(pep);
      pepToProp.set(pep, prev == null ? p : Math.max(prev, p));
    }

    // 4) Count >0.95 (conserved) and <0.95 (non) across only the user's peptides.
    // Missing peptides are treated as 0 (non).
    let conserved = 0, non = 0;
    for (const pep of userPeps) {
      const p = Number.isFinite(pepToProp.get(pep)) ? pepToProp.get(pep) : 0;
      if (p > 0.95) conserved++;
      else if (p < 0.95) non++;
      // exactly 0.95 is counted as neither, per your spec (> or < only)
    }

    conservedCard.set({
      title: `Conserved peptides (${protein || "?"}) >95%`,
      current: conserved,
      previous: non,
      hideDelta: true
    });
  };

  await compute();                                // initial
  addEventListener("peptides-ready", compute);    // when user CSV parsed
  addEventListener("tallies-ready", compute);     // when tallies refreshed
  invalidation.then(() => {
    removeEventListener("peptides-ready", compute);
    removeEventListener("tallies-ready", compute);
  });
}

```

```js
// Build & stash tallies for the committed protein and current windows
{
  // empty first so downstream sees "not ready"
  globalThis.__windowTalliesRows = [];

  // getWindowTalliesRows is async and expects windows
  const rows = await getWindowTalliesRows(peptideWindows);

  globalThis.__windowTalliesRows = rows;
  dispatchEvent(new Event("tallies-ready"));
}
```

```js
const topCandidatesByWindow = peptideWindows.length === 0 ? [] :
  await (globalThis.__perfUtils?.perfAsync?.('sql: topCandidatesByWindow (tallies->rank)', async () => {
    const rows = await getWindowTalliesRows(peptideWindows);
    const byWin = d3.group(rows, r => `${r.start}|${r.len}`);
    const out = [];
    for (const [, arr] of byWin) {
      const orderAll = [...arr].sort((a, b) =>
        d3.descending(+a.proportion_all, +b.proportion_all) ||
        d3.ascending(String(a.peptide), String(b.peptide))
      );
      const ranksAll = new Map(orderAll.map((r, i) => [r.peptide, i + 1]));
      const orderUnique = [...arr].sort((a, b) =>
        d3.descending(+a.proportion_unique, +b.proportion_unique) ||
        d3.ascending(String(a.peptide), String(b.peptide))
      );
      const ranksUnique = new Map(orderUnique.map((r, i) => [r.peptide, i + 1]));
      for (const row of arr) {
        const rankAll = ranksAll.get(row.peptide) ?? Number.POSITIVE_INFINITY;
        const rankUnique = ranksUnique.get(row.peptide) ?? Number.POSITIVE_INFINITY;
        if (rankAll <= 5 || rankUnique <= 5) {
          out.push({
            start: Number(row.start),
            len: Number(row.len),
            peptide: row.peptide,
            r_all: rankAll,
            r_u: rankUnique,
            proportion_all: Number(row.proportion_all),
            proportion_unique: Number(row.proportion_unique),
            frequency_all: Number(row.frequency_all),
            total_all: Number(row.total_all),
            frequency_unique: Number(row.frequency_unique),
            total_unique: Number(row.total_unique)
          });
        }
      }
    }
    out.sort((a, b) =>
      (a.start - b.start) ||
      (a.len - b.len) ||
      (a.r_all - b.r_all) ||
      (a.r_u - b.r_u) ||
      a.peptide.localeCompare(b.peptide)
    );
    return out;
  }));
```

```js
{
  // heuristic: what counts as "aligned" in your rows
  const isAligned = (d) => {
    if (!d || typeof d !== "object") return false;
    if (typeof d.status === "string") {
      // treat "misaligned" as not aligned, anything else containing 'aligned' as aligned
      if (/misalign/i.test(d.status)) return false;
      if (/align/i.test(d.status)) return true;
    }
    if (typeof d.peptide_aligned === "string" && d.peptide_aligned.length) return true;
    const num = k => Number.isFinite(d?.[k]);
    if (num("aligned_start") || num("aligned_end") || num("aln_start") || num("aln_end")) return true;
    return false;
  };

  const norm = s => (typeof normProtein === "function" ? normProtein(s) : (s ?? "")).trim();

  const update = () => {
    const protein = proteinCommitted ?? "";
    const arr = Array.isArray(globalThis.__peptidesAligned) ? globalThis.__peptidesAligned : [];

    const filtered = arr.filter(r => norm(r.protein) === norm(protein));
    const aligned  = filtered.filter(isAligned).length;
    const mis      = filtered.length - aligned;

    // title always reflects current selection
    const title = `Aligned peptides (${protein || "?"})`;

    // if no peptide file yet, keep placeholders
    if (!arr.length) {
      alignedPepsCard.set({ title, current: "--", previous: undefined, hideDelta: true });
      return;
    }

    // if we have peptides for this protein but none aligned, show the requested message
    const currentVal = filtered.length > 0
      ? (aligned === 0 ? "0 - peptides misaligned" : aligned)
      : "--";

    alignedPepsCard.set({
      title,
      current: currentVal,
      previous: (filtered.length > 0 ? mis : undefined),
      hideDelta: true
    });
  };

  update(); // run now
  addEventListener("peptides-ready", update);           // when the stash is filled
  invalidation.then(() => removeEventListener("peptides-ready", update));
}
```

<!-- Download Buttons -->
```js
/* Download Alignment Button (multi-FASTA, aligned only) */
// NOTE: no reference to `fastaAligned` in this cell
const downloadFastaBtn = downloadButton({
  filename: "aligned_sequences.fasta",
  format: "fasta",
  data: () => (globalThis.__alignedSequences ?? [])
              .filter(d => typeof d.aligned_sequence === "string" && d.aligned_sequence.length > 0),
  fasta: { lineWidth: 60 },
  tooltipTitle: "Download Aligned Reference Sequence",
  tooltipBody : "Aligned sequences for all proteins in the uploaded reference.",
  disabled: true,
  disabledTooltipTitle: "Upload a reference",
  disabledTooltipBody : "Upload a reference FASTA and wait for alignment to finish to enable this download."
});
```

```js
{
  const update = () => {
    const arr = globalThis.__peptidesAligned;
    const ready = Array.isArray(arr) && arr.length > 0;
    downloadPeptideBtn.setDisabled(!ready);
  };

  update(); // set initial state on page load
  addEventListener("peptides-ready", update);
  invalidation.then(() => removeEventListener("peptides-ready", update));
}
```


```js
/* Download Peptides Button */
const downloadPeptideBtn = downloadButton({
  filename: "peptidesAligned.csv",
  data: () => (globalThis.__peptidesAligned ?? []),
  tooltipTitle: "Download Aligned Peptides",
  tooltipBody : "Uploaded peptides with aligned coordinates and any attributes. Outputs as .csv",
  disabled: true,
  disabledTooltipTitle: "Upload a peptide set",
  disabledTooltipBody : "Upload a peptide .csv and wait for parsing/alignment to enable this download."
});
```

```js
/* Mutable Peptide Selected */
const selectedPeptide = Mutable(null);
const setSelectedPeptide = x => { selectedPeptide.value = x; try { dispatchEvent(new Event("peptide-selected")); } catch {} };

const selectedStart = Mutable(null);
const setSelectedStart = x => selectedStart.value = x;

const selectedLength = Mutable(null);
const setSelectedLength = x => selectedLength.value = x;
```

<!-- Synchronised Graphs -->
```js
/* Function to Create Synchronised Graphs */
function createIAVDashboard({
  rowHeight   = 18,
  gap         = 2,
  sizeFactor  = 1.8,
  margin      = {top:12,right:20,bottom:12,left:56}
} = {}) {

  const pepData = peptidesAligned.filter(d => d.protein === proteinCommitted);

  const inProportionMode = (String(colourAttr) === 'Proportion');
  const useProp = inProportionMode && (typeof getPeptideProportion !== 'undefined');

  // For proportion mode (when available), attach numeric proportion as attribute_1 so chart uses attribute path
  const pepDataForChart = useProp
    ? pepData.map(d => ({ ...d, attribute_1: getPeptideProportion(d) }))
    : pepData;

  const colourByForChart = useProp ? 'attribute_1' : colourAttr;

  // Build colour scale
  let colourScale = null;
  if (!isAlleleColour) {
    if (useProp) {
      colourScale = v => d3.interpolateBlues(Math.max(0, Math.min(1, Number(v))));
    } else {
      const vals = pepData.map(d => d?.[colourAttr]);
      const keys = [...new Set(vals.filter(v => v != null && String(v).trim() !== "").map(String))].sort();
      colourScale = makePeptideScale(keys.length ? keys : ["dummy"]);
    }
  }
  /* 3 SHARED X SCALE*/
  const stackedBarsSafe = (typeof stackedBars !== "undefined" ? stackedBars : []);
  const maxPos = Math.max(
    pepData.length ? d3.max(pepData, d => d.start + d.length) : 1,
    (stackedBarsSafe.length ? d3.max(stackedBarsSafe, d => d.position) : 1)
  );
  const domain = [0.5, maxPos + 0.5];
  const svgWidth = width;
  const x0       = d3.scaleLinear(domain,
                   [margin.left, svgWidth - margin.right]);
  let   xCurrent = x0;

  /* responsive SVG & slot helper */
  const svg = d3.create("svg")
    .style("width", "100%")
    .attr("font-family", "sans-serif");

  let yOff = 0;
  const slot = () => svg.append("g")
                        .attr("transform", `translate(0,${yOff})`);

  // helper: add a slim vertical y-axis label within left margin
  const addYLabel = (g, h, text) => {
    const x = Math.max(8, margin.left * 0.5);     // centered within left margin
    const y = h / 2;

    // match metricCard title styling when available
    let ff = "Roboto, sans-serif", fw = 500, fs = 18, fc = "#222";
    try {
      const t = document.querySelector('.metric-card h2');
      if (t) {
        const cs = getComputedStyle(t);
        ff = cs.fontFamily || ff;
        fw = cs.fontWeight || fw;
        fs = parseFloat(cs.fontSize) || fs;
        fc = cs.color || fc;
      }
    } catch {}

    g.append("text")
      .attr("transform", `translate(${x},${y}) rotate(-90)`)  // vertical label
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-family", ff)
      .attr("font-weight", fw)
      .attr("font-size", fs)
      .attr("fill", fc)
      .style("pointer-events", "none")            // avoid blocking hovers
      .text(text);
  };

  // unified per-chart height so all charts are equal height
  const perChartHeight = Math.max(140, Math.round(140 * sizeFactor));

  // compute peptide levels to fit peptideChart to the same height
  const computeLevels = rows => {
    const arr = Array.isArray(rows) ? rows.slice().sort((a,b)=>d3.ascending(a.start,b.start)) : [];
    const levels = [];
    for (const p of arr) {
      let lvl = levels.findIndex(end => p.start >= end);
      if (lvl === -1) { lvl = levels.length; levels.push(0); }
      levels[lvl] = p.start + p.length;
    }
    return Math.max(1, levels.length);
  };

  /* 5 - peptide viewer ---------------------------------------- */
  const gPep = slot();
  // derive rowHeight to fit equal height across charts
  const nLevels = computeLevels(pepDataForChart);
  const pepAvailH   = Math.max(24, perChartHeight - margin.top - margin.bottom);
  const pepTargetRH = 18 * sizeFactor;                // preferred bar thickness
  const pepRowHeight = Math.max(12, Math.min(pepTargetRH, pepAvailH / Math.max(1, nLevels)));
    const selectedIArray = Array.from(selectedI || []);
    const alleleDataForChart = selectedIArray.length ? (globalThis.__chartRowsI || []) : [];
    const pep = peptideChart(gPep, {
      data       : pepDataForChart,
      xScale     : xCurrent,
      rowHeight  : pepRowHeight,
      gap, sizeFactor, margin,
      colourBy        : colourByForChart,
      colourScale     : colourScale,   // null when allele mode
      isAlleleColour  : isAlleleColour,
      missingColor    : "#f0f0f0",
      alleleData      : alleleDataForChart,
      alleles         : selectedIArray,
      percentileMode  : percMode,
      onClick    : d => { setSelectedPeptide(d.peptide_aligned); setSelectedStart(d.start); setSelectedLength(d.length); }
    });
  addYLabel(gPep, perChartHeight, "Peptides");
  // ensure we allocate the unified height regardless of internal rounding
  yOff += perChartHeight;

  /* 7 reference vs consensus cells -------------------------- */
  const gSeq = slot();
  // derive cell size to fit equal height across charts
  const seqGapRows = Math.max(20, Math.round(28 * sizeFactor));
  const seqCell    = Math.max(12, Math.floor((perChartHeight - margin.top - margin.bottom - seqGapRows) / 2));
  const seqcmp = sequenceCompareChart(gSeq, {
    refRows   : (typeof refRows !== "undefined" ? refRows : []),
    consRows  : (typeof consensusRows !== "undefined" ? consensusRows : []),
    xScale    : xCurrent,
    colourMode,
    sizeFactor,
    margin,
    gapRows   : seqGapRows,
    cell      : seqCell
  });
  addYLabel(gSeq, perChartHeight, "Sequences");
  yOff += perChartHeight;

  /* 6 stacked bar chart ------------------------------------- */
  const gStack = slot();
  const stack = stackedChart(gStack, {
    data       : stackedBarsSafe,
    tooltipRows: (typeof aaFrequencies !== "undefined" ? aaFrequencies.map(d => ({
                  position : d.position,
                  aminoacid: d.aminoacid,
                  value    : d.value_selected
                })) : []),
    xScale     : xCurrent,
    sizeFactor,
    margin,
    height     : perChartHeight
  });
  addYLabel(gStack, perChartHeight, "Diversity");
  yOff += perChartHeight;

  /* 8 area chart */
  const gArea = slot();
  const area = areaChart(gArea, {
    data      : (typeof areaData !== "undefined" ? areaData : []),
    xScale    : xCurrent,
    sizeFactor,
    margin,
    height    : perChartHeight
  });
  addYLabel(gArea, perChartHeight, "Conservation");
  yOff += perChartHeight;  

  /* 9 facet overlays (only if we actually have them) */
  const facetUpdaters = [];

  if (typeof facetArea !== "undefined" && facetArea.size) {
    const titleStyle = {
      "font-family": "sans-serif",
      "font-size"  : 12*sizeFactor,
      "font-weight": "bold",
      "fill"       : "#444"
    };

    for (const [facetName, rows] of facetArea) {
      const g = slot(); 
      g.append("text")
        .attr("x",           margin.left)
        .attr("y",           margin.top - 4*sizeFactor)
        .attr("font-family", "sans-serif")
        .attr("font-size",   12*sizeFactor)
        .attr("font-weight", "bold")
        .attr("fill",        "#444")
        .text(facetName);

      const chart = areaChart(g, {
        data      : rows,
        xScale    : xCurrent,
        sizeFactor,
        margin,
        height    : 90*sizeFactor
      });
      yOff += chart.height;
      facetUpdaters.push(chart.update);
    }
  }

  /* 7 finalise SVG ------------------------------------------ */
  svg.attr("height", yOff)
     .attr("viewBox", `0 0 ${svgWidth} ${yOff}`);

  /* 8 shared zoom (integer ticks preserved) ----------------- */
  const updaters = [pep.update, stack.update, seqcmp.update, area.update, ...facetUpdaters];
  const EPS      = 1e-6;
  const zoom = d3.zoom()
    .scaleExtent([1,15])
    .translateExtent([[margin.left,0],
                      [svgWidth - margin.right, yOff]])
    .on("zoom", function (ev) {
      /* --- 1. snap to identity when user is fully zoomed out --- */
      if (Math.abs(ev.transform.k - 1) < EPS &&
          (Math.abs(ev.transform.x) > EPS)) {
        // force-reset affects every chart simultaneously
        svg.call(zoom.transform, d3.zoomIdentity);
        return;                              // skip stale update
      }

      /* --- 2. normal re-flow for any other transform ----------- */
      xCurrent = ev.transform.rescaleX(x0);
      updaters.forEach(fn => fn(xCurrent));
    });
  svg.call(zoom);

  return svg.node();
}
```

<!-- Control Panel Buttons -->
```js
import { radioButtons } from "./components/radioButtons.js";

/* Base attributes always present (now with Proportion default) */
const baseColourChoices = ["Proportion", "attribute_1", "attribute_2", "attribute_3"];

/* Recompute choices whenever the Class-I picker changes */
selectedI; // <-- reactive dependency

const colourChoices = [
  ...baseColourChoices,
  ...Array.from(selectedI || [])
];

/* Recreate the radio each time, but keep the last picked value */
const prevColourBy = globalThis.__colourByPrev;
const defaultValue = (prevColourBy && colourChoices.includes(prevColourBy))
  ? prevColourBy
  : "Proportion";

const colourAttrInput = (() => {
  const el = radioButtons(colourChoices, {
    label: "Colour peptides by:",
    value: defaultValue
  });
  try {
    if (typeof globalThis.__colourAttrNow !== "string") {
      globalThis.__colourAttrNow = defaultValue;
    }
  } catch {}
  el.addEventListener("input", () => { globalThis.__colourByPrev = el.value; });
  el.addEventListener("input", () => {
    globalThis.__colourAttrNow = el.value;
    dispatchEvent(new Event('colourAttr-change'));
  });
  return el;
})();
const colourAttr = Generators.input(colourAttrInput);

/* Are we currently colouring by an allele? (reactive) */
const normAllele = s =>
  String(s || "")
    .toUpperCase()
    .replace(/^HLA-/, "")    // tolerate HLA- prefix
    .trim();

const isAlleleColour = (() => {
  selectedI; colourAttr; // dependencies

  // Proportion is not an allele mode
  if (String(colourAttr) === "Proportion") return false;

  const attr = normAllele(colourAttr);
  if (/^ATTRIBUTE_\d+$/i.test(attr)) return false;  

  // Ensure we can map even if selectedI is a Set or Array
  const picked = new Set(Array.from(selectedI || []).map(normAllele));
  return picked.has(attr);
})();
```

```js
function attrCats(rows, attr) {
  const vals = rows.map(r => r?.[attr]);
  const cats = [...new Set(
    vals.filter(v => v != null && String(v).trim() !== "")
        .map(v => String(v))
  )].sort((a,b)=>a.localeCompare(b));
  const hasMissing = vals.some(v => v == null || String(v).trim() === "");
  return { cats, hasMissing };
}
```

```js
const peptideKeyEl = (() => {
  // reactive deps
  colourAttr; percMode; proteinCommitted; seqSet;

  const inProportionMode = String(colourAttr) === "Proportion";
  const inAlleleMode = !inProportionMode && !/^attribute_[123]$/i.test(String(colourAttr));

  if (inAlleleMode) {
    return peptideColourKey({
      label        : "Peptide colour key",
      isAllele     : true,
      mode         : percMode,   // EL/BA
      includeNoData: true,
      missingColor : "#f0f0f0"
    });
  }

  if (inProportionMode) {
    const labelText = (seqSet === "Unique sequences" ? "Unique" : "All");
    const label = `Proportion (${labelText})`;
    return peptideColourKey({
      label,
      isAllele     : false,
      gradient     : true,
      interpolator : d3.interpolateBlues,
      ticks        : [0, 0.5, 1],
      includeNoData: false,
      missingColor : "#f0f0f0"
    });
  }

  // Attribute mode (categorical)
  const pepRows = (Array.isArray(globalThis.__peptidesAligned) ? globalThis.__peptidesAligned : [])
    .filter(d => d.protein === proteinCommitted);
  const { cats, hasMissing } = attrCats(pepRows, colourAttr);
  const scale = makePeptideScale(cats.length ? cats : ["dummy"]);

  return peptideColourKey({
    label        : "Peptide colour key",
    isAllele     : false,
    categories   : cats,
    colourScale  : scale,
    includeNoData: hasMissing,
    missingColor : "#f0f0f0"
  });
})();
```

```js
// Dashboard slot that loads without waiting for uploads or module timing
const dashboardSlot = Generators.observe(change => {
  const mount = document.createElement('div');
  let rendered = false;

  function canRender() {
    try { return (typeof createIAVDashboardResponsive === 'function'); }
    catch { return false; }
  }

  function render() {
    if (rendered) return;
    if (canRender()) {
      try {
        const node = createIAVDashboardResponsive();
        mount.replaceChildren(node);
        rendered = true;
        change(mount);
        return;
      } catch (e) {
        // Leave placeholder; will retry on next tick/event
      }
    }
    if (!mount.childNodes.length) {
      const ph = document.createElement('div');
      ph.style.fontStyle = 'italic';
      ph.textContent = 'Rendering dashboard...';
      mount.appendChild(ph);
      change(mount);
    }
  }

  render();
  const id = setInterval(render, 200);
  const onEvt = () => render();
  addEventListener('peptides-ready', onEvt);
  addEventListener('tallies-ready',  onEvt);
  addEventListener('aligned-ready',  onEvt);
  if (typeof invalidation !== 'undefined' && invalidation?.then) invalidation.then(() => {
    clearInterval(id);
    removeEventListener('peptides-ready', onEvt);
    removeEventListener('tallies-ready',  onEvt);
    removeEventListener('aligned-ready',  onEvt);
  });
});
```


```js
{
  const pid = committedProteinId ?? DEFAULT_PROTEIN; // reactive dep
  const state = (globalThis.__proteinViewState ??= { last: null });
  if (state.last === pid) {
  } else {
    const url = `https://gbxc45oychilox63.public.blob.vercel-storage.com/${encodeURIComponent(pid)}.parquet`;
    await db.sql`CREATE OR REPLACE TABLE proteins_cache AS
      SELECT * FROM read_parquet('${url}')`;
    await db.sql`CREATE OR REPLACE VIEW proteins AS SELECT * FROM proteins_cache`;
    state.last = pid;
  }
}
```

```js
/* Cell colouring */
const colourModeInput = radioButtons(
  ["Mismatches", "Properties"],
  { label: "Cell colouring:", value: "Mismatches" }
);
const colourMode = Generators.input(colourModeInput);
```

```js
const aaKeyEl = aaColourKey({
  label: "Amino-acid colour key",
  square: 22,
  gap: 6,
  showGroupLabels: true
});
```

```js
/* Sequence set */
const seqSetInput = radioButtons(
  ["All sequences", "Unique sequences"],
  { label: "Sequence set:", value: "All sequences" }
);
const seqSet = Generators.input(seqSetInput);
```

<!-- Data Source Switcher -->
```js
/* Any Filters Present */
function noExtraFilters() {
  return (
    !genotypesCommitted.length          &&
    !hostsCommitted.length              &&
    !hostCategoryCommitted.length       &&
    !countriesCommitted.length          &&
    !(collectionDatesCommitted.from || collectionDatesCommitted.to) &&
    !(releaseDatesCommitted.from   || releaseDatesCommitted.to)
  );
}
```

```js
/* Calculate Position Data */
const positionStats = (
  noExtraFilters()
    ? db.sql`                       -- fast path (unchanged)
        SELECT position, aminoacid,
               frequency_all, total_all, value,
               frequency_unique, total_unique, value_unique
        FROM sequencecalc
        WHERE protein = ${proteinCommitted}`
    : db.sql`                       -- live path (narrow projection)
        WITH
        filtered AS (
          /* Only the columns used in WHERE + the one we actually need: sequence */
          SELECT sequence
          FROM   proteins
          WHERE  protein = ${ proteinCommitted }

          AND ${ genotypesCommitted.length
                  ? sql`genotype IN (${ genotypesCommitted })`
                  : sql`TRUE` }

          AND ${ hostsCommitted.length
                  ? sql`host IN (${ hostsCommitted })`
                  : sql`TRUE` }

          AND ${
                hostCategoryCommitted.includes('Human') &&
                !hostCategoryCommitted.includes('Non-human')
                  ? sql`host = 'Homo sapiens'`
                  : (!hostCategoryCommitted.includes('Human') &&
                     hostCategoryCommitted.includes('Non-human'))
                      ? sql`host <> 'Homo sapiens'`
                      : sql`TRUE`
              }

          AND ${ countriesCommitted.length
                  ? sql`country IN (${ countriesCommitted })`
                  : sql`TRUE` }

          AND ${
            collectionDatesCommitted.from || collectionDatesCommitted.to
              ? sql`
                  TRY_CAST(
                    CASE
                      WHEN collection_date IS NULL OR collection_date = '' THEN NULL
                      WHEN LENGTH(collection_date)=4  THEN collection_date || '-01-01'
                      WHEN LENGTH(collection_date)=7  THEN collection_date || '-01'
                      ELSE collection_date
                    END AS DATE
                  )
                  ${
                    collectionDatesCommitted.from && collectionDatesCommitted.to
                      ? sql`BETWEEN CAST(${ collectionDatesCommitted.from } AS DATE)
                               AND   CAST(${ collectionDatesCommitted.to   } AS DATE)`
                      : collectionDatesCommitted.from
                          ? sql`>= CAST(${ collectionDatesCommitted.from } AS DATE)`
                          : sql`<= CAST(${ collectionDatesCommitted.to   } AS DATE)`
                  }
                `
              : sql`TRUE`
          }

          AND ${
            releaseDatesCommitted.from || releaseDatesCommitted.to
              ? sql`
                  TRY_CAST(
                    CASE
                      WHEN release_date IS NULL OR release_date = '' THEN NULL
                      WHEN LENGTH(release_date)=4 THEN release_date || '-01-01'
                      WHEN LENGTH(release_date)=7 THEN release_date || '-01'
                      ELSE release_date
                    END AS DATE
                  )
                  ${
                    releaseDatesCommitted.from && releaseDatesCommitted.to
                      ? sql`BETWEEN CAST(${ releaseDatesCommitted.from } AS DATE)
                               AND   CAST(${ releaseDatesCommitted.to   } AS DATE)`
                      : releaseDatesCommitted.from
                          ? sql`>= CAST(${ releaseDatesCommitted.from } AS DATE)`
                          : sql`<= CAST(${ releaseDatesCommitted.to   } AS DATE)`
                  }
                `
              : sql`TRUE`
          }
        ),

        /* downstream identical*/
        parsed AS ( SELECT sequence, LENGTH(sequence) AS len FROM filtered ),
        pos    AS ( SELECT p.sequence, gs.position
                    FROM parsed p CROSS JOIN generate_series(1, p.len) AS gs(position) ),
        chars  AS ( SELECT position, SUBSTRING(sequence, position, 1) AS aminoacid FROM pos ),
        counts AS ( SELECT position, aminoacid, COUNT(*) AS cnt FROM chars GROUP BY position, aminoacid ),
        totals AS ( SELECT position, SUM(cnt) AS total   FROM counts GROUP BY position ),

        filtered_u AS ( SELECT DISTINCT sequence FROM filtered ),
        parsed_u   AS ( SELECT sequence, LENGTH(sequence) AS len FROM filtered_u ),
        pos_u      AS ( SELECT p.sequence, gs.position
                        FROM parsed_u p CROSS JOIN generate_series(1, p.len) AS gs(position) ),
        chars_u    AS ( SELECT position, SUBSTRING(sequence, position, 1) AS aminoacid FROM pos_u ),
        counts_u   AS ( SELECT position, aminoacid, COUNT(*) AS cnt FROM chars_u GROUP BY position, aminoacid ),
        totals_u   AS ( SELECT position, SUM(cnt) AS total   FROM counts_u GROUP BY position )

        SELECT
          c.position, c.aminoacid,
          CAST(c.cnt AS INT)    AS frequency_all,
          CAST(t.total AS INT)  AS total_all,
          (c.cnt::DOUBLE) / t.total AS value,
          CAST(cu.cnt AS INT)   AS frequency_unique,
          CAST(tu.total AS INT) AS total_unique,
          (cu.cnt::DOUBLE) / tu.total AS value_unique
        FROM   counts c
        JOIN   totals t USING (position)
        LEFT   JOIN counts_u cu ON cu.position = c.position AND cu.aminoacid = c.aminoacid
        LEFT   JOIN totals_u tu USING (position)
        ORDER  BY c.position, c.aminoacid
    `
);
```

```js
/* JS Array for Plotting */
const aaFrequencies = (
  await (globalThis.__perfUtils?.perfAsync?.('sql: positionStats -> aaFrequencies', async () => await positionStats.toArray()))
).map(r => {
  const all  = Number(r.value       );
  const uniq = Number(r.value_unique);
  return {
    position        : Number(r.position),
    aminoacid       : r.aminoacid,
    value_selected  : (seqSet === "Unique sequences" ? uniq : all)
  };
});

// stash + event for non-reactive dashboard consumers
try { globalThis.__aaFrequencies = aaFrequencies; dispatchEvent(new Event('aa-ready')); } catch {}

/* Stacked Bar Chart Data */
const stackedBars = (() => {
  const rows = [];
  for (const [pos, arows] of d3.group(aaFrequencies, d=>d.position)) {
    const maxVal = d3.max(arows, d=>d.value_selected);
    arows
      .filter(d => d.value_selected !== maxVal)
      .sort((a,b)=>d3.descending(a.value_selected,b.value_selected))
      .reduce((y0,d)=>{
        rows.push({
          position : +pos,
          aminoacid: d.aminoacid,
          y0,
          y1      : y0 += d.value_selected
        });
        return y0;
      },0);
  }
  return rows;
})();

try { globalThis.__stackedBars = stackedBars; dispatchEvent(new Event('stacked-ready')); } catch {}

/* Area Chart Data */
const areaData = Array.from(
  d3.group(aaFrequencies, d => d.position),
  ([position, rows]) => {
    const top = rows.reduce((a, b) =>
      b.value_selected > a.value_selected ? b : a
    );
    return {
      position : +position,
      value    : top.value_selected,
      aminoacid: top.aminoacid
    };
  }
).sort((a, b) => d3.ascending(a.position, b.position));

try { globalThis.__areaData = areaData; dispatchEvent(new Event('area-ready')); } catch {}
```

```js
// Warm-up: trigger DB-derived series so dashboard can draw immediately
{
  try {
    // Touch deps so Observable computes them now
    void positionStats;
    const aa = await (globalThis.__perfUtils?.perfAsync?.('warm:aaFrequencies', async () => aaFrequencies));
    const sb = stackedBars;
    const ad = areaData;
    // Ensure listeners rerender even if they subscribed late
    dispatchEvent(new Event('aa-ready'));
    dispatchEvent(new Event('stacked-ready'));
    dispatchEvent(new Event('area-ready'));
  } catch (e) {
  }
}


/* Proportion index for peptide colouring (All vs Unique reflects seqSet) */
const proportionIndex = await (async () => {
  seqSet; peptideWindows; committedProteinId;  // reactive deps
  const rows = await getWindowTalliesRows(peptideWindows);
  const useUnique = (seqSet === "Unique sequences");
  const map = new Map();
  for (const r of rows) {
    const pepU = String(r.peptide || "").toUpperCase().replace(/-/g, "");
    const key  = `${r.start}|${r.len}|${pepU}`;
    map.set(key, useUnique ? Number(r.proportion_unique) : Number(r.proportion_all));
  }
  return map;
})();

function getPeptideProportion(d) {
  const pepU = String(d.peptide_aligned || d.peptide || "").toUpperCase().replace(/-/g, "");
  const key  = `${d.start}|${d.length}|${pepU}`;
  const v = proportionIndex.get(key);
  return (v != null && isFinite(v)) ? +v : 0;  // treat missing as 0 (lightest blue)
}
try { globalThis.__getPeptideProportion = getPeptideProportion; } catch {}


/* reference (aligned) sequence rows*/
const refAligned = fastaAligned.find(d => d.protein === proteinCommitted )
                     ?.aligned_sequence ?? "";               // empty string if none
const refRows = refAligned.split("")
  .map((aa,i)=>({ position:i+1, aminoacid:aa }));
try { globalThis.__refRows = refRows; } catch {}

/* consensus rows (respecting the All / Unique toggle) */
const consensusRows = Array.from(
  d3.rollups(
    aaFrequencies,
    v => v.reduce((m,r)=> r.value_selected>m.value_selected? r : m),
    d => d.position
  ),
  ([pos, r]) => ({ position:+pos, aminoacid:r.aminoacid })
).sort((a,b)=>d3.ascending(a.position,b.position));
try { globalThis.__consensusRows = consensusRows; } catch {}

/* facetArea :  Map<facetKey [{position,value,aminoacid}]> */
const facetArea = new Map();


if (positionFacetStats !== null) {
  const rows = await (globalThis.__perfUtils?.perfAsync?.('sql: positionFacetStats', async () => await positionFacetStats.toArray()));

  /* choose the right value column once */
  const valueField = (seqSet === "Unique sequences" ? "value_unique" : "value");

  for (const [facetKey, groupRows] of d3.group(rows, d => d.facet)) {
    const areaRows = Array.from(
      d3.group(groupRows, d => d.position),
      ([position, posRows]) => {
        const top = posRows.reduce(
          (m, x) => (x[valueField] > m[valueField] ? x : m)
        );
        return {
          position : +position,
          value    : Number(top[valueField]),
          aminoacid: top.aminoacid
        };
      }
    ).sort((a,b)=>d3.ascending(a.position,b.position));

    facetArea.set(facetKey ?? "Unknown", areaRows);   // null ? "Unknown"
  }
}
```

```js
/* Peptide JS Array */
const rowsRaw = await (globalThis.__perfUtils?.perfAsync?.('sql: peptideProps', async () => await peptideProps.toArray()));

/* Peptide Unique vs All Switcher */
const useUnique = seqSet === "Unique sequences";

const propCol = useUnique ? "proportion_unique" : "proportion_all";
const freqCol = useUnique ? "frequency_unique"  : "frequency_all";
const totCol  = useUnique ? "total_unique"      : "total_all";

/* Map Peptide Plot Data */
const heatmapData = rowsRaw.map(r => ({
  peptide   : r.peptide,
  proportion: Number(r[propCol]),
  frequency : Number(r[freqCol]),
  total     : Number(r[totCol])
}));

/* Create Peptide Plot */
// Prepare allele overlay data lazily to avoid hard dependency on chartRowsI
const __selI = Array.from(selectedI || []);
const __chartRows = __selI.length ? (globalThis.__chartRowsI || []) : [];
const heatmapSVG = peptideHeatmap({
  data        : heatmapData,                        // peptides (ungapped)
  selected    : selectedPeptide,                    // may include '-'
  colourMode  : colourMode,
  alleleData  : __chartRows,                        // cache + API (snake_case)
  alleles     : __selI,
  mode        : percMode,                           // "EL" | "BA"
  showAlleles : true,
  baseCell    : (() => { let px=16; try{ const h2=document.querySelector('.metric-card h2'); if(h2) px=parseFloat(getComputedStyle(h2).fontSize)||16; }catch{} return Math.max(22, Math.round(px*2.0)); })(),
  height0     : (() => {
    let px=16; try{ const h2=document.querySelector('.metric-card h2'); if(h2) px=parseFloat(getComputedStyle(h2).fontSize)||16; }catch{}
    const nRows   = 5;                    // head + topN (default 4)
    const cell    = Math.max(22, Math.round(px*2.0));
    const basePad = 36;                   // approx = (margins + misc labels)
    const reserve = Math.round(cell * 1.8); // reserve for diagonal allele labels (xLabelBand)
    const h0      = Math.round((px*2) * (basePad + reserve + nRows*cell) / cell);
    return Math.max(200, Math.min(440, h0));
  })(),
  margin      : { top:20, right:150, bottom:20, left:4 }
});
```

```js
/* Reset Peptide Plot when Protein Changes */
{
  const _ = proteinCommitted;
  setSelectedPeptide(null);
  setSelectedStart(null);
  setSelectedLength(null);
}
```

```js
/* Immediate heatmap wrapper (no heavy deps at top-level) */
const heatmapSVG2 = Generators.observe(change => {
  const mount = document.createElement('div');

  const baseCellPx = (() => { let px=16; try{ const h2=document.querySelector('.metric-card h2'); if(h2) px=parseFloat(getComputedStyle(h2).fontSize)||16; }catch{} return Math.max(22, Math.round(px*2.0)); })();
  const height0Px  = (() => {
    let px=16; try{ const h2=document.querySelector('.metric-card h2'); if(h2) px=parseFloat(getComputedStyle(h2).fontSize)||16; }catch{}
    const nRows   = 5;
    const cell    = Math.max(22, Math.round(px*2.0));
    const basePad = 36;
    const reserve = Math.round(cell * 1.8);
    const h0      = Math.round((px*2) * (basePad + reserve + nRows*cell) / cell);
    return Math.max(200, Math.min(440, h0));
  })();

  const pickOverlayRows = () => {
    const selI = Array.from(selectedI || []);
    const rows = selI.length ? (globalThis.__chartRowsI || []) : [];
    return { selI, rows };
  };

  function buildHeatmapRows() {
    const selStart = Number(selectedStart);
    const selLen   = Number(selectedLength);
    const useUnique = (seqSet === "Unique sequences");
    const propCol = useUnique ? "proportion_unique" : "proportion_all";
    const freqCol = useUnique ? "frequency_unique"  : "frequency_all";
    const totCol  = useUnique ? "total_unique"      : "total_all";
    const src = Array.isArray(globalThis.__windowTalliesRows) ? globalThis.__windowTalliesRows : [];
    if (!(selStart > 0 && selLen > 0) || !src.length) return [];
    return src
      .filter(r => Number(r.start) === selStart && Number(r.len) === selLen)
      .map(r => ({ peptide: r.peptide, proportion: +r[propCol], frequency: +r[freqCol], total: +r[totCol] }));
  }

  function render() {
    const { selI, rows } = pickOverlayRows();
    const data = buildHeatmapRows();
    const node = peptideHeatmap({
      data,
      selected    : selectedPeptide,
      colourMode  : colourMode,
      alleleData  : rows,
      alleles     : selI,
      mode        : percMode,
      showAlleles : true,
      baseCell    : baseCellPx,
      height0     : height0Px,
      margin      : { top:20, right:150, bottom:20, left:4 }
    });
    mount.replaceChildren(node);
    change(mount);
  }

  // initial render
  render();
  const onEvt = () => render();
  addEventListener('peptides-ready', onEvt);
  addEventListener('tallies-ready',  onEvt);
  addEventListener('alleleRows-ready',  onEvt);
  addEventListener('peptide-selected', onEvt);
  if (typeof invalidation !== 'undefined' && invalidation?.then) invalidation.then(() => {
    removeEventListener('peptides-ready', onEvt);
    removeEventListener('tallies-ready',  onEvt);
    removeEventListener('alleleRows-ready',  onEvt);
    removeEventListener('peptide-selected', onEvt);
  });
});
```

```js
/* facetChoices */
const facetChoices = (() => {
  const list = ["None"];                 // always available

  if (genotypesCommitted.length) list.push("Genotype");
  if (hostsCommitted.length)     list.push("Host");
  if (countriesCommitted.length) list.push("Country");

  return list;
})();
```

```js
/* radio input */
const facetSelectInput = Inputs.radio(
  facetChoices,
  {
    label : "Facet by:",
    value : facetChoices[0]
  }
);
const facetSelect = Generators.input(facetSelectInput);
```

```js
// how many facet levels to render at once (tune as needed)
const MAX_FACETS = 6;

// Unique vs All toggle (you already have this elsewhere; mirroring here)
const useUnique = (seqSet === "Unique sequences");

/* Replaces your entire positionFacetStats cell */
const positionFacetStats =
  (facetSelect === "None" || noExtraFilters())
    ? null
    : db.sql`
WITH base AS (
  SELECT
    ${
      facetSelect === "Genotype"
        ? sql`genotype`
        : facetSelect === "Host"
          ? sql`host`
          : sql`country`
    } AS facet,
    sequence
  FROM proteins
  /* push ALL filters here so we only touch the committed protein rows */
  WHERE protein = ${proteinCommitted}

    AND ${ genotypesCommitted.length
            ? sql`genotype IN (${ genotypesCommitted })` : sql`TRUE` }

    AND ${ hostsCommitted.length
            ? sql`host IN (${ hostsCommitted })` : sql`TRUE` }

    AND ${
          hostCategoryCommitted.includes('Human') &&
          !hostCategoryCommitted.includes('Non-human')
            ? sql`host = 'Homo sapiens'`
            : (!hostCategoryCommitted.includes('Human') &&
               hostCategoryCommitted.includes('Non-human'))
                ? sql`host <> 'Homo sapiens'`
                : sql`TRUE`
        }

    AND ${ countriesCommitted.length
            ? sql`country IN (${ countriesCommitted })` : sql`TRUE` }

    AND ${
      collectionDatesCommitted.from || collectionDatesCommitted.to
        ? sql`
            TRY_CAST(
              CASE
                WHEN collection_date IS NULL OR collection_date = '' THEN NULL
                WHEN LENGTH(collection_date)=4  THEN collection_date || '-01-01'
                WHEN LENGTH(collection_date)=7  THEN collection_date || '-01'
                ELSE collection_date
              END AS DATE
            )
            ${
              collectionDatesCommitted.from && collectionDatesCommitted.to
                ? sql`BETWEEN CAST(${collectionDatesCommitted.from} AS DATE)
                         AND   CAST(${collectionDatesCommitted.to  } AS DATE)`
                : collectionDatesCommitted.from
                    ? sql`>= CAST(${collectionDatesCommitted.from} AS DATE)`
                    : sql`<= CAST(${collectionDatesCommitted.to   } AS DATE)`
            }
          ` : sql`TRUE`
    }

    AND ${
      releaseDatesCommitted.from || releaseDatesCommitted.to
        ? sql`
            TRY_CAST(
              CASE
                WHEN release_date IS NULL OR release_date = '' THEN NULL
                WHEN LENGTH(release_date)=4 THEN release_date || '-01-01'
                WHEN LENGTH(release_date)=7 THEN release_date || '-01'
                ELSE release_date
              END AS DATE
            )
            ${
              releaseDatesCommitted.from && releaseDatesCommitted.to
                ? sql`BETWEEN CAST(${releaseDatesCommitted.from} AS DATE)
                         AND   CAST(${releaseDatesCommitted.to  } AS DATE)`
                : releaseDatesCommitted.from
                    ? sql`>= CAST(${releaseDatesCommitted.from} AS DATE)`
                    : sql`<= CAST(${releaseDatesCommitted.to   } AS DATE)`
            }
          ` : sql`TRUE`
    }
),

b AS (
  ${ useUnique
      ? sql`SELECT DISTINCT facet, sequence FROM base`
      : sql`SELECT facet, sequence FROM base` }
),

/* keep only the busiest facet levels to cap worst-case memory */
top_facets AS (
  SELECT facet
  FROM b
  GROUP BY facet
  ORDER BY COUNT(*) DESC NULLS LAST
  LIMIT ${MAX_FACETS}
),

b2 AS (
  SELECT b.facet, b.sequence
  FROM b
  JOIN top_facets t USING (facet)
),

/* explode *only* the already-filtered, capped set */
parsed AS ( SELECT facet, sequence, LENGTH(sequence) AS len FROM b2 ),
pos    AS ( SELECT facet, sequence, gs.position
           FROM parsed p, generate_series(1, p.len) AS gs(position) ),
chars  AS ( SELECT facet, position,
                   SUBSTRING(sequence, position, 1) AS aminoacid
            FROM pos ),

/* counts + totals */
counts AS ( SELECT facet, position, aminoacid, COUNT(*) AS cnt
            FROM chars
            GROUP BY facet, position, aminoacid ),
totals AS ( SELECT facet, position, SUM(cnt) AS total
            FROM counts
            GROUP BY facet, position ),

/* rank in SQL so we only return the single top-AA per position */
ranked AS (
  SELECT
    facet, position, aminoacid,
    CAST(cnt   AS INT)   AS frequency,
    CAST(total AS INT)   AS total,
    (cnt::DOUBLE)/total  AS value_current,  -- the only metric we need
    ROW_NUMBER() OVER (
      PARTITION BY facet, position
      ORDER BY (cnt::DOUBLE)/total DESC, aminoacid
    ) AS r
  FROM counts JOIN totals USING (facet, position)
)

/* name the column to match your JS switch: value or value_unique */
SELECT
  facet, position, aminoacid, frequency, total,
  ${ useUnique
      ? sql`value_current AS value_unique, NULL::DOUBLE AS value`
      : sql`value_current AS value,        NULL::DOUBLE AS value_unique` }
FROM ranked
WHERE r = 1
ORDER BY facet, position, aminoacid
`;

```

```js
/* 1.  Prepare an in-memory table of all aligned peptides */
const peptideParams = peptidesAligned
  .filter(d => d.peptide_aligned && d.start && String(d.protein || '').toUpperCase() === committedProteinId)   // only usable rows (committed protein only)
  .map(d => ({
    protein : d.protein,
    peptide : d.peptide_aligned,
    start   : d.start,           // 1-based aligned start
    len     : d.aligned_length
  }));  
```

```js
const joinSql = (arr, sep = sql`, `) =>
  arr.reduce((acc, cur, i) => (i === 0 ? cur : sql`${acc}${sep}${cur}`), sql``);

/* 2 · build VALUES rows for every uploaded peptide */
const peptideValues = peptidesAligned
  .filter(d => d.peptide_aligned && d.start && String(d.protein || '').toUpperCase() === committedProteinId)          // skip unusable rows (committed protein only)
  .map(r =>
    sql`(${r.protein}, ${r.peptide_aligned},
         ${r.start}, ${r.aligned_length})`
  );
```

```js
if (!globalThis.__peptideCache) {
  globalThis.__peptideCache = { key: null, table: null };
}
```

```js
/* New: getPeptidePropsAll using unified tallies (single protein) */
function getPeptidePropsAll() {
  const pid = committedProteinId; // reactive

  // uploaded peptides for committed protein only
  const uploaded = peptidesAligned
    .filter(d => d.peptide_aligned && d.start && String(d.protein || '').toUpperCase() === pid);
  const uploadedSet = new Set(uploaded.map(d => String(d.peptide_aligned).toUpperCase()));

  // windows set from uploaded peptides
  const windows = [...new Map(
    uploaded.map(r => [`${r.start}|${r.aligned_length}`, { start: +r.start, len: +r.aligned_length }])
  ).values()];

  const filterKey = JSON.stringify({
    protein         : pid,
    genotypes       : [...genotypesCommitted].sort(),
    hosts           : [...hostsCommitted].sort(),
    hostCategory    : [...hostCategoryCommitted].sort(),
    countries       : [...countriesCommitted].sort(),
    collectionDates : collectionDatesCommitted,
    releaseDates    : releaseDatesCommitted,
    nPeptides       : uploadedSet.size,
    windowsKey      : windows.map(w => `${w.start}|${w.len}`).sort().join(',')
  });

  if (globalThis.__peptideCache?.key === filterKey && globalThis.__peptideCache.table) {
    return globalThis.__peptideCache.table;
  }

  if (!uploadedSet.size || !windows.length) {
    const empty = { toArray: async () => [] };
    globalThis.__peptideCache = { key: filterKey, table: empty };
    return empty;
  }

  const table = {
    toArray: async () => {
      const tallies = await getWindowTalliesRows(windows);
      const wanted = uploadedSet;

      const byPep = d3.group(tallies.filter(r => wanted.has(String(r.peptide).toUpperCase())), r => r.peptide);
      const out = [];
      for (const [pep, arr] of byPep) {
        const frequency_all   = d3.sum(arr, r => +r.frequency_all);
        const frequency_unique= d3.sum(arr, r => +r.frequency_unique);
        const total_all       = arr[0]?.total_all ?? 0;
        const total_unique    = arr[0]?.total_unique ?? 0;
        out.push({
          protein            : proteinCommitted,
          peptide            : pep,
          frequency_all,
          total_all,
          proportion_all     : total_all ? (frequency_all / total_all) : 0,
          frequency_unique,
          total_unique,
          proportion_unique  : total_unique ? (frequency_unique / total_unique) : 0
        });
      }
      out.sort((a,b) => d3.descending(+a.proportion_all, +b.proportion_all) || a.peptide.localeCompare(b.peptide));
      return out;
    }
  };

  globalThis.__peptideCache = { key: filterKey, table };
  return table;
}
```

```js
/* Keeps the old name so downstream cells dont change */
const peptidePropsAll = getPeptidePropsAll();
```

```js
/* 
   NetMHC-pan integration Class I & II*/
const statusBanner = html`<div style="margin:0.5rem 0; font-style:italic;"></div>`;
function setBanner(msg) {
  statusBanner.textContent = msg;
}

/* RUN buttons */
const runBtnI  = runButton("Run Class I (EL + BA)");
const runBtnII = runButton("Run Class II (EL + BA)");

// keep your existing reactive plumbing
const trigI  = Generators.input(runBtnI);
const trigII = Generators.input(runBtnII);

```

```js
// Snapshot `getValue()` right now and again every time `view` fires.
// No addEventListener anywhere ?? we rely purely on Generators.input(view).
function snapshotOn(view, getValue) {
  return Generators.observe(change => {
    const push = () => change(getValue());
    // initial snapshot
    push();
    // re-snapshot whenever the view emits
    (async () => {
      for await (const _ of Generators.input(view)) push();
    })();
    // no teardown necessary for Generators.input
    return () => {};
  });
}
```

```js
/* state holders */
const resultsArrayI = Mutable([]);
const resultsArrayII = Mutable([]);

const excludedI = Mutable([]);      // peptides <8 or >14
const excludedII = Mutable([]);     // peptides <11 or >30
```

```js
/* helpers to talk to IEDB  */
function buildBodyI(alleles, fasta) {
  return {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : "mhci",
      input_sequence_text: fasta,
      input_parameters: {
        alleles: alleles.join(","),
        peptide_length_range: null,
        predictors: [
          {type:"binding", method:"netmhcpan_el"},
          {type:"binding", method:"netmhcpan_ba"}
        ]
      }
    }]
  };
}
function buildBodyII(alleles, fasta) {
  return {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : "mhcii",
      input_sequence_text: fasta,
      input_parameters: {
        alleles: alleles.join(","),
        peptide_length_range: null,
        predictors: [
          {type:"binding", method:"netmhciipan_el"},
          {type:"binding", method:"netmhciipan_ba"}
        ]
      }
    }]
  };
}
```

```js
async function submit(body) {
  const r = await fetch("/api/iedb-pipeline", {
    method:"POST",
    headers:{"content-type":"application/json"},
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  const j   = (()=>{try{return JSON.parse(txt);}catch{return txt;}})();
  if (!r.ok) throw new Error(j.errors?.join("; ") || r.statusText);
  const id = j.results_uri.split("/").pop();
  return id;       // result_id
}

async function poll(resultId, timeout = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await fetch(`/api/iedb-result?id=${resultId}`);
    const txt = await r.text();
    const j   = (()=>{try{return JSON.parse(txt);}catch{return txt;}})();
    if (j.status === "done")
      {
        return j.data?.results?.find(t => t.type === "peptide_table");
      }
    await new Promise(res => setTimeout(res, 1000));
  }
  throw new Error("Timed out");
}

function rowsFromTable(tbl) {
  const keys = tbl.table_columns.map(c => c.display_name || c.name);
  return tbl.table_data.map(r => Object.fromEntries(r.map((v,i)=>[keys[i],v])));
}

/* peptide-upload helper (re-uses existing peptideFile) ---------- */
async function parsePeptides(file) {
  if (!file) return [];
  const text = await file.text();
  const [hdr, ...lines] = text.trim().split(/\r?\n/);
  const cols = hdr.split(",").map(s => s.trim().toLowerCase());
  const idx  = cols.indexOf("peptide");
  if (idx < 0) return [];
  return lines
    .map(l => l.split(",")[idx]?.trim()?.toUpperCase())
    .filter(Boolean);
}

/* parse uploaded peptide table with protein column ------------- */
async function parsePeptideTable(file) {
  if (!file) return [];
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map(s => s.trim());
  const lower   = headers.map(h => h.toLowerCase());
  const iPep    = lower.indexOf("peptide");
  const iProt   = lower.indexOf("protein");

  if (iPep < 0) return [];

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const pep  = cols[iPep]?.trim()?.toUpperCase();
    const prot = iProt >= 0 ? cols[iProt]?.trim() : null;
    if (pep) out.push({ peptide: pep, protein: prot });
  }
  return out;
}

```

```js
/* committed protein id */
function normalizeProteinId(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.id ?? v.value ?? v.protein ?? null;
  return null;
}

const committedProteinId = (() => {
  const raw = proteinCommitted;
  const id  = normalizeProteinId(raw);
  const out = id ? String(id).trim().toUpperCase() : null;
  return out;
})();
```

```js
/* Unified schema (snake_case) for Class I rows */
const keyMapI = {
  "peptide": "peptide",
  "allele": "allele",
  "netmhcpan_el percentile": "netmhcpan_el_percentile",
  "netmhcpan_ba percentile": "netmhcpan_ba_percentile"
};
// Cache rows already come in these 4 columns.
function normalizeRowI_cache(r) {
  return {
    allele: String(r.allele).toUpperCase(),    // keep HLA- prefix; pushdown uses exact match
    peptide: String(r.peptide).toUpperCase(),
    netmhcpan_el_percentile: +r.netmhcpan_el_percentile,  // already 2dp in slim file
    netmhcpan_ba_percentile: +r.netmhcpan_ba_percentile
  };
}

/* API table rows (display headers) only the 4 fields we keep */
function normalizeRowI_api(r) {
  return {
    allele: String(r["allele"] ?? r.allele).toUpperCase(),
    peptide: String(r["peptide"] ?? r.peptide).toUpperCase(),
    netmhcpan_el_percentile: +r["netmhcpan_el percentile"],
    netmhcpan_ba_percentile: +r["netmhcpan_ba percentile"]
  };
}
```

```js
const peptidesI = await (async () => {
  if (!peptideFile) return [];
  const all = await parsePeptides(peptideFile);
  return all.map(p => p.replace(/-/g,""))
            .filter(p => p.length >= 8 && p.length <= 14);
})();
```

```js
const winLens = peptideWindows.map(w => w.len);
```

```js
/* Class I cache preview for the committed protein */
const cachePreviewI = await (async () => {
  selectedI;
  committedProteinId;

  const allelesRaw = Array.from(alleleCtrl1.value || []);   // e.g. "HLA-A*01:01"
  const pepsRaw    = peptidesIWorkset;

  if (!committedProteinId || !allelesRaw.length || !pepsRaw.length) return [];

  // No local cache; skip DB lookup
  const cacheRows = [];

  return cacheRows.map(normalizeRowI_cache);
})();
```

```js
/* merged rows for the chart  */
const chartRowsI = (() => {
  selectedI;
  committedProteinId;
  cachePreviewI;
  peptidesIWorkset;
  runResultsI;

  const allelesNow = new Set((alleleCtrl1?.value || []).map(a => String(a).toUpperCase()));
  const allowed    = new Set((peptidesIWorkset || []).map(p => String(p).toUpperCase()));
  if (!allelesNow.size || !allowed.size) return [];

  const map = new Map();


  for (const r of cachePreviewI) {
    const al = String(r.allele || "").toUpperCase();
    const pp = String(r.peptide|| "").toUpperCase();
    if (allowed.has(pp) && allelesNow.has(al)) {
      map.set(`${al}|${pp}`, r);
    }
  }
  const apiRows = Array.isArray(runResultsI) ? runResultsI : [];
  for (const r of apiRows) {
    const al = String(r.allele || "").toUpperCase();
    const pp = String(r.peptide|| "").toUpperCase();
    if (allowed.has(pp) && allelesNow.has(al)) {
      map.set(`${al}|${pp}`, r);
    }
  }
  const out = [...map.values()];
  try { globalThis.__chartRowsI = out; dispatchEvent(new Event('alleleRows-ready')); } catch {}
  return out;
})();
```

```js
/* ---- NetMHC batch size ---- */
const NETMHC_CHUNK_SIZE = 1000;   // was ~25 before; now 1000 as requested
```

```js
/* RUN results Class I  */
const runResultsI = await (async () => {
  trigI;

  const allelesSel = Array.from(committedI || []);
  const pepsSel    = Array.from(committedWorksetI || []);

  if (!allelesSel.length) { setBanner("Class I: no alleles selected."); return []; }
  if (!pepsSel.length)    { setBanner("Class I: no peptides to run.");  return []; }

  setBanner(`Class I: checking cache for ${pepsSel.length} peptides`);

  // No local cache available
  const cacheRows = [];

  const normCache = cacheRows.map(normalizeRowI_cache);
  const cacheKey  = r => `${r.allele}|${r.peptide}`;
  const cacheSet  = new Set(normCache.map(cacheKey));

  const missingByAllele = new Map();
  for (const al of allelesSel) {
    const alU = String(al).toUpperCase();
    const miss = [];
    for (const p of pepsSel) {
      const pU = String(p).toUpperCase();
      if (!cacheSet.has(`${alU}|${pU}`)) miss.push(p);
    }
    if (miss.length) missingByAllele.set(al, miss);
  }

  if (missingByAllele.size === 0) {
    const merged = [...new Map(normCache.map(r => [cacheKey(r), r])).values()];
    resultsArrayI.value = merged;
    setBanner(`Class I: all ${merged.length} rows from cache ?
`);
    return merged;
  }

  const allelesToQuery = [...missingByAllele.keys()];
  const unionMissing   = [...new Set([].concat(...allelesToQuery.map(al => missingByAllele.get(al))))];

  const chunks = [];
  for (let i = 0; i < unionMissing.length; i += NETMHC_CHUNK_SIZE) {
    chunks.push(unionMissing.slice(i, i + NETMHC_CHUNK_SIZE));
  }

  const apiRowsAll = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      setBanner(`Class I: submitting chunk ${i+1}/${chunks.length} (${chunk.length} peptides)`);
      const fasta = chunk.map((p,idx)=>`>p${idx+1}\n${p}`).join("\n");

      const id  = await submit(buildBodyI(allelesToQuery, fasta));
      setBanner(`Class I: polling chunk ${i+1}/${chunks.length}`);
      const tbl = await poll(id);
      const apiRows = rowsFromTable(tbl);

      // Keep only the 4 columns + standardize case once
      for (const r of apiRows) {
        apiRowsAll.push(normalizeRowI_api(r));
      }

      await new Promise(res => setTimeout(res, 150));
    } catch (err) {
      setBanner(`Class I: chunk ${i+1} failed (${err.message}). Continuing`);
      await new Promise(res => setTimeout(res, 250));
    }
  }

  // merge cache + API (API wins)
  const map = new Map();
  for (const r of normCache) map.set(`${r.allele}|${r.peptide}`, r);
  for (const r of apiRowsAll) map.set(`${r.allele}|${r.peptide}`, r);

  const merged = [...map.values()];
  resultsArrayI.value = merged;

  const uniqueApi = new Set(apiRowsAll.map(r => `${r.allele}|${r.peptide}`)).size;
  setBanner(`Class I done  ${merged.length} rows (cache ${cacheSet.size} + new ${uniqueApi}).`);
  return merged;
})();
```

```js
/* RUN pipeline Class II  */
trigII;                     // make cell reactive
(async () => {
  if (!peptideFile) return;
  setBanner("Class II: starting");

  const alleles = Array.from(alleleCtrl2.value || []);  // Class II
  const allPeps = await parsePeptides(peptideFile);
  const okPeps  = allPeps.filter(p => p.length >= 11 && p.length <= 30);
  excludedII.value = allPeps.filter(p => p.length < 11 || p.length > 30);

  if (!alleles.length)  return setBanner("Class II: no alleles selected.");
  if (!okPeps.length)   return setBanner("Class II: no peptides in 11-30 range.");

  const fasta = okPeps.map((p,i)=>`>p${i+1}\n${p}`).join("\n");
  try {
    const id  = await submit(buildBodyII(alleles, fasta));
    setBanner("Class II: polling");
    const tbl = await poll(id);
    resultsArrayII.value = rowsFromTable(tbl);
    setBanner(`Class II done ?? ${resultsArrayII.value.length} rows.`);
  } catch (err) {
    setBanner(`Class II error: ${err.message}`);
  }
})();
```

```js
/* CSV download helpers */
function makeDownloadButton(label, rowsMut, filename) {
  const btn = Inputs.button(label);
  btn.onclick = () => {
    const rows = rowsMut.value;
    if (!rows.length) { alert(`No ${label.toLowerCase()} yet.`); return; }
    const cols = Object.keys(rows[0]);
    const csv  = [
      cols.join(","), ...rows.map(r => cols.map(c => r[c]).join(","))
    ].join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {href:url, download:filename}).click();
    URL.revokeObjectURL(url);
  };
  return btn;
}

const downloadCSVI  = downloadButton({
  filename: "mhcI_predictions.csv",
  data    : () => resultsArrayI.value,
  tooltipTitle: "Download Class I predictions",
  tooltipBody : "netMHCpan EL/BA scores and percentiles for selected Class I alleles and peptide workset. Outputs as .csv"
});

const downloadCSVII = downloadButton({
  filename: "mhcII_predictions.csv",
  data    : () => resultsArrayII.value,
  tooltipTitle: "Download Class II predictions",
  tooltipBody : "netMHCIIpan EL/BA scores and percentiles for selected Class II alleles and uploaded peptides. Outputs as .csv"
});

// Annotated Class I CSV: merge predictions with tallies and root peptide
const downloadCSVI_annot = downloadButton({
  filename: "mhcI_predictions_annotated.csv",
  tooltipTitle: "Download Class I + tallies + root",
  tooltipBody : "Protein, allele, peptide, EL/BA percentiles plus frequency/proportion tallies and root (source input peptide).",
  data: () => {
    try {
      const base = Array.isArray(resultsArrayI?.value) ? resultsArrayI.value : [];
      if (!base.length) return [];

      // Peptides we need to annotate
      const pepSet = new Set(base.map(r => String(r.peptide || "").toUpperCase().replace(/-/g, "")));

      // Tallies source (built earlier for committed protein + windows)
      const srcTallies = Array.isArray(globalThis.__windowTalliesRows) ? globalThis.__windowTalliesRows : [];

      // Aggregate tallies by peptide across windows (sum frequencies; totals assumed constant)
      const talliesByPep = new Map();
      for (const r of srcTallies) {
        const p = String(r?.peptide || "").toUpperCase().replace(/-/g, "");
        if (!pepSet.has(p)) continue;
        const acc = talliesByPep.get(p) || { fa:0, fu:0, ta: null, tu: null };
        acc.fa += Number(r.frequency_all)    || 0;
        acc.fu += Number(r.frequency_unique) || 0;
        // Keep the last seen totals (these should be constant for the filter set)
        acc.ta = Number(r.total_all);
        acc.tu = Number(r.total_unique);
        talliesByPep.set(p, acc);
      }

      // Build window -> roots map from uploaded peptides (aligned table)
      const pid = committedProteinId;
      const winToRoots = new Map(); // key: "start|len" -> Set(rootPeptide)
      for (const r of (globalThis.__peptidesAligned || [])) {
        if ((r?.protein || "").toUpperCase() !== pid) continue;
        const st = Number(r?.start);
        const ln = Number(r?.aligned_length ?? r?.length);
        const pepOrig = String(r?.peptide || "").toUpperCase().replace(/-/g, "");
        if (!(st > 0 && ln > 0) || !pepOrig) continue;
        const k = `${st}|${ln}`;
        const set = winToRoots.get(k) || new Set();
        set.add(pepOrig);
        winToRoots.set(k, set);
      }

      // Map candidate peptide -> root(s) via topCandidatesByWindow
      const rootsByPep = new Map(); // key: ungapped peptide (UPPERCASE)
      const addRoots = (pep, roots) => {
        const k = String(pep || "").toUpperCase().replace(/-/g, "");
        if (!k || !roots?.size) return;
        const existing = rootsByPep.get(k) || new Set();
        for (const r of roots) existing.add(r);
        rootsByPep.set(k, existing);
      };
      for (const r of (Array.isArray(topCandidatesByWindow) ? topCandidatesByWindow : [])) {
        const pep = String(r?.peptide || "").toUpperCase();
        const k = `${Number(r?.start)}|${Number(r?.len)}`;
        const roots = winToRoots.get(k);
        addRoots(pep, roots);
      }

      // Also treat uploaded peptides themselves as their own root
      for (const r of (globalThis.__peptidesAligned || [])) {
        if ((r?.protein || "").toUpperCase() !== pid) continue;
        const pep = String(r?.peptide || "").toUpperCase().replace(/-/g, "");
        if (pep) addRoots(pep, new Set([pep]));
      }

      // Assemble final annotated rows in a stable column order
      const rows = base.map(r => {
        const allele = String(r.allele || "").toUpperCase();
        const peptide = String(r.peptide || "").toUpperCase().replace(/-/g, "");
        const elp = Number(r.netmhcpan_el_percentile);
        const bap = Number(r.netmhcpan_ba_percentile);
        const t = talliesByPep.get(peptide) || { fa:0, fu:0, ta:null, tu:null };
        const total_all   = Number.isFinite(t.ta) ? t.ta : 0;
        const total_unique= Number.isFinite(t.tu) ? t.tu : 0;
        const frequency_all   = t.fa;
        const frequency_unique= t.fu;
        const proportion_all     = total_all    ? (frequency_all/total_all)       : 0;
        const proportion_unique  = total_unique ? (frequency_unique/total_unique) : 0;
        const rootSet = rootsByPep.get(peptide) || new Set();
        const root = [...rootSet].sort().join(";");
        return {
          protein: proteinCommitted ?? "",
          allele,
          peptide,
          netmhcpan_el_percentile: elp,
          netmhcpan_ba_percentile: bap,
          frequency_all,
          total_all,
          proportion_all,
          frequency_unique,
          total_unique,
          proportion_unique,
          root
        };
      });

      // Keep only rows with at least some data (peptide present) ? already ensured
      return rows;
    } catch (e) {
      return [];
    }
  }
});
```

```js
/* uploaded peptides table + committed-protein slice (Class I) -- */
const uploadedPeptidesTable = await parsePeptideTable(peptideFile);

/* peptides for Class I, scoped to committed protein (reactive) */
const peptidesICommitted = (() => {
  const pid = committedProteinId;
  if (!pid) return [];
  return peptidesClean
    .filter(r => (r.protein || "").toUpperCase() === pid)
    .map(r => (r.peptide || "").toUpperCase())
    .filter(p => p.length >= 8 && p.length <= 14);
})();
```

```js
/* external radios */
const percentileModeInput = Inputs.radio(["EL","BA"], {
  label : "Percentile type:",
  value : "EL"
});
const mhcClassInput = Inputs.radio(["Class I","Class II"], {
  label : "MHC class:",
  value : "Class I"
});
const percMode = Generators.input(percentileModeInput);
const mhcClass = Generators.input(mhcClassInput);
try { globalThis.__percMode = percMode; } catch {}
// react to UI changes immediately
try { percentileModeInput?.addEventListener?.('input', () => { try { globalThis.__percMode = percentileModeInput.value; dispatchEvent(new Event('percMode-change')); } catch {} }); } catch {}
```

```js
/* allele plot reactive to allele picks and Apply (protein) */
selectedI;
committedProteinId;

const allelePlot = alleleChart({
  data      : chartRowsI,
  alleles   : Array.from(alleleCtrl1.value || []),
  mode      : percentileModeInput,
  classType : "I",
  baseCell  : 28,
  margin    : { top: 40, right: 20, bottom: 20, left: 140 },
  showNumbers: false
});
```

```js
/* HLA fetchers (on-demand from DuckDB) -------------------------- */
const PAGE_LIMIT_DEFAULT = 50;  // when searching 
const PAGE_LIMIT_INITIAL = 20;  // first display when q === ""

/* cls: "I" | "II"; q: string; offset/limit: paging */
async function fetchAlleles(cls, q = "", offset = 0, limit = PAGE_LIMIT_DEFAULT) {
  const clsNorm = (cls === "II" ? "II" : "I");

  if (!q || q.trim().length < 2) {
    // Initial list (no filter): fast DISTINCT over the pre-trimmed set
    const rows = await (globalThis.__perfUtils?.perfAsync?.(`sql: fetchAlleles initial ${clsNorm}`, async () => (await db.sql`
      WITH base AS (
        SELECT 'I'  AS class, TRIM("Class I")  AS allele FROM hla
        WHERE "Class I" IS NOT NULL AND LENGTH(TRIM("Class I")) > 0
        UNION ALL
        SELECT 'II' AS class, TRIM("Class II") AS allele FROM hla
        WHERE "Class II" IS NOT NULL AND LENGTH(TRIM("Class II")) > 0
      ),
      dedup AS (
        SELECT DISTINCT class, allele FROM base
      )
      SELECT allele
      FROM dedup
      WHERE class = ${clsNorm}
      ORDER BY allele
      LIMIT ${PAGE_LIMIT_INITIAL} OFFSET ${offset}
    `).toArray()))

    return rows.map(r => r.allele).filter(s => s && s.trim().length);
  }

  // Search path (q.length >= 2)
  const like = `%${q}%`;
  const rows = await (globalThis.__perfUtils?.perfAsync?.(`sql: fetchAlleles search ${clsNorm}`, async () => (await db.sql`
    WITH base AS (
      SELECT 'I'  AS class, TRIM("Class I")  AS allele FROM hla
      WHERE "Class I" IS NOT NULL AND LENGTH(TRIM("Class I")) > 0
      UNION ALL
      SELECT 'II' AS class, TRIM("Class II") AS allele FROM hla
      WHERE "Class II" IS NOT NULL AND LENGTH(TRIM("Class II")) > 0
    ),
    dedup AS (
      SELECT DISTINCT class, allele FROM base
    )
    SELECT allele
    FROM dedup
    WHERE class = ${clsNorm} AND allele ILIKE ${like}
    ORDER BY allele
    LIMIT ${limit} OFFSET ${offset}
  `).toArray()))

  return rows.map(r => r.allele).filter(s => s && s.trim().length);
}
```

```js
/* allele lists (lazy) ----------------------------------------- */
const alleleCtrl1 = comboSelectLazy({
  label: "Class I alleles (MHCI)",
  placeholder: "Type class-I allele",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,
  pageLimit: 50,
  fetch: ({ q, offset, limit }) => fetchAlleles("I", q, offset, limit)
});
const selectedI = Generators.input(alleleCtrl1);
try { globalThis.__selectedI = Array.from(selectedI || []); } catch {}

const alleleCtrl2 = comboSelectLazy({
  label: "Class II alleles (MHCII)",
  placeholder: "Type class-II allele",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,
  pageLimit: 50,
  fetch: ({ q, offset, limit }) => fetchAlleles("II", q, offset, limit)
});
const selectedII = Generators.input(alleleCtrl2);
```

```js
/* snapshots captured only when the Run buttons fire */
const committedI        = snapshotOn(runBtnI,  () => Array.from(alleleCtrl1.value || []));
const committedWorksetI = snapshotOn(runBtnI,  () => Array.from(peptidesIWorkset || []));
const committedProteinI = snapshotOn(runBtnI,  () => committedProteinId);
const committedII       = snapshotOn(runBtnII, () => Array.from(alleleCtrl2.value || []));
```








