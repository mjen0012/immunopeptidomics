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
// peptideScanChart intentionally not used to keep MVP simple
import {uploadButton} from "./components/uploadButton.js";
import {comboSelectLazy} from "./components/comboSelectLazy.js";

// Tiny DB for HLA lists
const db = extendDB(
  await DuckDBClient.of({
    hla: FileAttachment("data/HLAlistClassI.parquet").parquet()
  })
);

```

```js
/* ── State ──────────────────────────────────────────────────── */
const predRowsMut       = Mutable([]);     // normalized rows for the (single) sequence
const rawTableMut       = Mutable(null);   // exact peptide_table from IEDB (for CSV)
const seqListMut        = Mutable([]);     // [{id, sequence}] (we'll use the first only)
const chosenSeqIdMut    = Mutable(null);   // id of the chosen sequence (auto-first)
const uploadedPepsMut   = Mutable([]);     // not used for now, but kept
const uploadSeqFileMut  = Mutable(null);   // File for .fasta (persisted)
const uploadPepFileMut  = Mutable(null);   // File for peptides (unused here)

```

```js
/* ── Controls: predictor + lengths ──────────────────────────── */
const predictorOptions = [
  { label: "Class I — netMHCpan 4.1 EL", value: { cls:"I",  method:"netmhcpan_el"  } },
  { label: "Class I — netMHCpan 4.1 BA", value: { cls:"I",  method:"netmhcpan_ba"  } },
  { label: "Class II — netMHCIIpan 4.3 EL", value: { cls:"II", method:"netmhciipan_el" } },
  { label: "Class II — netMHCIIpan 4.3 BA", value: { cls:"II", method:"netmhciipan_ba" } }
];

const predictorSelectEl = Inputs.select(predictorOptions, {
  label: "Predictor",
  format: o => o.label,
  value: predictorOptions[0]
});
const predictor = Generators.input(predictorSelectEl);

const lengthTextEl = Inputs.text({
  label: "Peptide lengths (single or range)",
  placeholder: "e.g. 9  or  8-11  or  8,9,10",
  value: "9"
});
const lengthText = Generators.input(lengthTextEl);

/* Parse "9", "8-11", "8,9,10" etc. Defaults: I→9, II→15 */
function parseLengths(text, cls) {
  const norm = String(text||"").trim();
  if (!norm) return cls==="II" ? [15] : [9];
  const parts = norm.split(",").map(s=>s.trim()).filter(Boolean);
  let out = [];
  for (const p of (parts.length ? parts : [norm])) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(p);
    if (m) {
      const lo = Math.min(+m[1], +m[2]), hi = Math.max(+m[1], +m[2]);
      for (let v=lo; v<=hi; v++) out.push(v);
    } else if (/^\d+$/.test(p)) {
      out.push(+p);
    }
  }
  out = [...new Set(out)].sort((a,b)=>a-b);
  return out.length ? out : (cls==="II" ? [15] : [9]);
}

/* Always a {cls, method} */
function getPredictor() {
  const p = predictor;
  if (!p) return { cls:"I", method:"netmhcpan_el" };
  return p.value && p.value.cls ? p.value : p;
}

```

```js
/* ── Lazy allele search (kept) ──────────────────────────────── */
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

const alleleCtrl = comboSelectLazy({
  label: "Alleles",
  placeholder: "Type allele…",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,
  pageLimit: 50,
  fetch: ({ q, offset, limit }) => fetchAlleles(getPredictor().cls, q, offset, limit)
});
const chosenAlleles = Generators.input(alleleCtrl);

function getChosenAlleles() {
  const v = chosenAlleles;
  if (Array.isArray(v)) return v.filter(Boolean);
  return Array.from(alleleCtrl?.value || []).filter(Boolean);
}

/* Clear allele picks if class changes */
{
  predictor; // reactive
  if (alleleCtrl && "value" in alleleCtrl) {
    alleleCtrl.value = [];
    alleleCtrl.dispatchEvent?.(new CustomEvent("input"));
  }
}

