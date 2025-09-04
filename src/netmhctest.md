---
theme: [air]
title: Peptide Binding Prediction
slug: netmhc
toc: false
---

<!-- Global styles & fonts -->
<style>
@import url("https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap");

:root {
  --brand: #006DAE;
  --ink: #1f2937;
  --muted: #6b7280;
  --card: #ffffff;
  --border: #e5e7eb;
}

* { box-sizing: border-box; }
html, body { font-family: "Roboto", system-ui, -apple-system, Segoe UI, Arial, sans-serif; color: var(--ink); }

.page-title {
  text-align: center;
  font-weight: 600;
  letter-spacing: .2px;
  margin: .5rem 0 1rem 0;
}

.section {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin: 16px 0;
  box-shadow: 0 2px 4px rgba(0,0,0,.04);
}

.section h2 {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
}

.inputs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 12px;
}
@media (max-width: 900px) {
  .param-grid { grid-template-columns: repeat(2, minmax(220px, 1fr)); }
}
@media (max-width: 640px) {
  .param-grid { grid-template-columns: 1fr; }
}

.chart-card {
  width: 100%;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,.04);
  margin: 16px 0 24px 0;
}

.chart-row { width: 100%; }

.scan-hint {
  font-size: 13px;
  color: var(--muted);
  margin: 6px 2px 10px 2px;
}
</style>

<h1 class="page-title">Peptide Binding Prediction</h1>

<!-- ───────────────────────────── Input Data (for future wiring) ───────────────────────────── -->
<div class="section">
  <h2>Input Data</h2>
  <div class="inputs-row">
    ${uploadSeqBtn}
    ${uploadPepBtn}
  </div>
</div>

<!-- ───────────────────────────────────────── Parameters ───────────────────────────────────── -->
<div class="section">
  <h2>Parameters</h2>
  <div class="param-grid">
    ${seqSelectEl}
    ${lenSelectEl}
    ${alleleSelectEl}
  </div>
</div>

<!-- ────────────────────────────────────────── Charts ──────────────────────────────────────── -->
<div class="chart-card" id="scan-card">
  <div id="heat-wrap" class="chart-row"></div>
  <div id="scan-hint" class="scan-hint">Click a heatmap row to view all peptides for that allele.</div>
  <div id="pep-wrap" class="chart-row"></div>
</div>

```js
// Imports
import * as d3 from "npm:d3";
import * as Inputs from "@observablehq/inputs";
import {sql} from "./components/extenddb.js";
import {initDB, disposeDB} from "./components/db.js";
import {heatmapChart} from "./components/heatmapChart.js";
import {peptideScanChart} from "./components/peptideScanChart.js";
import {uploadButton} from "./components/uploadButton.js";

```

```js
/* Database (singleton across routes) */
const db = await initDB({
  peptidescan: FileAttachment("data/peptide_table_slim.parquet").parquet(),
}, "netmhc");

invalidation.then(() => { disposeDB(); });

```

```js
/* Expand windows → min percentile table (heatmap base) */
const heatmapRaw = (await db.sql`
  WITH exploded AS (
    SELECT
      "seq #"                AS seq_id,
      "peptide length"       AS pep_len,
      allele,
      peptide,
      start,
      UNNEST(GENERATE_SERIES(start, "end")) AS pos,
      "netmhcpan_el percentile"             AS pct,
      SUBSTR(peptide, 1 + pos - start, 1)   AS aa
    FROM peptidescan
  )
  SELECT
    seq_id, pep_len, allele, pos,
    arg_min(pct    , pct)      AS pct,
    arg_min(peptide, pct)      AS peptide,
    arg_min(aa     , pct)      AS aa
  FROM exploded
  GROUP BY 1,2,3,4
  ORDER BY seq_id, pep_len, allele, pos;
`).toArray();

```

```js
/* Selections (UI elements + reactive values) */
const allAlleles = [...new Set(heatmapRaw.map(d => d.allele))].sort(d3.ascending);
const allSeqIDs  = [...new Set(heatmapRaw.map(d => d.seq_id))].sort(d3.ascending);
const allLens    = [...new Set(heatmapRaw.map(d => d.pep_len))].sort(d3.ascending);

/* friendly names */
const seqNames = new Map([
  [ 1, "HA" ],[ 2, "M1" ],[ 3, "M2" ],[ 4, "NA" ],[ 5, "NP" ],
  [ 6, "NS1"],[ 7, "NS2"],[ 8, "PA" ],[ 9, "PAX"],[10, "PB1"],
  [11,"PB1-F2"],[12,"PB2"]
]);

/* build controls */
const seqSelectEl = Inputs.select(allSeqIDs, {
  label : "Sequence",
  value : allSeqIDs[0],
  format: id => seqNames.get(id) ?? String(id)
});
const chosenSeq = Generators.input(seqSelectEl);

const lenSelectEl = Inputs.select(allLens, {
  label: "Peptide length",
  value: allLens[1]
});
const chosenLen = Generators.input(lenSelectEl);

const alleleSelectEl = Inputs.select(allAlleles, {
  label: "Alleles (multi-select)",
  multiple: true,
  value: allAlleles
});
const chosenAlleles = Generators.input(alleleSelectEl);

/* Upload buttons (for show; wiring later) */
const uploadSeqBtn = uploadButton({
  label: "Upload Sequence (.fasta)",
  accept: ".fasta"
});
const uploadPepBtn = uploadButton({
  label: "Upload Peptides (.csv)",
  accept: ".csv"
});

```

