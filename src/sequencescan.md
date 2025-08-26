---
theme: [air]
title: Peptide Binding Prediction V2
slug: netmhc
toc: false
---

```js
// Imports
import * as d3 from "npm:d3";
import * as Inputs from "@observablehq/inputs";
import {DuckDBClient} from "npm:@observablehq/duckdb";
import {extendDB, sql} from "./components/extenddb.js";
import {heatmapChart} from "./components/heatmapChart.js";
import {peptideScanChart} from "./components/peptideScanChart.js";
import {uploadButton} from "./components/uploadButton.js";

// Tiny DB for HLA lists
const db = extendDB(
  await DuckDBClient.of({
    hla: FileAttachment("data/HLAlistClassI.parquet").parquet()
  })
);

```

```js

/* Mutable stores (place ABOVE any cells that reference them) */
const predRowsMut      = Mutable([]);   // normalized rows across all seqs
const seqListMut       = Mutable([]);   // [{id, sequence}]
const uploadedPepsMut  = Mutable([]);   // [peptide]
const chosenSeqIdMut   = Mutable(null); // which sequence to view

```

```js
/* Predictor selector (single option) */
const predictorOptions = [
  { label: "Class I — netMHCpan 4.1 EL", value: { cls:"I", method:"netmhcpan_el" } },
  { label: "Class I — netMHCpan 4.1 BA", value: { cls:"I", method:"netmhcpan_ba" } },
  { label: "Class II — netMHCIIpan 4.3 EL", value: { cls:"II", method:"netmhciipan_el" } },
  { label: "Class II — netMHCIIpan 4.3 BA", value: { cls:"II", method:"netmhciipan_ba" } }
];

const predictorSelectEl = Inputs.select(predictorOptions, {
  label: "Predictor",
  format: o => o.label,
  value: predictorOptions[0]  // default
});
const predictor = Generators.input(predictorSelectEl);

/* Lengths input: “9” or “8-11” or “8,9,10” */
const lengthTextEl = Inputs.text({
  label: "Peptide lengths (single or range)",
  placeholder: "e.g. 9  or  8-11  or  8,9,10"
});
const lengthText = Generators.input(lengthTextEl);

/* Parse length text to array of ints with class-aware defaults */
function parseLengths(text, cls) {
  const norm = String(text||"").trim();
  if (!norm) return cls==="II" ? [15] : [9]; // defaults: I→9, II→15
  // "8-11" → [8,9,10,11], "8,10,11" → [8,10,11]
  const parts = norm.split(",").map(s=>s.trim()).filter(Boolean);
  let out = [];
  for (const p of parts.length ? parts : [norm]) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(p);
    if (m) {
      const a = +m[1], b = +m[2];
      const lo = Math.min(a,b), hi = Math.max(a,b);
      for (let v=lo; v<=hi; v++) out.push(v);
    } else if (/^\d+$/.test(p)) {
      out.push(+p);
    }
  }
  out = [...new Set(out)].sort((a,b)=>a-b);
  if (!out.length) return cls==="II" ? [15] : [9];
  return out;
}

```

