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
import {comboSelectLazy} from "./components/comboSelectLazy.js";

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

/* Build the control once; it queries by current predictor class on demand */
const alleleCtrl = comboSelectLazy({
  label: "Alleles",
  placeholder: "Type allele…",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,
  pageLimit: 50,
  fetch: ({ q, offset, limit }) => fetchAlleles(getPredictor().cls, q, offset, limit)
});

/* Stream of selections from the control */
const chosenAlleles = Generators.input(alleleCtrl);

/* Helper that always returns a clean array of selected alleles */
function getChosenAlleles() {
  // prefer the generator’s current value
  const v = chosenAlleles;
  if (Array.isArray(v)) return v.filter(Boolean);
  // fallback to the control’s .value (comboSelectLazy keeps an Array there too)
  return Array.from(alleleCtrl?.value || []).filter(Boolean);
}

/* If predictor class changes, clear current picks (so you don't mix I/II) */
{
  predictor; // reactive
  if (alleleCtrl && "value" in alleleCtrl) {
    alleleCtrl.value = [];
    alleleCtrl.dispatchEvent?.(new CustomEvent("input"));
  }
}

```

```js
/* When predictor class changes, clear current allele picks.
   comboSelectLazy will fetch the right class on the next search. */
{
  predictor; // reactive dependency
  if (alleleCtrl && "value" in alleleCtrl) {
    alleleCtrl.value = [];
    alleleCtrl.dispatchEvent?.(new CustomEvent("input"));
  }
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
      } else {
        buf.push(line.trim());
      }
    }
    if (buf.length) out.push({id, sequence: buf.join("").replace(/\s+/g,"").toUpperCase()});
    return out;
  }
  return [{id:"seq1", sequence: s.replace(/\s+/g,"").toUpperCase()}];
}


