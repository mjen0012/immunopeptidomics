---
theme: [air]
title: Peptide Binding Prediction V2
slug: netmhc
toc: false
---

```js
// Imports (no DuckDB)
import { uploadButton }    from "./components/uploadButton.js";
import { comboSelectLazy } from "./components/comboSelectLazy.js";
import { dropSelect }      from "./components/dropSelect.js";
```

```js
/* ── State ───────────────────────────────────────────────────────── */
const seqListMut       = Mutable([]);    // [{id, sequence}]
const uploadSeqFileMut = Mutable(null);  // File | null
const chosenSeqIdMut   = Mutable(null);  // string | null
const fastaTextMut = Mutable("");
const chosenAllelesMut  = Mutable([]);                         // kept in sync with allele control
const predRowsMut       = Mutable([]);                         // raw peptide_table rows as objects
```

```js
/* ── Load HLA list from Parquet (no SQL) ─────────────────────────── */
// Expect columns "Class I" and/or "Class II" (case-insensitive).
const hlaTable = await FileAttachment("data/HLAlistClassI.parquet").parquet();

function extractColumnValues(table, names) {
  const fields = table.schema.fields.map(f => f.name);
  let idx = fields.findIndex(n => names.some(nn => n.toLowerCase() === nn.toLowerCase()));
  if (idx < 0) idx = fields.findIndex(n => names.some(nn => n.toLowerCase().includes(nn.toLowerCase())));
  if (idx < 0) return [];
  const vec = table.getChildAt(idx);
  return Array.from(vec).map(v => (v == null ? "" : String(v)));
}
function cleanAlleles(arr) {
  return [...new Set(arr.map(s => s.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
const allelesI  = cleanAlleles(extractColumnValues(hlaTable, ["Class I","class_i","classi"]));
const allelesII = cleanAlleles(extractColumnValues(hlaTable, ["Class II","class_ii","classii"]));
```

```js
/* ── Predictor picker (dropSelect) ───────────────────────────────── */
const predictorItems = [
  { id: "netmhcpan_el",     label: "Class I — netMHCpan 4.1 EL" },
  { id: "netmhcpan_ba",     label: "Class I — netMHCpan 4.1 BA" },
  { id: "netmhciipan_el",   label: "Class II — netMHCIIpan 4.3 EL" },
  { id: "netmhciipan_ba",   label: "Class II — netMHCIIpan 4.3 BA" }
];
const predictorDrop = dropSelect(predictorItems, { label: "Predictor" });

function getPredictor() {
  const id = predictorDrop?.value || predictorItems[0].id;
  const cls = id.includes("iipan") ? "II" : "I";   // ← assumption: “iipan” ⇒ Class II
  return { id, cls };
}
```


```js
/* ── Allele control factory (Class-aware lazy fetch) ─────────────── */
const INITIAL_LIMIT = 20;
const PAGE_LIMIT    = 50;

function createAlleleCtrl() {
  return comboSelectLazy({
    label        : "Alleles",
    placeholder  : "Type allele…",
    initialLimit : INITIAL_LIMIT,
    pageLimit    : PAGE_LIMIT,
    fetch        : async ({ q = "", offset = 0, limit = PAGE_LIMIT }) => {
      const { cls } = getPredictor();                // ← current class
      const base = cls === "II" ? allelesII : allelesI;

      let list = base;
      if (q && q.trim().length >= 2) {
        const needle = q.toLowerCase();
        list = base.filter(a => a.toLowerCase().includes(needle));
      }

      const start = Math.max(0, offset|0);
      const end   = Math.min(list.length, start + (limit|0 || PAGE_LIMIT));
      return list.slice(start, end);
    }
  });
}

/* Slot element that will hold the live allele control */
const alleleSlot = html`<div></div>`;
```