```js
/* Lazy allele fetchers from Parquet (two columns: "Class I", "Class II") */
const PAGE_LIMIT_DEFAULT = 50;
const PAGE_LIMIT_INITIAL = 20;

async function fetchAlleles(cls, q = "", offset = 0, limit = PAGE_LIMIT_DEFAULT) {
  const clsNorm = (cls === "II" ? "II" : "I");
  if (!q || q.trim().length < 2) {
    const rows = (await db.sql`
      WITH base AS (
        SELECT 'I'  AS class, TRIM("Class I")  AS allele FROM hla
        WHERE "Class I" IS NOT NULL AND LENGTH(TRIM("Class I")) > 0
        UNION ALL
        SELECT 'II' AS class, TRIM("Class II") AS allele FROM hla
        WHERE "Class II" IS NOT NULL AND LENGTH(TRIM("Class II")) > 0
      ),
      dedup AS ( SELECT DISTINCT class, allele FROM base )
      SELECT allele FROM dedup
      WHERE class = ${clsNorm}
      ORDER BY allele
      LIMIT ${PAGE_LIMIT_INITIAL} OFFSET ${offset}
    `).toArray();
    return rows.map(r=>r.allele);
  }
  const like = `%${q}%`;
  const rows = (await db.sql`
    WITH base AS (
      SELECT 'I'  AS class, TRIM("Class I")  AS allele FROM hla
      WHERE "Class I" IS NOT NULL AND LENGTH(TRIM("Class I")) > 0
      UNION ALL
      SELECT 'II' AS class, TRIM("Class II") AS allele FROM hla
      WHERE "Class II" IS NOT NULL AND LENGTH(TRIM("Class II")) > 0
    ),
    dedup AS ( SELECT DISTINCT class, allele FROM base )
    SELECT allele FROM dedup
    WHERE class = ${clsNorm} AND allele ILIKE ${like}
    ORDER BY allele
    LIMIT ${limit} OFFSET ${offset}
  `).toArray();
  return rows.map(r=>r.allele);
}

/* Minimal async multi-select using Inputs + fetch */
function lazyAlleleSelect({label, cls}) {
  const root = html`<div style="display:flex; gap:8px; align-items:center;"></div>`;
  const input = Inputs.text({placeholder: `Type ${cls} allele…`});
  const list  = html`<select multiple size="6" style="min-width:260px;"></select>`;
  const load  = async (q="") => {
    list.replaceChildren();
    const items = await fetchAlleles(cls, q);
    for (const a of items) list.appendChild(Object.assign(document.createElement("option"), {textContent:a, value:a}));
  };
  input.addEventListener("input", () => load(input.value));
  load("");

  root.value = [];
  list.addEventListener("change", () => {
    root.value = Array.from(list.selectedOptions).map(o=>o.value);
    root.dispatchEvent(new CustomEvent("input"));
  });
  root.append(input, list);
  return root;
}

const alleleSelectEl = lazyAlleleSelect({label:"Alleles", cls: predictor.cls});
const chosenAlleles = Generators.input(alleleSelectEl);

```

```js
/* Keep allele list in sync when predictor class changes (guarded) */
{
  predictor;  // reactive

  (async () => {
    if (!alleleSelectEl) return;
    const input = alleleSelectEl.querySelector("input");
    const list  = alleleSelectEl.querySelector("select");
    if (!list) return;

    if (input) input.value = "";
    list.replaceChildren();

    const items = await fetchAlleles(predictor.cls, "");
    for (const a of items) {
      const opt = document.createElement("option");
      opt.textContent = opt.value = a;
      list.appendChild(opt);
    }

    if ("value" in alleleSelectEl) {
      alleleSelectEl.value = [];
      alleleSelectEl.dispatchEvent(new CustomEvent("input"));
    }
  })();
}

```