// Hardened file→text helper (accepts File, [File], uploadButton root, or <input type=file>)
async function readFileText(fileish) {
  if (!fileish) return "";

  const isFileLike = (f) => f && typeof f.text === "function";

  // Direct File
  if (isFileLike(fileish)) return await fileish.text();

  // { value: File }
  if (fileish && fileish.value && isFileLike(fileish.value)) {
    return await fileish.value.text();
  }

  // [File]
  if (Array.isArray(fileish) && fileish.length && isFileLike(fileish[0])) {
    return await fileish[0].text();
  }

  // { files: [File, ...] }
  if (fileish && Array.isArray(fileish.files) && fileish.files.length && isFileLike(fileish.files[0])) {
    return await fileish.files[0].text();
  }

  // <input type="file"> element
  if (fileish && fileish.tagName && fileish.tagName.toLowerCase() === "input" && fileish.type === "file") {
    const f = fileish.files && fileish.files[0];
    if (isFileLike(f)) return await f.text();
  }

  // uploadButton root element that *contains* an <input type="file">
  if (fileish && typeof fileish.querySelector === "function") {
    const inp = fileish.querySelector('input[type="file"]');
    if (inp && inp.files && inp.files[0] && isFileLike(inp.files[0])) {
      return await inp.files[0].text();
    }
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
/* ── IEDB API helpers + normalizer (single cell so names are always in scope) ── */

/* Build body for a single predictor, multiple alleles, all sequences.
   API expects peptide_length_range as a *list* [min, max]. For a single
   length (e.g. 9), send [9, 9]. If user leaves it blank, use class defaults. */
function buildBody({ cls, method, alleles, lengths, fastaText }) {
  // turn [8,9,10,11] → [8,11]; [] → class default
  const toRange = (lens, cls) => {
    if (Array.isArray(lens) && lens.length) {
      const lo = Math.min(...lens);
      const hi = Math.max(...lens);
      return [lo, hi];
    }
    return cls === "II" ? [15, 15] : [9, 9]; // sensible defaults
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
        alleles: (alleles || []).join(","),   // server expects a comma-joined string
        peptide_length_range,                 // ← array [min,max]
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
  const j   = (() => { try { return JSON.parse(txt); } catch { return txt; } })();

  // Treat server-returned errors as failures even if HTTP 200
  if (!r.ok || (j && Array.isArray(j.errors) && j.errors.length)) {
    const msg = Array.isArray(j?.errors) && j.errors.length ? j.errors.join("; ") : r.statusText;
    throw new Error(msg || "Pipeline submission failed");
  }

  // result id can be the last path segment of results_uri
  const id = j?.results_uri?.split?.("/")?.pop?.();
  if (!id) throw new Error("No result id in pipeline response");
  return id;
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

/* Robust poller for IEDB results with backoff + live status */
async function pollWithStatus(
  resultId,
  {
    timeout = 10 * 60_000,         // 10 minutes default
    minDelay = 900,                // initial delay between polls
    maxDelay = 5_000,              // cap the delay
    backoff = 1.35,                // multiplicative backoff
    onTick
  } = {}
) {
  const t0 = Date.now();
  let delay = minDelay;
  let tries = 0;

  while (Date.now() - t0 < timeout) {
    tries++;
    onTick?.({ iter: tries, elapsed: Date.now() - t0 });

    let j;
    try {
      const r = await fetch(`/api/iedb-result?id=${resultId}`);
      const txt = await r.text();
      j = (() => { try { return JSON.parse(txt); } catch { return txt; } })();
    } catch (e) {
      // transient network issue — keep going after a short wait
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(Math.floor(delay * backoff), maxDelay);
      continue;
    }

    // If the proxy supplies explicit errors even while pending, surface them
    const apiErrors =
      (j && j.data && Array.isArray(j.data.errors) && j.data.errors.length)
        ? j.data.errors
        : [];

    if (j?.status === "done") {
      if (apiErrors.length) throw new Error(apiErrors.join("; "));
      const tbl = j.data?.results?.find(t => t.type === "peptide_table");
      if (tbl) return tbl;
      throw new Error("No peptide_table in result");
    }

    if (j?.status === "error") {
      const msg = apiErrors.length ? apiErrors.join("; ") : "IEDB returned error status";
      throw new Error(msg);
    }

    // pending / queued / running — keep waiting
    const status = j?.status ?? "pending";
    const sec = Math.floor((Date.now() - t0) / 1000);
    setBanner?.(`IEDB status: ${status} — ${sec}s (try ${tries})`);

    await new Promise(res => setTimeout(res, delay));
    delay = Math.min(Math.floor(delay * backoff), maxDelay);
  }

  throw new Error("Timed out polling IEDB");
}


function rowsFromTable(tbl) {
  const keys = tbl.table_columns.map(c => c.display_name || c.name);
  return tbl.table_data.map(r => Object.fromEntries(r.map((v,i)=>[keys[i],v])));
}

/* Normalize result rows to a common shape */
function normalizeRows(rows, {cls, method}) {
  const findCol = (obj, names) => {
    const keys = Object.keys(obj);
    for (const n of names) {
      const k = keys.find(k => k.toLowerCase() === n.toLowerCase());
      if (k) return k;
    }
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
/* ▶ Run pipeline — only after clicking Run */
{
  buildBody; submit; pollWithStatus; rowsFromTable; normalizeRows;

  for await (const _ of Generators.input(runBtn)) {
    try {
      console.groupCollapsed("▶️ Run prediction");
      setBanner("Preparing input…");

      // Sequences: textarea + optional FASTA upload
      const seqFile =
        (uploadSeqBtn && uploadSeqBtn.value && typeof uploadSeqBtn.value.text === "function")
          ? uploadSeqBtn.value
          : uploadSeqBtn; // also allow the root itself in case the File is nested

      const fromFileText = await readFileText(seqFile);
      const fromText     = (typeof seqText === "string") ? seqText : "";

      const parsedFromText = parseFastaOrRaw(fromText);
      const parsedFromFile = parseFastaOrRaw(fromFileText);

      const seqs = [...parsedFromText, ...parsedFromFile]
        .filter(s => s.sequence && /^[ACDEFGHIKLMNPQRSTVWY-]+$/i.test(s.sequence));

      if (!seqs.length) {
        setBanner(
          `Please enter or upload at least one sequence. ` +
          `(seqTextLen=${fromText.length}, fileTextLen=${fromFileText.length}, ` +
          `parsedFromText=${parsedFromText.length}, parsedFromFile=${parsedFromFile.length})`
        );
        console.warn("No sequences", { fromTextLen: fromText.length, fromFileTextLen: fromFileText.length, parsedFromText, parsedFromFile });
        console.groupEnd();
        continue;
      }

      // publish sequence list
      if (seqListMut && "value" in seqListMut) seqListMut.value = seqs;

      // ensure chosenSeqId is valid for the current run’s list
      if (chosenSeqIdMut && "value" in chosenSeqIdMut) {
        const current = chosenSeqIdMut.value;
        const ok = current && seqs.some(s => s.id === current);
        chosenSeqIdMut.value = ok ? current : seqs[0].id;
      }


      // Alleles (array)
      const alleles = getChosenAlleles();
      if (!alleles.length) {
        setBanner("Please select at least one allele.");
        console.warn("No alleles", { chosen: alleles });
        console.groupEnd();
        continue;
      }

      // UI lengths (for display + API)
      const pred = getPredictor();
      const lens = parseLengths(typeof lengthText === "string" ? lengthText : "", pred.cls);

      // Build multi-FASTA
      const fastaText = seqs.map(s => `>${s.id}\n${s.sequence}`).join("\n");

      // Submit (peptide_length_range now sent as string via buildBody)
      const body = buildBody({
        cls     : pred.cls,
        method  : pred.method,
        alleles : alleles,
        lengths : lens,
        fastaText
      });

      console.log("Submitting /api/iedb-pipeline →", {
        tool_group: body.stages[0].tool_group,
        method    : pred.method,
        nSequences: seqs.length,
        nAlleles  : alleles.length,
        peptide_length_range: body.stages[0].input_parameters.peptide_length_range, // should be [min,max]
        fastaPreview: fastaText.slice(0, 120)
      });


      setBanner(`Submitting ${seqs.length} seq(s), ${alleles.length} allele(s)…`);
      const resultId = await submit(body);
      console.log("→ resultId:", resultId);
      setBanner(`Submitted. Result id: ${resultId}. Polling…`);

      // Poll with backoff + live status (longer timeout)
      let lastSec = -1;
      const tbl = await pollWithStatus(resultId, {
        timeout : 10 * 60_000,   // 10 minutes
        minDelay: 900,
        maxDelay: 5_000,
        backoff : 1.35,
        onTick  : ({ iter, elapsed }) => {
          const sec = Math.floor(elapsed / 1000);
          if (sec !== lastSec) {
            lastSec = sec;
            setBanner(`Polling IEDB… ${sec}s (try ${iter})`);
          }
        }
      });


      // Normalize and publish rows
      const rawRows  = rowsFromTable(tbl);
      const normRows = normalizeRows(rawRows, pred);
      if (predRowsMut && "value" in predRowsMut) predRowsMut.value = normRows;

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
/* Normalize predictor into {cls, method} no matter what the select returns */
function getPredictor() {
  const p = predictor;
  if (!p) return { cls: "I", method: "netmhcpan_el" };
  return p.value && p.value.cls ? p.value : p; // if option wrapper, use .value
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

/* Build heatmap / peptide rows with fallback position inference */
function buildHeatmapData({rows, seqId, sequence, method, cls}) {
  if (!rows?.length || !sequence) return [];
  const AA = sequence.toUpperCase();
  const best = new Map(); // key: allele|pos → {pct, peptide, aa}

  for (const r of rows) {
    if (r.cls && cls && r.cls !== cls) continue;
    const kAllele = r.allele;

    // prefer server positions; otherwise infer from first occurrence
    let start = (r.start == null || Number.isNaN(+r.start)) ? null : +r.start;
    let len   = (r.length== null || Number.isNaN(+r.length)) ? null : +r.length;

    if ((start == null || len == null) && r.peptide) {
      const idx = AA.indexOf(String(r.peptide).toUpperCase());
      if (idx >= 0) { start = idx + 1; len = r.peptide.length; }
    }
    if (!start || !len) continue;

    const pct = isFinite(r.pct) ? +r.pct : Infinity;
    for (let i = 0; i < len; i++) {
      const pos  = start + i;                         // 1-based
      const aa   = AA[pos - 1] || "-";
      const key  = `${kAllele}|${pos}`;
      const prev = best.get(key);
      if (!prev || pct < prev.pct) {
        best.set(key, { allele: kAllele, pos, pct, peptide: r.peptide, aa });
      }
    }
  }

  return [...best.values()];
}

function buildPeptideRows({rows, seqId, allele, sequence}) {
  const AA = (sequence || "").toUpperCase();
  const subset = rows.filter(r => r.allele === allele);

  return subset.map(r => {
    let start  = (r.start == null) ? null : +r.start;
    let length = (r.length == null) ? null : +r.length;

    if ((start == null || length == null) && r.peptide && AA) {
      const idx = AA.indexOf(String(r.peptide).toUpperCase());
      if (idx >= 0) { start = idx + 1; length = r.peptide.length; }
    }

    return {
      start,
      length,
      peptide: r.peptide,
      peptide_aligned: r.peptide,
      protein: seqId
    };
  }).filter(rr => rr.start != null && rr.length != null);
}

function buildOverlayRows({peptides, sequence}) {
  if (!peptides?.length || !sequence) return [];
  const AA = sequence.toUpperCase();
  const rows = [];
  for (const p of peptides) {
    const idx = AA.indexOf(p.toUpperCase());
    if (idx >= 0) {
      rows.push({ start: idx + 1, length: p.length, peptide: p, peptide_aligned: p });
    }
  }
  return rows;
}

```


```js
/* Chart mounting (inside your HTML container) */
{
  predRowsMut; seqListMut; chosenSeqIdMut; predictor; uploadedPepsMut; // reactive

  const heatWrap = document.getElementById("heat-wrap");
  const pepWrap  = document.getElementById("pep-wrap");
  const hintEl   = document.getElementById("scan-hint");

  if (!heatWrap || !pepWrap || !hintEl) {
    console.warn("Chart containers not found in DOM.");
    return;
  }

  heatWrap.replaceChildren();
  pepWrap.replaceChildren();
  hintEl.style.display = ""; // shown until a row/allele is clicked

  const currChosenId =
    (chosenSeqIdMut && typeof chosenSeqIdMut === "object" && "value" in chosenSeqIdMut)
      ? chosenSeqIdMut.value
      : null;

  const seqRec = getSeqRecord(currChosenId);
  const pred = getPredictor();

  if (!seqRec) {
    heatWrap.appendChild(Object.assign(document.createElement("div"), {
      style: "padding:8px;color:#666;font-style:italic;",
      textContent: "No sequence selected (or selection not in current run)."
    }));
    return;
  }

  const seqId  = seqRec.id;
  const seqAA  = seqRec.sequence || "";
  const rows   = predRowsMut.value || [];

  // Heatmap data across *all alleles selected in predictor run*
  const heatData = buildHeatmapData({
    rows, seqId, sequence: seqAA, method: pred.method, cls: pred.cls
  });

  if (!heatData.length) {
    heatWrap.appendChild(Object.assign(document.createElement("div"), {
      style: "padding:8px;color:#666;font-style:italic;",
      textContent: "No positional hits to plot (no start/length in results and none could be inferred from the sequence)."
    }));
    return;
  }

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
    const pepRows = buildPeptideRows({rows, seqId, allele, sequence: seqAA});

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
        netmhcpan_el_percentile: pred.method.includes("el") ? r.pct : undefined,
        netmhcpan_ba_percentile: pred.method.includes("ba") ? r.pct : undefined
      })),
      xScale     : currentScale,
      sizeFactor : 1.2,
      rowHeight  : 18,
      gap        : 2,
      margin     : { top:20, right:20, bottom:30, left:40 },
      colourBy   : allele,
      onZoom     : (x, t) => {
        if (syncing) return;
        syncing = true;
        currentScale = x; currentTransform = t;
        heatEl.__setZoom?.(t);
        syncing = false;
      }
    });

    // Optional overlay row
    if (overlayRows.length) {
      const g2 = g.append("g").attr("transform", `translate(0, ${chart.height})`);
      const overlay = peptideScanChart(g2, {
        data       : overlayRows,
        alleleData : [],
        xScale     : currentScale,
        sizeFactor : 1.0,
        rowHeight  : 14,
        gap        : 2,
        margin     : { top:12, right:20, bottom:24, left:40 },
        colourBy   : "attribute_1"
      });
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
}

```

```js
// Input Data section
const inputDataControls = html`<div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;"></div>`;
inputDataControls.append(uploadSeqBtn, seqTextarea, uploadPepBtn);

// Parameters section
const paramsControls = html`<div style="display:grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap:12px;"></div>`;
paramsControls.append(predictorSelectEl, lengthTextEl, alleleCtrl); // ← replaced alleleSelectEl with alleleCtrl


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

```js
/* Live debug panel — shows current inputs/state */
const debugPanel = html`<details open style="margin-top:10px;">
  <summary style="cursor:pointer;">Debug: input snapshot</summary>
  <pre style="background:#fafafa;border:1px solid #eee;padding:8px;max-height:320px;overflow:auto;margin-top:6px;"></pre>
</details>`;

{
  // make it reactive
  predictor; lengthText; chosenAlleles; seqText; uploadSeqBtn;

  const pre = debugPanel.querySelector("pre");

  // probe the upload control
  const ref = uploadSeqBtn;
  const v   = ref?.value ?? null;

  const nameFrom =
    v?.name ||
    v?.value?.name ||
    (Array.isArray(v) && v[0]?.name) ||
    ref?.files?.[0]?.name ||
    (ref?.querySelector?.('input[type="file"]')?.files?.[0]?.name) ||
    null;

  let fileText = "";
  try { fileText = await readFileText(v || ref); } catch {}

  const seqTextStr = (typeof seqText === "string") ? seqText : "";

  const info = {
    predictor: getPredictor(),
    lengthTextRaw: lengthText,
    parsedLengths: parseLengths(lengthText, getPredictor().cls),

    seqText: {
      type: typeof seqText,
      length: seqTextStr.length,
      preview: seqTextStr.slice(0, 120)
    },

    uploadSeq: {
      hasValue: !!v,
      typeofValue: v ? Object.prototype.toString.call(v) : null,
      fileName: nameFrom,
      fileTextLen: fileText.length,
      fileTextPreview: fileText.slice(0, 120)
    },

    parsed: {
      fromTextCount: parseFastaOrRaw(seqTextStr).length,
      fromFileCount: parseFastaOrRaw(fileText).length
    },

    chosenAlleles: getChosenAlleles()
  };

  pre.textContent = JSON.stringify(info, null, 2);
}

/* Add the panel somewhere visible in your UI */
const debugSection = html`<div class="section"><h2>Debug</h2>${debugPanel}</div>`;

```



<!-- Debug (live snapshot) -->
${debugSection}