```js
/* ── FASTA upload only (no textarea, no peptide CSV) ─────────────── */
const uploadSeqBtn = uploadButton({ label:"Upload Sequence (.fasta)", accept: ".fasta" });

/* ── FASTA parsing + IEDB sanitization ───────────────────────────── */

const AA20 = new Set("ACDEFGHIKLMNPQRSTVWY".split(""));

/* Split into entries: [{header:">id ...", body:"raw"}] or raw-seq fallback */
function splitFastaOrRaw(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  if (!s.startsWith(">")) return [{ header: ">seq1", body: s }];

  const out = [];
  let header = null, buf = [];
  for (const line of s.split(/\r?\n/)) {
    if (line.startsWith(">")) {
      if (header !== null) out.push({ header, body: buf.join("") });
      header = line;
      buf = [];
    } else {
      buf.push(line.trim());
    }
  }
  if (header !== null) out.push({ header, body: buf.join("") });
  return out;
}

/* Keep first token, safe chars only; ensure uniqueness with suffixes */
function sanitizeId(rawHeader, index, taken) {
  let id = String(rawHeader || "").replace(/^>\s*/, "").trim();
  id = id.split(/\s+|\|/)[0] || `seq${index + 1}`;
  id = id.replace(/[^A-Za-z0-9_.-]/g, "_");
  if (id.length > 64) id = id.slice(0, 64);

  const base = id;
  let k = 1;
  while (taken.has(id)) id = `${base}_${++k}`;
  taken.add(id);
  return id;
}

/* Uppercase, strip whitespace, remove gaps and stop marks */
function normalizeAA(raw) {
  return String(raw || "")
    .replace(/[\s\r\n\t]/g, "")
    .replace(/[-*]/g, "")
    .toUpperCase();
}

/* Return set of non-AA20 characters (after gap removal) */
function invalidChars(seq) {
  const bad = new Set();
  for (const c of seq) if (!AA20.has(c)) bad.add(c);
  return [...bad];
}

/* Main: parse + sanitize + validate for IEDB; optional wrap at 60 if desired */
function parseFastaForIEDB(text, { wrap = false } = {}) {
  const entries = splitFastaOrRaw(text);
  const taken = new Set();
  const seqs = [];
  const issues = [];

  entries.forEach((e, i) => {
    const id = sanitizeId(e.header, i, taken);
    const seq = normalizeAA(e.body);

    if (!seq) {
      issues.push({ id, type: "empty_after_clean" });
      return;
    }
    const bad = invalidChars(seq);
    if (bad.length) {
      issues.push({ id, type: "invalid_chars", chars: bad.sort().join("") });
      return;
    }
    seqs.push({ id, sequence: seq });
  });

  const fastaText = seqs
    .map(({ id, sequence }) => {
      if (!wrap) return `>${id}\n${sequence}`;
      const lines = [];
      for (let i = 0; i < sequence.length; i += 60) lines.push(sequence.slice(i, i + 60));
      return `>${id}\n${lines.join("\n")}`;
    })
    .join("\n");

  return { seqs, fastaText, issues };
}

```

```js
// Robust upload wiring (wrapper 'input' + file 'change' + restore)
{
  const isFileLike = (f) => f && typeof f.text === "function";

  const processFile = async (file) => {
    if (!isFileLike(file)) {
      setMut(seqListMut, []);
      setMut(chosenSeqIdMut, null);
      setMut(fastaTextMut, "");
      return;
    }
    let txt = "";
    try { txt = await file.text(); } catch {}
    const { seqs, fastaText, issues } = parseFastaForIEDB(txt, { wrap: false });

    setMut(seqListMut, seqs);
    setMut(chosenSeqIdMut, seqs[0]?.id ?? null);
    setMut(fastaTextMut, fastaText);

    if (issues.length) console.warn("FASTA issues (skipped sequences):", issues);
  };

  // 1) Wrapper root emits 'input' (uploadButton.js does this)
  const onRootInput = async () => {
    const v = uploadSeqBtn?.value;
    const file = Array.isArray(v) ? v[0] : v;
    await processFile(file ?? null);
  };
  uploadSeqBtn.addEventListener("input", onRootInput);

  // 2) Hidden file input emits 'change' (native)
  const fileEl = uploadSeqBtn?.querySelector?.('input[type="file"]');
  const onFileChange = async () => {
    await processFile(fileEl?.files?.[0] ?? null);
  };
  fileEl?.addEventListener("change", onFileChange);

  // 3) Handle session-restore
  if (fileEl?.files?.length) onFileChange();

  invalidation.then(() => {
    uploadSeqBtn.removeEventListener("input", onRootInput);
    fileEl?.removeEventListener("change", onFileChange);
  });
}

```