```js
/* Upload controls */
const uploadSeqBtn = uploadButton({ label:"Upload Sequence (.fasta)", accept: ".fasta" });
const uploadPepBtn = uploadButton({ label:"Upload Peptides (.csv)",   accept: ".csv" });

/* Sequence textbox (multi-FASTA or raw AA) */
const seqTextarea = Inputs.textarea({label:"Sequence(s)", rows: 7, placeholder: ">seq1\nMKTIIAL...\n>seq2\nMNPQRST..."});
const seqText = Generators.input(seqTextarea);

/* Helpers: parse FASTA (robust for mixed raw/FASTA input) */
function parseFastaOrRaw(text) {
  const s = String(text||"").trim();
  if (!s) return [];
  if (s.startsWith(">")) {
    const out = [];
    let id = "seq", buf = [];
    for (const line of s.split(/\r?\n/)) {
      if (line.startsWith(">")) {
        if (buf.length) out.push({id, sequence: buf.join("").replace(/\s+/g,"").toUpperCase()});
        id = line.replace(/^>\s*/,"").trim() || `seq${out.length+1}`;
        buf = [];
      } else {
        buf.push(line.trim());
      }
    }
    if (buf.length) out.push({id, sequence: buf.join("").replace(/\s+/g,"").toUpperCase()});
    return out;
  }
  // raw single sequence (no header)
  return [{id:"seq1", sequence: s.replace(/\s+/g,"").toUpperCase()}];
}

// Hardened file→text helper (accepts File, uploadButton root, or [File])
async function readFileText(file) {
  if (!file) return "";
  const isFileLike = (f) => f && typeof f.text === "function";

  if (isFileLike(file)) {
    return await file.text();
  }
  if (file && file.value && isFileLike(file.value)) {
    return await file.value.text();
  }
  if (Array.isArray(file) && file.length && isFileLike(file[0])) {
    return await file[0].text();
  }
  return "";
}


/* Peptides CSV with column “peptide” (case-insensitive) — robust input */
async function parsePeptidesCSV(input) {
  if (!input) return [];

  const isFileLike = (f) => f && typeof f.text === "function";

  // Normalize to CSV text
  let csv = "";
  if (typeof input === "string") {
    csv = input;
  } else if (isFileLike(input)) {
    csv = await input.text();
  } else if (input && input.value && isFileLike(input.value)) {
    csv = await input.value.text();
  } else if (Array.isArray(input) && input.length && isFileLike(input[0])) {
    csv = await input[0].text();
  } else if (uploadPepBtn && isFileLike(uploadPepBtn.value)) {
    // last-resort: read directly from the upload control's current value
    csv = await uploadPepBtn.value.text();
  } else {
    return [];
  }

  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const headers = lines[0].split(",").map((s) => s.trim().toLowerCase());
  const iPep = headers.indexOf("peptide");
  if (iPep < 0) return [];

  const peps = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const p = (cols[iPep] || "").trim().toUpperCase();
    if (p) peps.push(p);
  }
  return [...new Set(peps)];
}


```

```js
/* Build body for a single predictor, multiple alleles, lengths, all sequences */
function buildBody({cls, method, alleles, lengths, fastaText}) {
  return {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : cls === "II" ? "mhcii" : "mhci",
      input_sequence_text: fastaText,                       // multi-FASTA
      input_parameters: {
        alleles: alleles.join(","),
        peptide_length_range: lengths,                      // array of ints
        predictors: [{type:"binding", method}]              // single predictor
      }
    }]
  };
}

async function submit(body) {
  const r = await fetch("/api/iedb-pipeline", {
    method:"POST",
    headers:{"content-type":"application/json"},
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  const j   = (()=>{try{return JSON.parse(txt);}catch{return txt;}})();
  if (!r.ok) throw new Error(j.errors?.join("; ") || r.statusText);
  return j.results_uri.split("/").pop(); // result_id
}

async function poll(resultId, interval=1500, timeout=120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await fetch(`/api/iedb-result?id=${resultId}`);
    const txt = await r.text();
    const j   = (()=>{try{return JSON.parse(txt);}catch{return txt;}})();
    if (j.status === "done") {
      const tbl = j.data?.results?.find(t => t.type === "peptide_table");
      if (tbl) return rowsFromTable(tbl);
      throw new Error("No peptide_table in result");
    }
    await new Promise(res => setTimeout(res, interval));
  }
  throw new Error("Timed out polling IEDB");
}

/* Poll with status updates (doesn't replace your poll(); this is an additive helper) */
async function pollWithStatus(resultId, { interval = 1000, timeout = 120_000, onTick } = {}) {
  const t0 = Date.now();
  let iter = 0;
  while (Date.now() - t0 < timeout) {
    iter++;
    onTick?.({ iter, elapsed: Date.now() - t0 });
    const r = await fetch(`/api/iedb-result?id=${resultId}`);
    const txt = await r.text();
    const j = (()=>{ try { return JSON.parse(txt); } catch { return txt; } })();
    if (j.status === "done") {
      const tbl = j.data?.results?.find(t => t.type === "peptide_table");
      if (tbl) return tbl;
      throw new Error("No peptide_table in result");
    }
    await new Promise(res => setTimeout(res, interval));
  }
  throw new Error("Timed out polling IEDB");
}

function rowsFromTable(tbl) {
  const keys = tbl.table_columns.map(c => c.display_name || c.name);
  return tbl.table_data.map(r => Object.fromEntries(r.map((v,i)=>[keys[i],v])));
}

/* Normalize result rows to a common shape */
function normalizeRows(rows, {cls, method}) {
  // Try to locate columns with flexible headers
  const findCol = (obj, names) => {
    const keys = Object.keys(obj);
    for (const n of names) {
      const k = keys.find(k => k.toLowerCase() === n.toLowerCase());
      if (k) return k;
    }
    // fallback: regex contains
    for (const k of keys) {
      if (names.some(n => k.toLowerCase().includes(n.toLowerCase()))) return k;
    }
    return null;
  };

  const out = [];
  for (const r of rows) {
    const pepK   = findCol(r, ["peptide"]);
    const alK    = findCol(r, ["allele"]);
    const startK = findCol(r, ["start","start position","start_position"]);
    const lenK   = findCol(r, ["length","peptide length","peptide_length"]);
    // predictor percentile column
    const pctK = findCol(r, [
      method==="netmhcpan_el"    ? "netmhcpan_el percentile"
    : method==="netmhcpan_ba"    ? "netmhcpan_ba percentile"
    : method==="netmhciipan_el"  ? "netmhciipan_el percentile"
    :                               "netmhciipan_ba percentile"
    ]);

    if (!pepK || !alK) continue;

    out.push({
      allele : String(r[alK]).toUpperCase(),
      peptide: String(r[pepK]).toUpperCase(),
      start  : startK ? +r[startK] : null,
      length : lenK   ? +r[lenK]   : (r[pepK] ? String(r[pepK]).length : null),
      pct    : pctK ? +r[pctK] : null,
      method, cls
    });
  }
  return out;
}


```