```

```js
/* ── Upload controls + capture Files into Mutables ───────────── */
const uploadSeqBtn = uploadButton({ label:"Upload Sequence (.fasta)", accept: ".fasta" });
const uploadPepBtn = uploadButton({ label:"Upload Peptides (.csv)",   accept: ".csv" });

{
  const isFileLike = f => f && typeof f.text === "function";

  // sequences
  (async () => {
    for await (const _ of Generators.input(uploadSeqBtn)) {
      let f = null;
      if (isFileLike(uploadSeqBtn?.value)) f = uploadSeqBtn.value;
      else {
        const inp = uploadSeqBtn?.querySelector?.('input[type="file"]');
        if (inp?.files?.[0]) f = inp.files[0];
      }
      uploadSeqFileMut.value = f;
    }
  })();

  // peptides (unused here but kept)
  (async () => {
    for await (const _ of Generators.input(uploadPepBtn)) {
      let f = null;
      if (isFileLike(uploadPepBtn?.value)) f = uploadPepBtn.value;
      else {
        const inp = uploadPepBtn?.querySelector?.('input[type="file"]');
        if (inp?.files?.[0]) f = inp.files[0];
      }
      uploadPepFileMut.value = f;
    }
  })();
}

/* Optional textarea as a fallback/alternative */
const seqTextarea = Inputs.textarea({
  label:"Sequence(s)",
  rows: 7,
  placeholder: ">seq1\nMKTIIAL...\n>seq2\nMNPQRST..."
});
const seqText = Generators.input(seqTextarea);

/* Helpers */
async function readFileText(fileish) {
  if (!fileish) return "";
  if (fileish && typeof fileish.text === "function") return await fileish.text();
  // handle <input> etc if needed
  return "";
}

function parseFastaOrRaw(text) {
  const s = (typeof text === "string" ? text : String(text ?? "")).trim();
  if (!s) return [];
  if (s.startsWith(">")) {
    const out = [];
    let id = "seq", buf = [];
    for (const line of s.split(/\r?\n/)) {
      if (line.startsWith(">")) {
        if (buf.length) out.push({id, sequence: buf.join("").replace(/\s+/g,"").toUpperCase()});
        id = line.replace(/^>\s*/,"").trim() || `seq${out.length+1}`;
        buf = [];
      } else buf.push(line.trim());
    }
    if (buf.length) out.push({id, sequence: buf.join("").replace(/\s+/g,"").toUpperCase()});
    return out;
  }
  return [{id:"seq1", sequence: s.replace(/\s+/g,"").toUpperCase()}];
}

```

```js
/* ── IEDB helpers ────────────────────────────────────────────── */
function buildBody({ cls, method, alleles, lengths, fastaText }) {
  const toRange = (lens, cls) => {
    if (Array.isArray(lens) && lens.length) {
      const lo = Math.min(...lens), hi = Math.max(...lens);
      return [lo, hi];
    }
    return cls === "II" ? [15, 15] : [9, 9];
  };
  const peptide_length_range = toRange(lengths, cls);

  return {
    run_stage_range: [1, 1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : cls === "II" ? "mhcii" : "mhci",
      input_sequence_text: fastaText,
      input_parameters: {
        alleles: (alleles || []).join(","),
        peptide_length_range,
        predictors: [{ type: "binding", method }]
      }
    }]
  };
}