```js
/* Mount / re-mount the allele control whenever the predictor changes */
{
  let ctrl = createAlleleCtrl();
  alleleSlot.replaceChildren(ctrl);

  // keep Mutable in sync with the control value
  const wireSelection = c => {
    const push = () => { chosenAllelesMut.value = Array.from(c?.value || []); };
    c.addEventListener("input", push);
    // seed initial
    push();
    return () => c.removeEventListener("input", push);
  };
  let unwire = wireSelection(ctrl);

  const onPredChange = () => {
    ctrl.destroy?.();
    ctrl = createAlleleCtrl();
    alleleSlot.replaceChildren(ctrl);
    unwire();
    unwire = wireSelection(ctrl);
  };

  predictorDrop.addEventListener("input", onPredChange);
  invalidation.then(() => {
    predictorDrop.removeEventListener("input", onPredChange);
    unwire();
  });
}

```

```js
/* ── Run button, status banner, and download button ─────────────── */

function makeButton(txt) {
  const b = document.createElement("button");
  b.textContent = txt;
  b.type = "button";
  b.style.cssText = "height:36px;padding:0 12px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer";
  return b;
}

const runBtn       = makeButton("Run prediction");
const downloadBtn  = makeButton("Download table (CSV)");
downloadBtn.disabled = true;

const statusBanner = document.createElement("div");
statusBanner.setAttribute("aria-live", "polite");
statusBanner.style.cssText = "min-height:24px;font-style:italic;color:#333";


// put this once, not as a child of statusBanner
const spinCss = document.createElement("style");
spinCss.textContent = `
.spin:before {
  content: ""; display:inline-block; width:12px; height:12px; margin-right:6px;
  border:2px solid #bbb; border-top-color:#333; border-radius:50%;
  animation: sp 0.8s linear infinite; vertical-align:-2px;
}
@keyframes sp { to { transform: rotate(360deg); } }
`;
document.head.appendChild(spinCss);


function setStatus(txt, {busy=false, warn=false, ok=false} = {}) {
  statusBanner.textContent = ""; // clear
  const span = document.createElement("span");
  span.textContent = txt;
  if (busy) span.classList.add("spin");
  statusBanner.style.color = warn ? "#B30000" : ok ? "#225C22" : "#333";
  statusBanner.appendChild(span);
}
```

```js

/* POST to our proxy */
async function submitPipeline(body) {
  const r = await fetch("/api/iedb-pipeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { _raw: txt }; }
  if (!r.ok) throw new Error(j?.errors?.join?.("; ") || r.statusText || "Pipeline submission failed");
  const rid = j?.result_id || j?.results_uri?.split?.("/")?.pop?.();
  if (!rid) throw new Error("No result_id in response");
  return rid;
}

/* Poll with backoff + live status */
async function pollResult(resultId, { timeoutMs=10*60_000, minDelay=900, maxDelay=5000, backoff=1.35 } = {}) {
  const t0 = Date.now();
  let delay = minDelay, tries = 0, lastSec = -1;

  while (Date.now() - t0 < timeoutMs) {
    tries++;
    const r = await fetch(`/api/iedb-result?id=${encodeURIComponent(resultId)}`);
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = {}; }

    const sec = Math.floor((Date.now() - t0)/1000);
    if (sec !== lastSec) {
      lastSec = sec;
      setStatus(`Polling IEDB… ${sec}s (try ${tries})`, {busy:true});
    }

    if (j?.status === "done") return j;
    if (j?.status === "error") {
      const errs = j?.data?.errors; 
      throw new Error(Array.isArray(errs) && errs.length ? errs.join("; ") : "IEDB returned error");
    }

    await new Promise(res => setTimeout(res, delay));
    delay = Math.min(Math.floor(delay * backoff), maxDelay);
  }
  throw new Error("Timed out polling IEDB");
}


```