```js
/* Status banner + single Run button */
const statusBanner = html`<div style="margin:.5rem 0; font-style:italic;"></div>`;
function setBanner(msg) { statusBanner.textContent = msg; }

const runBtn = Inputs.button("Run prediction");
const triggerRun = Generators.input(runBtn);



/* Download CSV (normalized rows) */
function downloadCSVButton() {
  const btn = Inputs.button("Download predictions (CSV)");
  btn.onclick = () => {
    const rows = predRowsMut.value || [];
    if (!rows.length) return alert("No predictions yet.");
    const cols = Object.keys(rows[0]);
    const csv  = [cols.join(","), ...rows.map(r => cols.map(c => r[c]??"").join(","))].join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {href:url, download:"predictions.csv"}).click();
    URL.revokeObjectURL(url);
  };
  return btn;
}
const downloadPredsBtn = downloadCSVButton();

```

```js
/* ▶ Run pipeline for the current predictor selection (submits + polls + fills predRowsMut) */
{
  // Re-run this block when the Run button is clicked or inputs change,
  // but do the network only on clicks.
  triggerRun; predictor; lengthText; chosenAlleles; seqText;

  (async () => {
    try {
      console.groupCollapsed("▶️ Run prediction");
      setBanner("Preparing input…");

      // Collect sequences from textarea + optional upload
      const seqFile =
        (uploadSeqBtn && uploadSeqBtn.value && typeof uploadSeqBtn.value.text === "function")
          ? uploadSeqBtn.value
          : null;

      const seqs = await collectSequences(seqFile);
      if (!seqs.length) { setBanner("Please enter or upload at least one sequence."); console.warn("No sequences"); console.groupEnd(); return; }
      // expose to rest of the app
      if (seqListMut && "value" in seqListMut) seqListMut.value = seqs;
      if (chosenSeqIdMut && "value" in chosenSeqIdMut && !chosenSeqIdMut.value) chosenSeqIdMut.value = seqs[0].id;

      // Alleles
      const alleles = Array.isArray(chosenAlleles) ? chosenAlleles : Array.from(chosenAlleles || []);
      if (!alleles.length) { setBanner("Please select at least one allele."); console.warn("No alleles"); console.groupEnd(); return; }

      // Lengths (class-aware default)
      const lens = parseLengths(lengthText, predictor.cls);
      if (!lens.length) { setBanner("Please enter a valid length or range."); console.warn("No lengths"); console.groupEnd(); return; }

      // FASTA (multi)
      const fastaText = seqs.map(s => `>${s.id}\n${s.sequence}`).join("\n");

      // Build + submit
      const body = buildBody({
        cls     : predictor.cls,
        method  : predictor.method,
        alleles : alleles,
        lengths : lens,
        fastaText
      });

      console.log("Submitting /api/iedb-pipeline", {
        cls: predictor.cls, method: predictor.method,
        nSequences: seqs.length, nAlleles: alleles.length, lengths: lens
      });
      setBanner(`Submitting ${seqs.length} seq(s), ${alleles.length} allele(s), lengths ${lens.join(", ")}…`);

      console.time("submit+poll");
      const resultId = await submit(body);
      console.log("→ resultId:", resultId);

      // Poll with visible ticks
      let lastSec = -1;
      const tbl = await pollWithStatus(resultId, {
        interval: 1500,
        timeout : 120_000,
        onTick  : ({ iter, elapsed }) => {
          const sec = Math.floor(elapsed / 1000);
          if (sec !== lastSec) {
            lastSec = sec;
            setBanner(`Polling IEDB… ${sec}s (try ${iter})`);
          }
        }
      });

      // Normalize
      const rawRows  = rowsFromTable(tbl);
      const normRows = normalizeRows(rawRows, predictor);

      if (predRowsMut && "value" in predRowsMut) predRowsMut.value = normRows;

      console.timeEnd("submit+poll");
      console.log("Received rows:", normRows.length);
      setBanner(`Done — ${normRows.length} rows.`);
      console.groupEnd();
    } catch (err) {
      console.error("Run error:", err);
      setBanner(`Error: ${err.message}`);
      console.groupEnd();
    }
  })();
}

```