async function submit(body) {
  const r = await fetch("/api/iedb-pipeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  const j = (()=>{try{return JSON.parse(txt);}catch{return txt;}})();
  if (!r.ok || (j && Array.isArray(j.errors) && j.errors.length)) {
    const msg = Array.isArray(j?.errors) && j.errors.length ? j.errors.join("; ") : r.statusText;
    throw new Error(msg || "Pipeline submission failed");
  }
  const id = j?.results_uri?.split?.("/")?.pop?.();
  if (!id) throw new Error("No result id in pipeline response");
  return id;
}

async function pollWithStatus(
  resultId,
  { timeout=10*60_000, minDelay=900, maxDelay=5_000, backoff=1.35, onTick } = {}
) {
  const t0 = Date.now();
  let delay = minDelay;
  while (Date.now() - t0 < timeout) {
    onTick?.({ elapsed: Date.now() - t0 });
    try {
      const r = await fetch(`/api/iedb-result?id=${resultId}`);
      const txt = await r.text();
      const j = (()=>{try{return JSON.parse(txt);}catch{return txt;}})();
      if (j?.status === "done") {
        const tbl = j.data?.results?.find(t => t.type === "peptide_table");
        if (tbl) return tbl;
        throw new Error("No peptide_table in result");
      }
      if (j?.status === "error") {
        const errs = (j?.data?.errors || []);
        throw new Error(errs.join("; ") || "IEDB returned error");
      }
    } catch (e) {
      // swallow and backoff
    }
    await new Promise(res => setTimeout(res, delay));
    delay = Math.min(Math.floor(delay * backoff), maxDelay);
  }
  throw new Error("Timed out polling IEDB");
}

/* Convert IEDB peptide_table → array of objects with display headers */
function rowsFromTable(tbl) {
  const keys = tbl.table_columns.map(c => c.display_name || c.name);
  return tbl.table_data.map(r => Object.fromEntries(r.map((v,i)=>[keys[i],v])));
}

/* Normalize to a simple shape for heatmap; we rely on start/length being present */
function normalizeRows(rows, {cls, method}) {
  const findCol = (obj, names) => {
    const keys = Object.keys(obj);
    for (const n of names) {
      const k = keys.find(k => k.toLowerCase() === n.toLowerCase());
      if (k) return k;
    }
    for (const k of keys) if (names.some(n => k.toLowerCase().includes(n.toLowerCase()))) return k;
    return null;
  };

  const out = [];
  for (const r of rows) {
    const pepK = findCol(r, ["peptide"]);
    const alK  = findCol(r, ["allele"]);
    const sK   = findCol(r, ["start","start position","start_position"]);
    const lK   = findCol(r, ["peptide length","length","peptide_length"]);
    const pctK = findCol(r, [
      method==="netmhcpan_el"   ? "netmhcpan_el percentile"
    : method==="netmhcpan_ba"   ? "netmhcpan_ba percentile"
    : method==="netmhciipan_el" ? "netmhciipan_el percentile"
    :                              "netmhciipan_ba percentile"
    ]);
    if (!pepK || !alK || !sK || !lK) continue;
    out.push({
      allele : String(r[alK]).toUpperCase(),
      peptide: String(r[pepK]).toUpperCase(),
      start  : +r[sK],
      length : +r[lK],
      pct    : pctK ? +r[pctK] : null,
      method, cls
    });
  }
  return out;
}

```

```js
/* ── UI bits: banner, run, HUD, download (raw IEDB CSV) ─────── */
const statusBanner = html`<div style="margin:.5rem 0; font-style:italic;"></div>`;
function setBanner(msg) { statusBanner.textContent = msg; }

const runBtn = Inputs.button("Run prediction");
const triggerRun = Generators.input(runBtn);

/* HUD (define before we append it) */
const hud = html`<div style="margin:.5rem 0; font-family:monospace; color:#444;"></div>`;
{
  predRowsMut; seqListMut; chosenSeqIdMut; // reactive
  const nSeq  = (seqListMut?.value || []).length;
  const selId = chosenSeqIdMut?.value ?? null;
  const nRows = (predRowsMut?.value || []).length;
  hud.textContent = `HUD → sequences=${nSeq}, chosenSeqId=${JSON.stringify(selId)}, predRows=${nRows}`;
}

/* Exact IEDB peptide_table CSV (columns/order preserved) */
function downloadIEDBCSVButton() {
  const btn = Inputs.button("Download IEDB table (CSV)");
  btn.onclick = () => {
    const tbl = rawTableMut?.value;
    if (!tbl) { alert("No IEDB table yet."); return; }
    const headers = tbl.table_columns.map(c => c.display_name || c.name);
    const rows = tbl.table_data.map(r => r.map(v => v ?? ""));
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {href:url, download:"iedb_peptide_table.csv"}).click();
    URL.revokeObjectURL(url);
  };
  return btn;
}
const downloadRawBtn = downloadIEDBCSVButton();