```js
/* ── Run + Download (consolidated) ─────────────────────────────── */

/* Utilities */
function rowsFromTable(tbl) {
  const keys = (tbl.table_columns || []).map(c => c.display_name || c.name);
  return (tbl.table_data || []).map(r => Object.fromEntries(r.map((v,i)=>[keys[i], v])));
}

/* Build body with explicit FASTA */
function buildBody(fastaText) {
  const { id: method, cls } = getPredictor();
  const alleles = (chosenAllelesMut.value || []).join(",");
  return {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : cls === "II" ? "mhcii" : "mhci",
      input_sequence_text: fastaText,
      input_parameters: {
        alleles,
        peptide_length_range: [9,9],
        predictors: [{ type: "binding", method }]
      }
    }]
  };
}

/* Download wiring */
let latestRows = [];
let csvUrl = null;

function buildCSV(rows) {
  if (!rows || !rows.length) return "";
  const cols = Array.from(rows.reduce((set, r) => {
    Object.keys(r || {}).forEach(k => set.add(k));
    return set;
  }, new Set()));
  const esc = v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}

function updateDownload(rows) {
  latestRows = Array.isArray(rows) ? rows : [];
  if (csvUrl) { try { URL.revokeObjectURL(csvUrl); } catch {} }
  const csv = buildCSV(latestRows);
  if (latestRows.length && csv) {
    csvUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    downloadBtn.disabled = false;
  } else {
    csvUrl = null;
    downloadBtn.disabled = true;
  }
}

downloadBtn.onclick = () => {
  if (!latestRows.length || !csvUrl) {
    alert("No result table to download.");
    return;
  }
  const a = document.createElement("a");
  a.href = csvUrl;
  a.download = "iedb_peptide_table.csv";
  a.click();
};

// Clean up blob if cell invalidates
invalidation.then(() => { if (csvUrl) URL.revokeObjectURL(csvUrl); });

/* Run */
runBtn.addEventListener("click", async () => {
  try {
    // FASTA from cached state or live file
    const cached = (fastaTextMut?.value || "").trim();
    let fasta = cached;
    if (!fasta) {
      const v = uploadSeqBtn?.value;
      const file = Array.isArray(v) ? v[0] : v;
      if (file && typeof file.text === "function") {
        let txt = "";
        try { txt = await file.text(); } catch {}
        fasta = parseFastaForIEDB(txt, { wrap: false }).fastaText || "";
        if (fasta) fastaTextMut.value = fasta;
      }
    }
    if (!fasta) {
      setStatus("Please upload a FASTA file first.", { warn:true });
      return;
    }
    const alleles = chosenAllelesMut.value || [];
    if (!alleles.length) {
      setStatus("Please select at least one allele.", { warn:true });
      return;
    }

    runBtn.disabled = true;
    downloadBtn.disabled = true;
    updateDownload([]); // reset any previous CSV

    setStatus("Submitting to IEDB…", { busy:true });
    const body = buildBody(fasta);
    const rid  = await submitPipeline(body);

    setStatus(`Submitted (result_id: ${rid}).`, { busy:true });
    const result = await pollResult(rid);

    const tbl = (result?.data?.results || []).find(t => t.type === "peptide_table");
    if (!tbl) throw new Error("No peptide_table returned in results");

    const rows = rowsFromTable(tbl);
    predRowsMut.value = rows;     // keep state
    updateDownload(rows);         // enable and prepare CSV

    setStatus(`Done — ${rows.length} rows.`, { ok:true });
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err?.message || err}`, { warn:true });
  } finally {
    runBtn.disabled = false;
  }
});
```

```js
/* Safe setter for Mutables */
function setMut(mut, val) {
  if (mut && typeof mut === "object" && "value" in mut) {
    mut.value = val;
  } else {
    console.warn("Mutable not ready when setting:", { mut, val });
  }
}
```


```js
/* Helper: get latest FASTA from state or directly from the current file */
async function getLatestFastaText() {
  const cached = (fastaTextMut && fastaTextMut.value) ? String(fastaTextMut.value).trim() : "";
  if (cached) return cached;

  // Try to read from the current upload control
  const v = uploadSeqBtn?.value;
  const file = Array.isArray(v) ? v[0] : v;
  if (file && typeof file.text === "function") {
    let txt = "";
    try { txt = await file.text(); } catch {}
    const { fastaText } = parseFastaForIEDB(txt, { wrap: false });
    if (fastaText && fastaText.trim()) {
      setMut(fastaTextMut, fastaText);
      return fastaText;
    }
  }
  // Try the hidden input directly
  const fileEl = uploadSeqBtn?.querySelector?.('input[type="file"]');
  const f2 = fileEl?.files?.[0];
  if (f2 && typeof f2.text === "function") {
    let txt = "";
    try { txt = await f2.text(); } catch {}
    const { fastaText } = parseFastaForIEDB(txt, { wrap: false });
    if (fastaText && fastaText.trim()) {
      setMut(fastaTextMut, fastaText);
      return fastaText;
    }
  }
  return "";
}