```js
triggerRun; predictor; lengthText
```

```js
/* Sequence picker (single, hardened) */
const currentSeqList = (seqListMut && typeof seqListMut === "object" && "value" in seqListMut)
  ? (seqListMut.value || [])
  : [];

const seqIds = currentSeqList.map(s => s.id);

const safeChosenId =
  (chosenSeqIdMut && typeof chosenSeqIdMut === "object" && "value" in chosenSeqIdMut)
    ? chosenSeqIdMut.value
    : null;

const seqPickerEl = Inputs.select(seqIds, {
  label: "Sequence to view",
  value: seqIds.length
    ? (seqIds.includes(safeChosenId) ? safeChosenId : seqIds[0])
    : undefined
});

const chosenSeqId = Generators.input(seqPickerEl);
{
  chosenSeqId; // reactive
  if (
    chosenSeqId !== undefined &&
    chosenSeqId !== null &&
    chosenSeqIdMut &&
    typeof chosenSeqIdMut === "object" &&
    "value" in chosenSeqIdMut
  ) {
    chosenSeqIdMut.value = chosenSeqId;
  }
}


```

```js
// Subscribe to the upload control (fires when the user chooses/clears a file)
const pepUploadChange = Generators.input(uploadPepBtn);

/* Parse the chosen peptide CSV into uploadedPepsMut (hardened) */
{
  pepUploadChange; // re-run on every change

  const isFileLike = (f) => f && typeof f.text === "function";
  const file = (uploadPepBtn && isFileLike(uploadPepBtn.value))
    ? uploadPepBtn.value
    : null;

  const parsed = file ? await parsePeptidesCSV(file) : [];

  if (uploadedPepsMut && typeof uploadedPepsMut === "object" && "value" in uploadedPepsMut) {
    uploadedPepsMut.value = parsed;
  }
}


```