```

```js
/* ── Run pipeline (single-sequence MVP) ──────────────────────── */
{
  buildBody; submit; pollWithStatus; rowsFromTable; normalizeRows; readFileText; parseFastaOrRaw;

  for await (const _ of Generators.input(runBtn)) {
    try {
      console.groupCollapsed("▶️ Run prediction");
      setBanner("Preparing input…");

      // Gather sequences: prefer uploaded FASTA; fallback to textarea
      const fileText = await readFileText(uploadSeqFileMut?.value);
      const textText = (typeof seqText === "string") ? seqText : "";
      const parsedFromFile = parseFastaOrRaw(fileText);
      const parsedFromText = parseFastaOrRaw(textText);
      const seqs = [...parsedFromFile, ...parsedFromText];

      // Publish sequence list and select the first one (MVP)
      if (seqListMut && "value" in seqListMut) seqListMut.value = seqs;
      if (chosenSeqIdMut && "value" in chosenSeqIdMut) {
        chosenSeqIdMut.value = seqs.length ? seqs[0].id : null;
      }

      if (!seqs.length) {
        setBanner("Please upload or enter at least one sequence.");
        console.warn("No sequences found.");
        console.groupEnd();
        continue;
      }

      // Alleles
      const alleles = getChosenAlleles();
      if (!alleles.length) {
        setBanner("Please select at least one allele.");
        console.warn("No alleles selected.");
        console.groupEnd();
        continue;
      }

      // Predict for the FIRST sequence only (simplest, per your guidance)
      const first = seqs[0];
      const pred  = getPredictor();
      const lens  = parseLengths(typeof lengthText === "string" ? lengthText : "", pred.cls);
      const fastaText = `>${first.id}\n${first.sequence}`;

      // Submit
      const body = buildBody({
        cls: pred.cls, method: pred.method, alleles, lengths: lens, fastaText
      });

      console.log("Submitting /api/iedb-pipeline →", {
        tool_group: body.stages[0].tool_group,
        method    : pred.method,
        nSequences: 1,
        nAlleles  : alleles.length,
        peptide_length_range: body.stages[0].input_parameters.peptide_length_range,
        fastaPreview: fastaText.slice(0, 120)
      });

      setBanner(`Submitting 1 seq, ${alleles.length} allele(s)…`);
      const resultId = await submit(body);
      setBanner(`Submitted. Result id: ${resultId}. Polling…`);

      // Poll
      const tbl = await pollWithStatus(resultId, {
        onTick: ({elapsed}) => {
          const sec = Math.floor(elapsed/1000);
          if (sec % 1 === 0) setBanner(`Polling IEDB… ${sec}s`);
        }
      });

      // Store raw table and normalized rows
      rawTableMut.value = tbl;
      const rawRows  = rowsFromTable(tbl);
      const normRows = normalizeRows(rawRows, pred);
      predRowsMut.value = normRows;

      console.log("Received rows:", normRows.length);
      setBanner(`Done — ${normRows.length} rows.`);
      console.groupEnd();
    } catch (err) {
      console.error("Run error:", err);
      setBanner(`Error: ${err?.message || err}`);
      console.groupEnd();
    }
  }
}

```

```js
/* ── Heatmap (simple, single sequence) ───────────────────────── */
function buildHeatmapData({rows, sequence}) {
  if (!rows?.length) return [];
  const AA = (sequence || "").toUpperCase();
  const best = new Map(); // key: allele|pos → {pct, peptide, aa, pos}
  for (const r of rows) {
    const kAllele = r.allele;
    const start = +r.start;
    const len   = +r.length;
    if (!start || !len) continue;
    const pct = isFinite(r.pct) ? +r.pct : Infinity;
    for (let i = 0; i < len; i++) {
      const pos  = start + i;             // 1-based
      const aa   = AA[pos - 1] || "-";
      const key  = `${kAllele}|${pos}`;
      const prev = best.get(key);
      if (!prev || pct < prev.pct) {
        best.set(key, { allele:kAllele, pos, pct, peptide:r.peptide, aa });
      }
    }
  }
  return [...best.values()];
}