/* Let buildBody accept the FASTA explicitly */
function buildBody(fastaText) {
  const { id: method, cls } = getPredictor();
  const alleles = (chosenAllelesMut.value || []).join(",");
  return {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : cls === "II" ? "mhcii" : "mhci",
      input_sequence_text: fastaText,
      input_parameters: {
        alleles,
        peptide_length_range: [9,9],
        predictors: [{ type: "binding", method }]
      }
    }]
  };
}

/* Run button */
runBtn.addEventListener("click", async () => {
  try {
    const fasta = await getLatestFastaText();
    if (!fasta) {
      setStatus("Please upload a FASTA file first.", {warn:true});
      return;
    }
    const alleles = chosenAllelesMut.value || [];
    if (!alleles.length) {
      setStatus("Please select at least one allele.", {warn:true});
      return;
    }

    runBtn.disabled = true;
    downloadBtn.disabled = true;

    setStatus("Submitting to IEDB…", {busy:true});
    const body = buildBody(fasta);
    const rid  = await submitPipeline(body);

    setStatus(`Submitted (result_id: ${rid}).`, {busy:true});
    const result = await pollResult(rid);

    const tbl = (result?.data?.results || []).find(t => t.type === "peptide_table");
    if (!tbl) throw new Error("No peptide_table returned in results");

    const rows = rowsFromTable(tbl);
    setMut(predRowsMut, rows);

    setStatus(`Done — ${rows.length} rows.`, {ok:true});
    downloadBtn.disabled = rows.length === 0;
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err?.message || err}`, {warn:true});
  } finally {
    runBtn.disabled = false;
  }
});

```


<!-- Layout defined here (no JS layout cell) -->
<!-- Layout (positions defined here; no JS layout cells) -->
<div class="section">
  <h2>Inputs</h2>
  <div style="display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:12px;align-items:end">
    ${uploadSeqBtn}
    ${predictorDrop}
    ${alleleSlot}
  </div>
</div>

<div class="section">
  <h2>Run</h2>
  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
    ${runBtn}
    ${statusBanner}
    ${downloadBtn}
  </div>
</div>