```js
/* Derive: sequence length for the chosen sequence */
function getSeqRecord(id) {
  const arr = seqListMut.value || [];
  return arr.find(s => s.id === id) || null;
}

/* Build heatmap cells (min-pct per position, per allele) from normalized rows */
function buildHeatmapData({rows, seqId, sequence, method}) {
  if (!rows?.length || !sequence) return [];
  // Accumulate best (min) percentile per allele/pos
  const AA = sequence.toUpperCase();
  const best = new Map(); // key: allele|pos → {pct, peptide, aa}
  for (const r of rows.filter(x => x.start != null && x.length != null)) {
    if (r.cls && predictor.cls && r.cls !== predictor.cls) continue;
    const kAllele = r.allele;
    const start = +r.start;
    const len   = +r.length;
    if (!start || !len) continue;
    for (let i=0;i<len;i++) {
      const pos = start + i;                         // 1-based pos
      const aa  = AA[pos-1] || "-";
      const key = `${kAllele}|${pos}`;
      const prev = best.get(key);
      if (!prev || (isFinite(r.pct) && r.pct < prev.pct)) {
        best.set(key, {allele:kAllele, pos, pct:r.pct, peptide:r.peptide, aa});
      }
    }
  }
  return [...best.values()];
}

/* Build peptide rows for the peptideScanChart from predictions (for a selected allele) */
function buildPeptideRows({rows, seqId, allele}) {
  const subset = rows.filter(r => r.allele === allele && r.start != null && r.length != null);
  return subset.map(r => ({
    start: +r.start,
    length: +r.length,
    peptide: r.peptide,
    peptide_aligned: r.peptide,   // no gapped alignment here
    protein: seqId
  }));
}

/* Simple overlay rows from uploaded peptides (first occurrence in sequence) */
function buildOverlayRows({peptides, sequence}) {
  if (!peptides?.length || !sequence) return [];
  const AA = sequence.toUpperCase();
  const rows = [];
  for (const p of peptides) {
    const idx = AA.indexOf(p.toUpperCase());
    if (idx >= 0) {
      rows.push({ start: idx+1, length: p.length, peptide: p, peptide_aligned: p });
    }
  }
  return rows;
}

```


```js
/* Chart mounting (inside your HTML container) */
{
  predRowsMut; chosenSeqIdMut; predictor; uploadedPepsMut; // reactive

  const heatWrap = document.getElementById("heat-wrap");
  const pepWrap  = document.getElementById("pep-wrap");
  const hintEl   = document.getElementById("scan-hint");

  heatWrap.replaceChildren();
  pepWrap.replaceChildren();
  hintEl.style.display = ""; // shown until a row/allele is clicked

  const currChosenId =
    (chosenSeqIdMut && typeof chosenSeqIdMut === "object" && "value" in chosenSeqIdMut)
      ? chosenSeqIdMut.value
      : null;

  const seqRec = getSeqRecord(currChosenId);

  if (seqRec) {
    const seqId  = seqRec.id;
    const seqAA  = seqRec.sequence;
    const rows   = predRowsMut.value || [];

    // Heatmap data across *all alleles selected in predictor run*
    const heatData = buildHeatmapData({
      rows, seqId, sequence: seqAA, method: predictor.method
    });

    // Shared zoom state
    let currentScale = null, currentTransform = null, syncing = false;
    let pepAPI = { update:()=>{}, setZoom:()=>{} };

    const seqLen = seqAA.length || d3.max(heatData, d => d.pos) || 1;
    const heatEl = heatmapChart({
      data: heatData,
      posExtent: [1, seqLen],
      margin: { top:16, right:20, bottom:60, left:90 },

      onReady: (x) => { currentScale = x; },
      onZoom : (x, t) => {
        if (syncing) return;
        syncing = true;
        currentScale = x; currentTransform = t;
        pepAPI.update?.(x);
        pepAPI.setZoom?.(t);
        syncing = false;
      },

      // Click a row (allele) to show all peptides for that allele
      onRowToggle: (allele) => showPeptidesFor(allele)
    });
    heatWrap.appendChild(heatEl);

    function showHint(show) { hintEl.style.display = show ? "" : "none"; }

    async function showPeptidesFor(allele) {
      pepWrap.replaceChildren();
      pepAPI = { update:()=>{}, setZoom:()=>{} };

      if (!allele) { showHint(true); return; }
      showHint(false);

      // Main peptide tracks from predictions (selected allele)
      const pepRows = buildPeptideRows({rows, seqId, allele});

      // Overlay uploaded peptides (neutral color)
      const overlayRows = buildOverlayRows({ peptides: uploadedPepsMut.value, sequence: seqAA });

      const svg = d3.create("svg").style("width","100%");
      const g   = svg.append("g");
      pepWrap.appendChild(svg.node());

      const chart = peptideScanChart(g, {
        data       : pepRows,
        alleleData : rows.filter(r => r.allele === allele).map(r => ({
          allele: r.allele,
          peptide: r.peptide,
          netmhcpan_el_percentile: predictor.method.includes("el") ? r.pct : undefined,
          netmhcpan_ba_percentile: predictor.method.includes("ba") ? r.pct : undefined
        })),
        xScale     : currentScale,
        sizeFactor : 1.2,
        rowHeight  : 18,
        gap        : 2,
        margin     : { top:20, right:20, bottom:30, left:40 },
        colourBy   : allele,            // color by this allele (matches heatmap mapping)
        onZoom     : (x, t) => {
          if (syncing) return;
          syncing = true;
          currentScale = x; currentTransform = t;
          heatEl.__setZoom?.(t);        // drive heatmap back
          syncing = false;
        }
      });

      // Optional: add a very light, separate overlay row for uploaded peptides
      if (overlayRows.length) {
        const g2 = g.append("g").attr("transform", `translate(0, ${chart.height})`);
        const overlay = peptideScanChart(g2, {
          data       : overlayRows,
          alleleData : [],               // no scoring; neutral fill inside component when not allele mode
          xScale     : currentScale,
          sizeFactor : 1.0,
          rowHeight  : 14,
          gap        : 2,
          margin     : { top:12, right:20, bottom:24, left:40 },
          colourBy   : "attribute_1"     // forces neutral color in component
        });
        // grow svg to fit overlay
        svg.attr("height", chart.height + overlay.height);
      } else {
        svg.attr("height", chart.height);
      }

      const [r0, r1] = currentScale.range();
      const w = (r1 - r0) + 90 + 20;
      svg.attr("viewBox", `0 0 ${w} ${svg.attr("height")}`);

      pepAPI = chart;
      if (currentTransform) pepAPI.setZoom(currentTransform);
      pepAPI.update(currentScale);
    }
  } // if (seqRec)
}


```