{
  predRowsMut; seqListMut; chosenSeqIdMut; predictor; // reactive

  const heatWrap = document.getElementById("heat-wrap");
  if (!heatWrap) {
    console.warn("heat-wrap not found in DOM.");
  } else {
    heatWrap.replaceChildren();

    const rows = predRowsMut?.value || [];
    const seqs = seqListMut?.value || [];
    const seqAA = seqs.length ? seqs[0].sequence : "";

    if (!rows.length || !seqAA) {
      // show nothing yet (no top-level return)
    } else {
      const heatData = buildHeatmapData({ rows, sequence: seqAA });
      const seqLen = seqAA.length || d3.max(heatData, d => d.pos) || 1;

      const heatEl = heatmapChart({
        data: heatData,
        posExtent: [1, seqLen],
        margin: { top:16, right:20, bottom:60, left:90 }
      });
      heatWrap.appendChild(heatEl);
    }
  }
}

```

```js
/* ── Layout pieces to slot into the page ─────────────────────── */
const inputDataControls = html`<div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;"></div>`;
inputDataControls.append(uploadSeqBtn, seqTextarea, uploadPepBtn);

const paramsControls = html`<div style="display:grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap:12px;"></div>`;
paramsControls.append(predictorSelectEl, lengthTextEl, alleleCtrl);

const runRow = html`<div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-top:8px;"></div>`;
runRow.append(runBtn, statusBanner, downloadRawBtn, hud);

/* Expose for HTML slots (no seqPicker in MVP) */
({inputDataControls, paramsControls, runRow});

```

```js
/* ── Debug panel (optional) ──────────────────────────────────── */
const debugPanel = html`<details open style="margin-top:10px;">
  <summary style="cursor:pointer;">Debug: input snapshot</summary>
  <pre style="background:#fafafa;border:1px solid #eee;padding:8px;max-height:320px;overflow:auto;margin-top:6px;"></pre>
</details>`;

{
  predictor; lengthText; chosenAlleles; seqText; uploadSeqFileMut;

  const pre = debugPanel.querySelector("pre");
  const v   = uploadSeqFileMut?.value ?? null;

  let fileText = "";
  try { fileText = await readFileText(v); } catch {}

  const seqTextStr = (typeof seqText === "string") ? seqText : "";

  const info = {
    predictor: getPredictor(),
    lengthTextRaw: lengthText,
    parsedLengths: parseLengths(lengthText, getPredictor().cls),
    seqText: { type: typeof seqText, length: seqTextStr.length, preview: seqTextStr.slice(0, 120) },
    uploadSeq: {
      hasValue: !!v,
      fileName: v?.name || null,
      fileTextLen: fileText.length,
      fileTextPreview: fileText.slice(0, 120)
    },
    chosenAlleles: getChosenAlleles(),
    seqListMutLen: (seqListMut?.value || []).length,
    predRowsLen: (predRowsMut?.value || []).length
  };

  pre.textContent = JSON.stringify(info, null, 2);
}

const debugSection = html`<div class="section"><h2>Debug</h2>${debugPanel}</div>`;

```

<!-- Input Data --> 
<div class="section"> 
<h2>Input Data</h2> 
<div class="inputs-row"> ${inputDataControls} 
</div> </div> <!-- Parameters --> <div class="section"> <h2>Parameters</h2> <div class="param-grid"> ${paramsControls} </div> ${runRow} </div> <!-- Charts --> <div class="chart-card" id="scan-card"> <div id="heat-wrap" class="chart-row"></div> <div id="scan-hint" class="scan-hint" style="display:none;">Click a heatmap row to view all peptides for that allele.</div> <div id="pep-wrap" class="chart-row" style="display:none;"></div> </div> <!-- Debug (live snapshot) -->

${debugSection}