```js
/* Heatmap input rows per current parameters */
const heatmapData = heatmapRaw
  .filter(d =>
       d.seq_id  === chosenSeq
    && d.pep_len === chosenLen
    && chosenAlleles.includes(d.allele)
  )
  .map(({allele, pos, pct, peptide, aa}) =>
       ({allele, pos, pct, peptide, aa}));

```

```js
/* True sequence lengths per seq_id (for axis extent) */
const seqLengths = Object.fromEntries(
  (await db.sql`
    SELECT "seq #", MAX("end") AS len
    FROM   peptidescan
    GROUP  BY "seq #"
  `).toArray().map(d => [+d["seq #"], +d.len])
);

```

```js
/* Mount charts inside the HTML card; keep nodes stable & in sync */
{
  // reactive dependencies
  heatmapData; chosenSeq; chosenLen;

  const heatWrap = document.getElementById("heat-wrap");
  const pepWrap  = document.getElementById("pep-wrap");
  const hintEl   = document.getElementById("scan-hint");

  // clear containers on each recompute
  heatWrap.replaceChildren();
  pepWrap.replaceChildren();
  hintEl.style.display = ""; // show hint initially

  // shared zoom state
  let currentScale = null;
  let currentTransform = null;
  let syncing = false;
  let pepAPI = { update: ()=>{}, setZoom: ()=>{} };

  // build heatmap
  const seqLen = seqLengths[chosenSeq] ?? d3.max(heatmapData, d => d.pos) ?? 1;
  const heatEl = heatmapChart({
    data     : heatmapData,
    posExtent: [1, seqLen],
    margin   : { top:16, right:20, bottom:60, left:90 },

    onReady: (x) => { currentScale = x; },
    onZoom : (x, t) => {
      if (syncing) return;
      syncing = true;
      currentScale = x; currentTransform = t;
      pepAPI.update?.(x);
      pepAPI.setZoom?.(t);
      syncing = false;
    },

    onRowToggle: (allele) => showPeptidesFor(allele)
  });

  heatWrap.appendChild(heatEl);

  // helper to toggle hint visibility
  const showHint = (show) => { hintEl.style.display = show ? "" : "none"; };

  // build peptide chart for the clicked allele (or clear)
  async function showPeptidesFor(allele) {
    pepWrap.replaceChildren();
    pepAPI = { update: ()=>{}, setZoom: ()=>{} };

    if (!allele) { showHint(true); return; }
    showHint(false);

    const rows = (await db.sql`
      SELECT peptide, start,
             "peptide length" AS pep_len,
             allele,
             "netmhcpan_el percentile" AS el,
             "netmhcpan_ba percentile" AS ba
      FROM peptidescan
      WHERE "seq #" = ${chosenSeq}
        AND allele   = ${allele}
        AND "peptide length" = ${chosenLen}
      ORDER BY start, peptide
    `).toArray();

    const pepRows = rows.map(r => ({
      start   : +r.start,
      length  : +r.pep_len,
      peptide : r.peptide,
      peptide_aligned: r.peptide
    }));

    const alleleRows = rows.map(r => ({
      allele: r.allele,
      peptide: r.peptide,
      netmhcpan_el_percentile: +r.el,
      netmhcpan_ba_percentile: +r.ba
    }));

    const svg = d3.create("svg").style("width","100%");
    const g   = svg.append("g");
    pepWrap.appendChild(svg.node());

    const chart = peptideScanChart(g, {
      data       : pepRows,
      alleleData : alleleRows,
      xScale     : currentScale,
      sizeFactor : 1.2,
      rowHeight  : 18,
      gap        : 2,
      margin     : { top:20, right:20, bottom:30, left:40 },

      onZoom     : (x, t) => {
        if (syncing) return;
        syncing = true;
        currentScale = x; currentTransform = t;
        heatEl.__setZoom?.(t);   // drive the heatmap back
        syncing = false;
      }
    });

    const [r0, r1] = currentScale.range();
    const w = (r1 - r0) + 90 + 20;   // heatmap’s left+right margins
    svg.attr("height", chart.height)
       .attr("viewBox", `0 0 ${w} ${chart.height}`);

    pepAPI = chart;
    if (currentTransform) pepAPI.setZoom(currentTransform);
    pepAPI.update(currentScale);
  }
}

```