```js
// Input Data section
const inputDataControls = html`<div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;"></div>`;
inputDataControls.append(uploadSeqBtn, seqTextarea, uploadPepBtn);

// Parameters section
const paramsControls = html`<div style="display:grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap:12px;"></div>`;
paramsControls.append(predictorSelectEl, lengthTextEl, alleleSelectEl);

// Run + status + downloads
const runRow = html`<div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-top:8px;"></div>`;
runRow.append(runBtn, statusBanner, downloadPredsBtn);

// Sequence picker (appears after first run)
const seqPickerRow = html`<div style="margin-top:6px;"></div>`;
seqPickerRow.append(seqPickerEl);

// Expose for HTML slots
({inputDataControls, paramsControls, runRow, seqPickerRow});

```




```js
async function collectSequences(uploadFile) {
  const fromText = parseFastaOrRaw(seqText);
  const fromFile = uploadFile ? parseFastaOrRaw(await readFileText(uploadFile)) : [];

  const all = [...fromText, ...fromFile]
    .filter(s => s.sequence && /^[ACDEFGHIKLMNPQRSTVWY-]+$/i.test(s.sequence));

  const seen = new Set(), out = [];
  for (const r of all) {
    let id = r.id || `seq${out.length+1}`;
    while (seen.has(id)) id = id + "_x";
    seen.add(id);
    out.push({ id, sequence: r.sequence });
  }
  return out;
}

```


<!-- Input Data -->
<div class="section">
  <h2>Input Data</h2>
  <div class="inputs-row">
    ${inputDataControls}
  </div>
</div>

<!-- Parameters -->
<div class="section">
  <h2>Parameters</h2>
  <div class="param-grid">
    ${paramsControls}
  </div>
  ${runRow}
  ${seqPickerRow}
</div>

<!-- Charts -->
<div class="chart-card" id="scan-card">
  <div id="heat-wrap" class="chart-row"></div>
  <div id="scan-hint" class="scan-hint">Click a heatmap row to view all peptides for that allele.</div>
  <div id="pep-wrap" class="chart-row"></div>
</div>

