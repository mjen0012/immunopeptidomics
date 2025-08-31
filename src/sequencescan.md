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
import { heatmapChart } from "./components/heatmapChart.js";
import { rangeSlider } from "./components/rangeSlider.js";
import { peptideScanChart } from "./components/peptideScanChart.js";
```

```js
/* ── State ───────────────────────────────────────────────────────── */
const seqListMut       = Mutable([]);    // [{id, sequence}]
const uploadSeqFileMut = Mutable(null);  // File | null
const chosenSeqIdMut   = Mutable(null);  // string | null
const fastaTextMut     = Mutable("");
const chosenAllelesMut = Mutable([]);    // kept in sync with allele control
const predRowsMut      = Mutable([]);    // raw peptide_table rows as objects
const chosenSeqIndexMut = Mutable(null);
/* NEW: stable runtime cache for rows using Observable Mutable */
const latestRowsMut    = Mutable([]);
/* Selected allele from heatmap (row toggle) */
const selectedAlleleMut = Mutable(null);

/* tiny hook for console debugging */
window.__heatLatestRows = () => latestRowsMut.value;

```

```js
// Additional chart slot: allele-specific peptide scan (below heatmap)
const peptideScanSlot = html`<div style="margin:8px 0"></div>`;
```

```js
// Render all peptides for the selected allele at current length/sequence
import * as d3 from "npm:d3@7";

function rowsForAlleleAndLen(seqIdx, length, allele) {
  const src = (latestRowsMut.value && latestRowsMut.value.length)
    ? latestRowsMut.value
    : (Array.isArray(predRowsMut.value) ? predRowsMut.value : []);
  const out = [];
  for (const r of src) {
    const seqNum = Number(r["seq #"] ?? r["sequence_number"] ?? 1);
    if (seqNum !== Number(seqIdx)) continue;
    if (rowLen(r) !== Number(length)) continue;
    if (String(r?.allele || "") !== String(allele || "")) continue;
    out.push(r);
  }
  return out;
}

function renderPeptideAlleleTrack(seqIdx, length, allele) {
  peptideScanSlot.replaceChildren();

  if (!allele) {
    const em = document.createElement("em");
    em.textContent = "Click an allele row in the heatmap to view its peptides.";
    peptideScanSlot.appendChild(em);
    __zoomSync.pepAllele = null;
    return;
  }

  const rows = rowsForAlleleAndLen(seqIdx, length, allele);
  if (!rows.length) {
    const em = document.createElement("em");
    em.textContent = `No peptides for allele ${allele} (len ${length}).`;
    peptideScanSlot.appendChild(em);
    __zoomSync.pepAllele = null;
    return;
  }

  const posExtent = getAxisExtentForSeq(seqIdx);
  const bars = rows.map(r => ({ start: +r.start, length: rowLen(r), peptide: String(r.peptide || "") }));

  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  peptideScanSlot.appendChild(wrapper);

  const svg = d3.create("svg")
    .style("width", "100%")
    .style("touch-action", "none")
    .attr("font-family", "sans-serif")
    .attr("font-size", 11);
  wrapper.appendChild(svg.node());

  const margin = { top: 18, right: 12, bottom: 24, left: 110 };
  let inst = null;
  let suppress = false;

  function build(wPx) {
    const w = Math.max(1, wPx | 0);
    const xBase = d3.scaleLinear([posExtent[0] - 0.5, posExtent[1] + 0.5], [margin.left, w - margin.right]);

    // clear & (re)build
    d3.select(svg.node()).selectAll("*").remove();
    const g = d3.select(svg.node()).append("g");

    inst = peptideScanChart(g, {
      data: bars,
      alleleData: rows,
      xScale: xBase,
      rowHeight: 18,
      gap: 2,
      sizeFactor: 1.1,
      margin,
      onZoom: (zx, t) => {
        if (suppress) return;
        __zoomSync.transform = t;
        const hm = __zoomSync.heatmapEl;
        const pept = __zoomSync.peptideEl;
        if (hm && typeof hm.__setZoom === "function") hm.__setZoom(t);
        if (pept && typeof pept.__setZoom === "function") pept.__setZoom(t);
      }
    });

    const h = inst?.height || (18 + 18 + 24);
    svg.attr("viewBox", `0 0 ${w} ${h}`);

    // expose setter for sync
    __zoomSync.pepAllele = {
      __setZoom: (t) => {
        if (!inst?.setZoom || !t) return;
        suppress = true;
        try { inst.setZoom(t); } finally { suppress = false; }
      }
    };

    // if a transform already exists, apply it
    if (__zoomSync.transform && inst?.setZoom) {
      suppress = true; try { inst.setZoom(__zoomSync.transform); } finally { suppress = false; }
    }
  }

  new ResizeObserver(e => build(e[0].contentRect.width)).observe(wrapper);
}
```js
// Shared x-zoom synchronization between heatmap and peptide track
let __zoomSync = {
  transform: null,
  heatmapEl: null,
  peptideEl: null,
  pepAllele: null
};
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

const lengthCtrl = rangeSlider({ label: "Peptide length" });

// keep slider in sync when predictor changes Class I/II
const applyClassToSlider = () => {
  const { cls } = getPredictor();
  lengthCtrl.setForClass(cls);  // I → 8–14 (9),  II → 11–30 (15)
};
applyClassToSlider();
predictorDrop.addEventListener("input", applyClassToSlider);
invalidation.then(() => predictorDrop.removeEventListener("input", applyClassToSlider));


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
/* ── FASTA textarea (single source of truth) ────────────────────── */

function fastaTextarea({ label = "FASTA", rows = 12, placeholder = "Paste or type FASTA here…" } = {}) {
  const root = document.createElement("div");
  root.style.fontFamily = "'Roboto', sans-serif";

  const lab = document.createElement("label");
  lab.textContent = label;
  lab.style.cssText = "display:block;margin:12px 0 6px;font:500 13px/1.3 'Roboto',sans-serif;color:#111;";

  const ta = document.createElement("textarea");
  ta.rows = rows;
  ta.placeholder = placeholder;
  ta.spellcheck = false;
  ta.autocapitalize = "off";
  ta.autocorrect = "off";
  ta.wrap = "off";
  ta.style.cssText = `
    display:block; width:100%; box-sizing:border-box; resize:vertical;
    padding:10px 12px; border:1px solid #bbb; border-radius:6px; background:#fff;
    font:500 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    min-height:0;
  `;

  root.append(lab, ta);

  let programmatic = false;
  Object.defineProperty(root, "value", {
    get(){ return ta.value; },
    set(v){ ta.value = String(v ?? ""); }
  });
  root.setText = (txt) => { programmatic = true; ta.value = String(txt ?? ""); programmatic = false; };
  root.__isProg = () => programmatic;
  root.textarea = ta;

  return root;
}

const fastaBox = fastaTextarea({
  label: "FASTA",
  rows: 12,
  placeholder: "Paste or type FASTA here… (we’ll sanitize for IEDB under the hood)"
});

/* Debounced parsing from textarea */
const DEBOUNCE_MS = 400;
let fastaDebounceTimer = null;

async function parseAndApplyFASTA(rawText) {
  const { seqs, fastaText, issues } = parseFastaForIEDB(rawText, { wrap: false });

  // Update app state (textarea shows RAW; we store SANITIZED fastaText)
  setMut(seqListMut, seqs);
  setMut(chosenSeqIdMut, seqs[0]?.id ?? null);
  setMut(fastaTextMut, fastaText);

  // Refill + enable the Sequence dropdown (fires its onChange handler)
  refreshSeqOptions(seqSelectCtrl);
  {
    const aligned = alignAllPeptides(seqListMut.value || [], peptideListMut.value || []);
    alignedPepsMut.value = aligned;
    latestAlignedPepsMut.value = aligned;
    renderPeptideTrack(selectedSeqIndex());
    updatePeptideDownloadForSeq(selectedSeqIndex());
  }
  if (issues?.length) console.warn("FASTA issues (skipped sequences):", issues);
}

const onFastaInput = () => {
  if (fastaBox.__isProg()) return; // ignore programmatic changes
  clearTimeout(fastaDebounceTimer);
  fastaDebounceTimer = setTimeout(() => {
    parseAndApplyFASTA(fastaBox.value);
  }, DEBOUNCE_MS);
};
fastaBox.textarea.addEventListener("input", onFastaInput);
invalidation.then(() => fastaBox.textarea.removeEventListener("input", onFastaInput));


```

```js
// Robust upload wiring (wrapper 'input' + file 'change' + restore)
{
  const isFileLike = (f) => f && typeof f.text === "function";

  const processFile = async (file) => {
    if (!isFileLike(file)) {
      // Clear state
      fastaBox.setText("");
      setMut(seqListMut, []);
      setMut(chosenSeqIdMut, null);
      setMut(fastaTextMut, "");
      // Disable/clear sequence selector
      if (seqSelectCtrl?.setOptions) seqSelectCtrl.setOptions([], { prefer: 1 });
      return;
    }

    let txt = "";
    try { txt = await file.text(); } catch {}
    // 1) show RAW in the textarea (no event)
    fastaBox.setText(txt);
    // 2) parse and apply once (don’t wait for debounce)
    await parseAndApplyFASTA(txt);
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
function selectedSeqIndex() {
  const v = Number((chosenSeqIndexMut && chosenSeqIndexMut.value) ?? 1);
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

function setSelectedSeqIndex(n) {
  const v = Math.max(1, Number(n) || 1);
  setMut(chosenSeqIndexMut, v);   // ← ensure .value exists
  return v;
}


```

```js
function lengthsFromRowsForSeq(rows, seqIdx = selectedSeqIndex()) {
  const set = new Set();
  for (const r of rows || []) {
    const seqNum = Number(r["seq #"] ?? r["sequence_number"] ?? 1);
    if (seqNum !== seqIdx) continue;
    const L = rowLen(r);
    if (Number.isFinite(L)) set.add(L);
  }
  return [...set].sort((a,b)=>a-b);
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
/* ── Run + Download (consolidated, safe) — no cross-refs back to Heatmap ── */

/* ── Table → rows (hardened) ────────────────────────────────────── */
function rowsFromTable(tbl) {
  try {
    if (!tbl || !Array.isArray(tbl.table_data) || !Array.isArray(tbl.table_columns)) {
      console.warn("rowsFromTable: table missing columns/data, returning []", tbl);
      return [];
    }
    const keys = tbl.table_columns.map(c => c?.display_name ?? c?.name ?? "");
    // Accept both array-of-arrays and array-of-objects
    const out = tbl.table_data.map(row => {
      if (Array.isArray(row)) {
        return Object.fromEntries(row.map((v, i) => [keys[i] || `col_${i}`, v]));
      }
      if (row && typeof row === "object") {
        // Already an object: keep as-is
        return row;
      }
      // Fallback: wrap scalar
      return { value: row };
    });
    return out;
  } catch (e) {
    console.error("rowsFromTable error:", e);
    return [];
  }
}


/* FASTA getter – use cached text if present, otherwise read from current file */
async function getLatestFastaText() {
  const cached = (fastaTextMut && typeof fastaTextMut === "object" && "value" in fastaTextMut)
    ? String(fastaTextMut.value || "").trim()
    : "";
  if (cached) return cached;

  const tryRead = async (file) => {
    if (!file || typeof file.text !== "function") return "";
    let t = ""; try { t = await file.text(); } catch {}
    const { fastaText } = parseFastaForIEDB(t, { wrap:false });
    return (fastaText || "").trim();
  };

  const v = uploadSeqBtn?.value;
  const file1 = Array.isArray(v) ? v[0] : v;
  let fasta = await tryRead(file1);
  if (!fasta) {
    const fileEl = uploadSeqBtn?.querySelector?.('input[type="file"]');
    fasta = await tryRead(fileEl?.files?.[0]);
  }
  if (fasta) setMut(fastaTextMut, fasta);
  return fasta;
}

/* Body builder */
function buildBody(fastaText) {
  const { id: method, cls } = getPredictor();
  const alleles = (chosenAllelesMut.value || []).join(",");

  // slider always yields [min,max]; single mode has min===max
  const [lenMin, lenMax] = Array.isArray(lengthCtrl?.value) && lengthCtrl.value.length === 2
    ? lengthCtrl.value
    : (cls === "II" ? [15,15] : [9,9]);  // fallback

  return {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : (cls === "II" ? "mhcii" : "mhci"),
      input_sequence_text: fastaText,
      input_parameters: {
        alleles,
        peptide_length_range: [lenMin, lenMax],
        predictors: [{ type: "binding", method }]
      }
    }]
  };
}

/* CSV prep */
let csvUrl = null;
function buildCSV(rows) {
  if (!rows || !rows.length) return "";
  const cols = Array.from(rows.reduce((set, r) => {
    Object.keys(r||{}).forEach(k => set.add(k)); return set;
  }, new Set()));
  const esc = v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}
function updateDownload(rows) {
  if (csvUrl) { try { URL.revokeObjectURL(csvUrl); } catch {} csvUrl = null; }
  const csv = buildCSV(rows);
  if (rows && rows.length && csv) {
    csvUrl = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    downloadBtn.disabled = false;
  } else {
    downloadBtn.disabled = true;
  }
}
downloadBtn.onclick = () => {
  if (!csvUrl) { alert("No result table to download."); return; }
  const a = document.createElement("a");
  a.href = csvUrl;
  a.download = "iedb_peptide_table.csv";
  a.click();
};
invalidation.then(() => { if (csvUrl) URL.revokeObjectURL(csvUrl); });

/* Immediate raw JSON downloader (for debugging) */
function downloadRawJSON(obj, filename = "iedb_result_raw.json") {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ── Single run handler (defensive) ─────────────────────────────── */
runBtn.addEventListener("click", async () => {
  try {
    const fasta = await getLatestFastaText();
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
    updateDownload([]); // reset previous CSV

    setStatus("Submitting to IEDB…", { busy:true });
    const body = buildBody(fasta);
    console.groupCollapsed("🚀 submitPipeline body"); console.log(body); console.groupEnd();

    const rid = await submitPipeline(body);
    setStatus(`Submitted (result_id: ${rid}).`, { busy:true });
    const result = await pollResult(rid);

    // Keep JSON download (for your records), but do it after we parse to avoid racey UI errors
    // (we'll still call it—just after we confirm the table exists)
    const resultsArr = Array.isArray(result?.data?.results) ? result.data.results : [];
    console.groupCollapsed("📦 IEDB result shape");
    console.log("has results array:", Array.isArray(result?.data?.results), "length:", resultsArr.length);
    console.log("result keys:", Object.keys(result?.data || {}));
    console.groupEnd();

    const tbl = resultsArr.find(t => t?.type === "peptide_table");
    if (!tbl) {
      console.error("No peptide_table in results:", resultsArr);
      throw new Error("No peptide_table returned in results");
    }

    const rowsParsed = rowsFromTable(tbl);
    const rows = Array.isArray(rowsParsed) ? rowsParsed : [];
    const rowsLen = rows.length|0;

    // Now it’s safe to dump the raw JSON without interfering with flow
    try { downloadRawJSON(result); } catch {}

    console.groupCollapsed("🧩 parsed table snapshot");
    console.log("rows length:", rowsLen);
    if (rowsLen) console.log("sample row:", rows[0]);
    console.log("lengths(seq#1):", lengthsFromRows(rows));
    console.groupEnd();

    // with direct, guaranteed assignments:
    predRowsMut.value   = rows;
    latestRowsMut.value = rows;

    updateDownload(rows);
    setStatus(`Done — ${rowsLen} rows.`, { ok:true });
    downloadBtn.disabled = rowsLen === 0;

    // Update selector (this calls setOptions → onChange, which will re-render)
    refreshHeatLenChoices();

    // Ensure we render even if setOptions didn’t fire (e.g., identical value)
    const safeLen = Number(heatLenCtrl.value);
    if (rowsLen) {
      renderHeatmap(rows, safeLen);
      const seqNow = selectedSeqIndex();
      try { renderPeptideTrack(seqNow); updatePeptideDownloadForSeq(seqNow); } catch {}
      try { renderPeptideAlleleTrack(seqNow, safeLen, selectedAlleleMut?.value); } catch {}
    }

  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err?.message || err}`, { warn:true });
  } finally {
    runBtn.disabled = false;
  }
});

```

```js
/* Safe setter for Mutables (permissive) */
function setMut(mut, val) {
  if (!mut || (typeof mut !== "object" && typeof mut !== "function")) {
    console.warn("Mutable not ready when setting (not object):", { mut, val });
    return;
  }
  try {
    // Create or overwrite .value unconditionally
    mut.value = val;
  } catch (e) {
    // Fallback in very strict proxies
    try {
      Object.defineProperty(mut, "value", { value: val, writable: true, configurable: true });
    } catch (e2) {
      console.error("Failed to set Mutable.value", e2, { mut, val });
    }
  }
}

```

```js
/* ── Heatmap length selector (adaptive to slider + data) ─────────── */
const heatLenSlot = html`<div></div>`;
const LOG_LEN = "🟦 heatmap";

function makeHeatLenSelect({ onChange } = {}) {
  const root = document.createElement("div");
  root.style.fontFamily = "'Roboto', sans-serif";

  const label = document.createElement("label");
  label.textContent = "Heatmap length";
  label.style.cssText = "display:block;margin:0 0 8px 0;font:500 13px/1.3 'Roboto',sans-serif;color:#111;";

  const sel = document.createElement("select");
  sel.style.cssText = `
    display:block; width:100%; min-width:160px;
    padding:8px 10px; border:1px solid #bbb; border-radius:6px; background:#fff;
    font:500 14px/1.2 'Roboto',sans-serif; color:#006DAE; cursor:pointer;
  `;

  root.append(label, sel);

  Object.defineProperty(root, "value", {
    get(){ return sel.value ? Number(sel.value) : undefined; },
    set(v){ sel.value = String(v); }
  });

  // Only updates options; does NOT auto-fire any events anymore.
  root.setOptions = (lengths = [], { prefer } = {}) => {
    const before = Array.from(sel.querySelectorAll("option")).map(o => +o.value);
    const old = String(sel.value);

    sel.replaceChildren();
    for (const n of lengths) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = String(n);
      sel.appendChild(opt);
    }
    if (prefer != null && lengths.includes(prefer)) sel.value = String(prefer);
    else if (lengths.length) sel.value = lengths.includes(+old) ? old : String(lengths[0]);

    const after = lengths.slice();
    console.groupCollapsed(`${LOG_LEN} setOptions`);
    console.log("options before → after", before, "→", after);
    console.log("prefer:", prefer, "old:", +old, "new:", root.value);
    console.groupEnd();
  };

  const handle = () => {
    const len = Number(root.value);
    const rowsNow = latestRowsMut.value || [];
    console.log(`${LOG_LEN} selector change →`, len, `(cached rows: ${rowsNow.length})`);
    if (typeof onChange === "function") onChange(len);
  };
  sel.addEventListener("input", handle); // 🔸 only one event

  return root;
}

// from slider → continuous [a..b]
function sliderLengths() {
  const v = Array.isArray(lengthCtrl?.value) ? lengthCtrl.value : [9, 9];
  const a = Math.min(...v), b = Math.max(...v);
  const out = [];
  for (let n = a; n <= b; n++) out.push(n);
  return out;
}
function intersectSorted(a, b) { const B = new Set(b); return a.filter(x => B.has(x)); }

const heatLenCtrl = makeHeatLenSelect({
  onChange: (len) => {
    const rowsNow = (latestRowsMut.value && latestRowsMut.value.length) ? latestRowsMut.value
                  : (Array.isArray(predRowsMut.value) ? predRowsMut.value : []);
    if (!rowsNow.length) return console.warn("🟦 heatmap no rows available on select");

    const seqNow = selectedSeqIndex();
    console.log("🟦 heatmap re-render on select", { len, rows: rowsNow.length, seq: seqNow },
                "mutable=", chosenSeqIndexMut?.value);
    renderHeatmap(rowsNow, Number(len), seqNow);

    // keep peptide track/download in sync
    try { renderPeptideTrack(seqNow); updatePeptideDownloadForSeq(seqNow); } catch {}
    try { renderPeptideAlleleTrack(seqNow, Number(len), selectedAlleleMut?.value); } catch {}
  }
});


heatLenSlot.replaceChildren(heatLenCtrl);

function refreshHeatLenChoices(seqOverride) {
  const fromSlider = sliderLengths();
  const rowsForLens = (latestRowsMut.value && latestRowsMut.value.length)
    ? latestRowsMut.value
    : (Array.isArray(predRowsMut.value) ? predRowsMut.value : []);

  const seqIdx = Number.isFinite(seqOverride) ? seqOverride : selectedSeqIndex();

  const fromData = lengthsFromRowsForSeq(rowsForLens, seqIdx);
  const lens     = fromData.length ? intersectSorted(fromSlider, fromData) : fromSlider;
  const prefer   = heatLenCtrl.value ?? lens[0];

  console.groupCollapsed("🟦 heatmap refreshHeatLenChoices");
  console.log("seq #:", seqIdx, "mutable=", chosenSeqIndexMut?.value);
  console.log("slider range:", fromSlider);
  console.log("lengths in data(seq#):", fromData);
  console.log("intersect:", lens, "prefer:", prefer);
  console.groupEnd();

  heatLenCtrl.setOptions(lens, { prefer });
}

refreshHeatLenChoices();

const onSliderInput = () => {
  console.log(`${LOG_LEN} slider input →`, lengthCtrl.value);
  refreshHeatLenChoices();
};
lengthCtrl.addEventListener("input", onSliderInput);
invalidation.then(() => lengthCtrl.removeEventListener("input", onSliderInput));

```

```js
/* ── Helpers (single source of truth; no exports) ───────────────── */

const PCT_FIELDS = {
  netmhcpan_el   : "netmhcpan_el percentile",
  netmhcpan_ba   : "netmhcpan_ba percentile",
  netmhciipan_el : "netmhciipan_el percentile",
  netmhciipan_ba : "netmhciipan_ba percentile"
};

function pickPercentileKey(method, sampleRow) {
  const want = PCT_FIELDS[method];
  if (!sampleRow) return want;
  const keys = Object.keys(sampleRow);
  if (want && keys.includes(want)) return want;
  const m = method.toLowerCase();
  const cand = keys.find(k => k.toLowerCase().includes("percentile") && k.toLowerCase().includes(m));
  return cand || keys.find(k => /percentile/i.test(k)) || want;
}

function rowLen(r) {
  return Number(r?.["peptide length"] ?? r?.length ?? r?.["peptide_length"] ?? r?.["Length"]);
}

function lengthsFromRows(rows) {
  const set = new Set();
  for (const r of rows || []) {
    const seqNum = Number(r["seq #"] ?? r["sequence_number"] ?? 1);
    if (seqNum !== 1) continue;
    const L = rowLen(r);
    if (Number.isFinite(L)) set.add(L);
  }
  return [...set].sort((a,b)=>a-b);
}

```


```js
/* ── Heatmap prep + render (no SQL) ─────────────────────────────── */

const heatmapSlot = html`<div style="margin-top:12px"></div>`;

// Debug panel (scoped to this cell)
function makeHeatDebugBox() {
  const det = document.createElement("details");
  det.open = false;
  const sum = document.createElement("summary");
  sum.textContent = "Debug";
  const pre = document.createElement("pre");
  pre.style.margin = "8px 0 0 0";
  pre.style.maxHeight = "260px";
  pre.style.overflow = "auto";
  det.append(sum, pre);
  det.__setText = (obj) => { pre.textContent = JSON.stringify(obj, null, 2); };
  return det;
}
const heatDebug = makeHeatDebugBox();
function updateHeatDebug(payload) { try { heatDebug.__setText(payload); } catch {} }

function buildHeatmapData(rows, method, lengthFilter, seqIdx) {
  const wantedLen = Number(lengthFilter);
  const wantSeq   = Number(seqIdx);
  const r1 = rows.filter(r => {
    const seqNum = Number(r["seq #"] ?? r["sequence_number"] ?? 1);
    return seqNum === wantSeq && rowLen(r) === wantedLen;
  });

  console.groupCollapsed("🧮 buildHeatmapData");
  console.log("wantedLen:", wantedLen, "seq #:", wantSeq);
  console.log(`rows(seq#${wantSeq}, len=${wantedLen}):`, r1.length);
  if (r1.length) {
    console.log("sample rows:", r1.slice(0, 3).map(r => ({
      seq: r["seq #"] ?? r["sequence_number"],
      peptide: r.peptide, start: +r.start, end: +r.end,
      len: rowLen(r)
    })));
  }
  console.groupEnd();

  if (!r1.length) return { cells: [], posExtent: [1, 1], alleles: [] };

  const pctKey = pickPercentileKey(method, r1[0]);
  if (!pctKey) return { cells: [], posExtent: [1, 1], alleles: [] };

  const byAllelePos = new Map();   // key: `${allele}|${pos}`
  let posMax = 1;
  const alleleSet = new Set();

  for (const row of r1) {
    const allele  = row["allele"];
    const peptide = row["peptide"];
    const start   = +row["start"];
    const end     = +row["end"];
    const pct     = Number(row[pctKey]);
    if (!allele || !peptide || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(pct)) continue;
    if (end > posMax) posMax = end;
    alleleSet.add(allele);

    for (let pos = start; pos <= end; pos++) {
      const k = `${allele}|${pos}`;
      const aaIdx = pos - start;
      const aa    = peptide.charAt(aaIdx) || "";
      const prev  = byAllelePos.get(k);
      if (!prev || pct < prev.pct) byAllelePos.set(k, { allele, pos, pct, peptide, aa });
    }
  }

  const cells = Array.from(byAllelePos.values())
    .sort((a,b) => a.allele.localeCompare(b.allele) || a.pos - b.pos);

  return { cells, posExtent: [1, posMax], alleles: [...alleleSet].sort() };
}

let HM_RENDER_COUNT = 0;

function renderHeatmap(rows, lengthFilter, seqIdx = selectedSeqIndex()) {
  try {
    const rowsArr = Array.isArray(rows) ? rows : [];
    if (!rowsArr.length) {
      heatmapSlot.replaceChildren(Object.assign(document.createElement("em"), {textContent:"No heat-map data — empty rows."}));
      return;
    }

    const { id: method } = getPredictor();

    // before choosing first row when length is missing, prefer the passed seqIdx
    let wantedLen = Number(lengthFilter);
    if (!Number.isFinite(wantedLen)) {
      const wantSeq = Number.isFinite(seqIdx) ? seqIdx : selectedSeqIndex(); // ✅ prefer param
      const first = rowsArr.find(r => Number(r["seq #"] ?? r["sequence_number"] ?? 1) === wantSeq);
      wantedLen = rowLen(first);
    }

    const tStart = performance.now();
    console.log("🟦 render → method:", method, "len:", wantedLen, "seq #:", seqIdx);
    const { cells, posExtent, alleles } =
      buildHeatmapData(rowsArr, method, wantedLen, seqIdx);

    HM_RENDER_COUNT++;
    heatmapSlot.dataset.renderCount  = String(HM_RENDER_COUNT);
    heatmapSlot.dataset.lastLen      = String(wantedLen);
    heatmapSlot.dataset.lastMethod   = String(method);
    heatmapSlot.dataset.cellCount    = String(cells?.length ?? 0);
    heatmapSlot.dataset.alleleCount  = String(alleles?.length ?? 0);
    heatmapSlot.dataset.posMin       = String(posExtent?.[0] ?? "");
    heatmapSlot.dataset.posMax       = String(posExtent?.[1] ?? "");

    console.groupCollapsed(`🎨 render #${HM_RENDER_COUNT}`);
    console.log("method:", method, "length:", wantedLen, "seq #:", seqIdx); 
    console.log("cells:", Array.isArray(cells) ? cells.length : "(not array)");
    console.log("alleles:", Array.isArray(alleles) ? alleles.length : "(not array)", "posExtent:", posExtent);
    console.groupEnd();

    updateHeatDebug({
      render_count : HM_RENDER_COUNT,
      method       : method,
      selected_len : wantedLen,
      cell_count   : Array.isArray(cells) ? cells.length : 0,
      allele_count : Array.isArray(alleles) ? alleles.length : 0,
      pos_extent   : posExtent,
      lengths_in_data: lengthsFromRowsForSeq(rowsArr, selectedSeqIndex())
    });

    heatmapSlot.replaceChildren();
    if (!Array.isArray(cells) || !cells.length) {
      const span = document.createElement("span");
      span.textContent = "No heat-map data for selected length.";
      span.style.fontStyle = "italic";
      heatmapSlot.appendChild(span);
      return;
    }

    const el = heatmapChart({
      data: cells,
      posExtent,
      cellHeight: 18,
      sizeFactor: 1.1,
      onReady: (xBase) => {
        // scale available if needed later
      },
      onZoom: (zx, t) => {
        __zoomSync.transform = t;
        const p = __zoomSync.peptideEl;
        const a = __zoomSync.pepAllele;
        if (p && typeof p.__setZoom === "function") p.__setZoom(t);
        if (a && typeof a.__setZoom === "function") a.__setZoom(t);
      },
      onRowToggle: (allele) => {
        // store selection and render allele track for current length
        selectedAlleleMut.value = allele || null;
        const wantSeq = Number.isFinite(seqIdx) ? seqIdx : selectedSeqIndex();
        const wantLen = Number(heatLenCtrl?.value ?? el?.dataset?.len);
        try { renderPeptideAlleleTrack(wantSeq, wantLen, selectedAlleleMut.value); } catch {}
      }
    });

    el.dataset.len    = String(wantedLen);
    el.dataset.method = String(method);
    el.dataset.cells  = String(cells.length);
    el.dataset.alleles= String(alleles.length);

    heatmapSlot.appendChild(el);
    __zoomSync.heatmapEl = el;
    if (__zoomSync.transform && typeof el.__setZoom === "function") {
      el.__setZoom(__zoomSync.transform);
    }

    const ms = Math.round(performance.now() - tStart);
    console.log("🟦 heatmap render done in", ms, "ms");
  } catch (err) {
    console.error("Heatmap render error:", err);
    const span = document.createElement("span");
    span.textContent = `Heatmap error: ${err?.message || err}`;
    span.style.color = "#B30000";
    heatmapSlot.replaceChildren(span);
  }
}

```

<!-- Layout defined here (no JS layout cell) -->
<!-- Layout (positions defined here; no JS layout cells) -->
<div class="section">
  <h2>Inputs</h2>
  <div style="display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:12px;align-items:end">
    ${uploadSeqBtn}
    ${predictorDrop}
    ${alleleSlot}
    ${lengthCtrl}
    ${fastaBox}
    ${uploadPepsBtn}
    ${peptideBox}
  </div>
</div>

<div class="section">
  <h2>Run</h2>
  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
    ${runBtn}
    ${statusBanner}
    ${downloadBtn}
    ${dlPepsBtn}
  </div>
</div>

<div class="section">
  <h2>Heatmap</h2>
  ${seqSelSlot}
  ${heatLenSlot}
  ${peptideSlot}
  ${heatmapSlot}
  ${peptideScanSlot}
  ${heatDebug}
</div>


```js
/* ─── DEBUG HOOKS ───────────────────────────────────────────────── */

const DEBUG = true;
let __heatRenderCount = 0;

function dlog(...args) { if (DEBUG) console.log(...args); }

function countsByLenSeq1(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const seqNum = Number(r["seq #"] ?? r["sequence_number"] ?? 1);
    if (seqNum !== 1) continue;
    const L = rowLen(r);
    if (!Number.isFinite(L)) continue;
    map.set(L, (map.get(L) || 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort((a,b)=>a[0]-b[0]));
}

function lengthsFromRows_SEQ1(rows) {
  return Object.keys(countsByLenSeq1(rows)).map(Number);
}

function debugHeatContext(tag, len) {
  try {
    const rows   = predRowsMut.value || [];
    const method = getPredictor().id;
    const want   = Number(len);
    const lensSeq1 = lengthsFromRows_SEQ1(rows);
    const r1 = rows.filter(r => Number(r["seq #"] ?? r["sequence_number"] ?? 1) === 1 &&
                                rowLen(r) === want);
    const pctKey = r1.length ? pickPercentileKey(method, r1[0]) : "(none)";

    console.group(`[${tag}] wantLen=${want}, method=${method}`);
    console.log("seq#1 available lengths:", lensSeq1);
    console.log("rows(total):", rows.length, "rows(seq#1,len=", want, "):", r1.length);
    console.log("percentile key chosen:", pctKey);
    if (r1.length) {
      const samp = r1.slice(0, Math.min(3, r1.length))
                     .map(r => ({
                       allele: r.allele,
                       start : +r.start,
                       end   : +r.end,
                       len   : rowLen(r),
                       el    : r["netmhcpan_el percentile"],
                       ba    : r["netmhcpan_ba percentile"],
                       med   : r["median binding percentile"]
                     }));
      console.table(samp);
    }
    console.groupEnd();
  } catch (e) {
    console.warn("debugHeatContext error:", e);
  }
}

```

```js
/* ── Sequence selector ── */
const seqSelSlot = html`<div></div>`;
const LOG_SEQ = "🟦 seq";

function makeSeqSelect({ onChange } = {}) {
  const root = document.createElement("div");
  root.style.fontFamily = "'Roboto', sans-serif";

  const label = document.createElement("label");
  label.textContent = "Sequence";
  label.style.cssText = "display:block;margin:0 0 8px 0;font:500 13px/1.3 'Roboto',sans-serif;color:#111;";

  const sel = document.createElement("select");
  sel.disabled = true;
  sel.style.cssText = `
    display:block; width:100%; min-width:200px;
    padding:8px 10px; border:1px solid #bbb; border-radius:6px; background:#fff;
    font:500 14px/1.2 'Roboto',sans-serif; color:#006DAE; cursor:pointer;
  `;

  root.append(label, sel);

  Object.defineProperty(root, "value", {
    get(){ return sel.value ? Number(sel.value) : undefined; },
    set(v){ sel.value = String(v); }
  });

  root.setOptions = (items = [], { prefer } = {}) => {
    const before = Array.from(sel.options).map(o => o.textContent);
    sel.replaceChildren();

    for (const { index, id } of items) {
      const opt = document.createElement("option");
      opt.value = String(index);
      opt.textContent = `${index} - ${id}`;
      sel.appendChild(opt);
    }

    const values = items.map(i => i.index);
    if (values.length) {
      sel.disabled = false;
      const want = (Number.isFinite(prefer) && values.includes(prefer)) ? prefer : values[0];
      root.value = want;
      setMut(chosenSeqIndexMut, want); // write first (robust)
      if (typeof onChange === "function") onChange(want); // then notify
    } else {
      sel.disabled = true;
      root.value = undefined;
      setSelectedSeqIndex(1);
    }

    const after = Array.from(sel.options).map(o => o.textContent);
    console.groupCollapsed(`${LOG_SEQ} setOptions`);
    console.log("before → after", before, "→", after);
    console.log("prefer:", prefer, "selected:", root.value);
    console.groupEnd();
  };

  const handle = () => {
    const idx = Number(root.value);
    setSelectedSeqIndex(Number.isFinite(idx) ? idx : 1);
    console.log("🟦 seq change →", idx);
    if (typeof onChange === "function") onChange(idx);
  };
  sel.addEventListener("input", handle); // 🔸 only one event

  return root;
}

const seqSelectCtrl = makeSeqSelect({
  onChange: (idx) => {
    const seq = setSelectedSeqIndex(Number.isFinite(idx) ? idx : selectedSeqIndex());
    refreshHeatLenChoices(seq); // options only (no render)

    const rows = latestRowsMut.value?.length ? latestRowsMut.value
               : Array.isArray(predRowsMut.value) ? predRowsMut.value : [];
    if (rows.length) {
      const len = Number(heatLenCtrl.value);
      console.log("🟦 seq change → re-render", { seq, len });
      renderHeatmap(rows, Number.isFinite(len) ? len : undefined, seq);
    }

    // also refresh peptide track/download
    try { renderPeptideTrack(seq); updatePeptideDownloadForSeq(seq); } catch {}
    try { renderPeptideAlleleTrack(seq, Number(heatLenCtrl?.value), selectedAlleleMut?.value); } catch {}
  }
});


seqSelSlot.replaceChildren(seqSelectCtrl);
setSelectedSeqIndex(selectedSeqIndex());
refreshSeqOptions(seqSelectCtrl);


```

```js
window.__heat = {
  seq:    () => (typeof selectedSeqIndex === "function" ? selectedSeqIndex() : "(missing getter)"),
  chosen: () => (chosenSeqIndexMut && typeof chosenSeqIndexMut === "object" && "value" in chosenSeqIndexMut
                  ? chosenSeqIndexMut.value
                  : "(no mutable)"),
  len:        () => (heatLenCtrl?.value),
  lastRender: () => ({ ...heatmapSlot.dataset })
};



```

```js
window.__heatRefs = {
  get seqCtl() { return seqSelectCtrl?.querySelector?.("select"); },
  get seqVal() { return Number(seqSelectCtrl?.value); },
  get lenVal() { return Number(heatLenCtrl?.value); },
  get chosen() { return (chosenSeqIndexMut && "value" in chosenSeqIndexMut) ? chosenSeqIndexMut.value : null; },
  refreshHeatLenChoices,
  renderHeatmap
};

```

```js
// Safe (re)fill from FASTA list; no global reads of seqSelectCtrl
function refreshSeqOptions(ctrl) {
  const seqsVal =
    (seqListMut && typeof seqListMut === "object" && "value" in seqListMut)
      ? seqListMut.value
      : [];

  const seqs  = Array.isArray(seqsVal) ? seqsVal : [];
  const items = seqs.map((s, i) => ({ index: i + 1, id: s?.id ?? `seq${i + 1}` }));

  const preferRaw =
    (chosenSeqIndexMut && typeof chosenSeqIndexMut === "object" && "value" in chosenSeqIndexMut)
      ? chosenSeqIndexMut.value
      : null;

  const prefer = Number(preferRaw);
  if (ctrl && typeof ctrl.setOptions === "function") {
    ctrl.setOptions(items, {
      prefer: Number.isFinite(prefer) ? prefer : (items[0]?.index ?? 1)
    });
  }
}

```

```js
import { peptideChartScan } from "./components/peptideChartScan.js";

```

```js
const peptideTextMut        = Mutable("");     // raw textarea text (optional)
const peptideListMut        = Mutable([]);     // ["PEPTIDE", ...] (sanitized AA20)
const alignedPepsMut        = Mutable([]);     // all alignments across all seqs
const latestAlignedPepsMut  = Mutable([]);     // stable cache for render

```

```js
function getSeqByIndex(idx) {
  const arr = Array.isArray(seqListMut.value) ? seqListMut.value : [];
  return arr[idx - 1] || null;
}
function getSeqLength(idx) {
  const s = getSeqByIndex(idx);
  return s ? (s.sequence || "").length : 1;
}
function getAxisExtentForSeq(idx) {
  const seqLen = getSeqLength(idx);
  const hmMax  = Number(heatmapSlot?.dataset?.posMax || 0) || 0;
  const maxPos = Math.max(seqLen, hmMax, 1);
  return [1, maxPos];
}

```

```js

function sanitizePeptide(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/[\s\r\n\t-]/g, "");
}
function isAA20Only(s) {
  if (!s) return false;
  for (const c of s) if (!AA20.has(c)) return false;
  return true;
}

/* Accepts:
   - plain list: one peptide per line
   - CSV: with header "peptide" (ignored) or no header (first column)
*/
function parsePeptideInput(text) {
  const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  // CSV detection: commas or semicolons
  const looksCSV = /[,;]/.test(lines[0]);
  const out = [];

  if (looksCSV) {
    const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
    const first = lines[0].split(sep).map(s => s.trim());
    const hasHeader = first.some(h => /^peptide$/i.test(h));
    let pepIdx = 0;

    if (hasHeader) {
      pepIdx = first.findIndex(h => /^peptide$/i.test(h));
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep);
        const raw  = cols[pepIdx] ?? "";
        const pep  = sanitizePeptide(raw);
        if (pep && isAA20Only(pep)) out.push(pep);
      }
    } else {
      // Assume first column holds peptides
      for (const ln of lines) {
        const raw = ln.split(sep)[0] ?? "";
        const pep = sanitizePeptide(raw);
        if (pep && isAA20Only(pep)) out.push(pep);
      }
    }
    return out;
  }

  // Plain list (ignore a single 'peptide' header if present)
  const startAt = /^peptide$/i.test(lines[0]) ? 1 : 0;
  for (let i = startAt; i < lines.length; i++) {
    const pep = sanitizePeptide(lines[i]);
    if (pep && isAA20Only(pep)) out.push(pep);
  }
  return out;
}

```

```js
/* Return [{ seq_index, seq_id, peptide, start, length }] for all matches (1-based). */
function alignAllPeptides(seqs = seqListMut.value || [], peps = peptideListMut.value || []) {
  const out = [];
  const arr = Array.isArray(seqs) ? seqs : [];
  const peptides = Array.isArray(peps) ? peps : [];
  for (let i = 0; i < arr.length; i++) {
    const seq_index = i + 1;
    const seq_id = arr[i]?.id ?? `seq${seq_index}`;
    const seq = String(arr[i]?.sequence || "");
    if (!seq) continue;
    for (const p of peptides) {
      if (!p) continue;
      let from = 0;
      while (true) {
        const pos0 = seq.indexOf(p, from);
        if (pos0 === -1) break;
        out.push({ seq_index, seq_id, peptide: p, start: pos0 + 1, length: p.length });
        from = pos0 + 1; // allow overlaps
      }
    }
  }
  return out;
}

```

```js
function simpleTextarea({ label, rows = 12, placeholder = "" } = {}) {
  const root = document.createElement("div");
  root.style.fontFamily = "'Roboto', sans-serif";

  const lab = document.createElement("label");
  lab.textContent = label;
  lab.style.cssText = "display:block;margin:12px 0 6px;font:500 13px/1.3 'Roboto',sans-serif;color:#111;";

  const ta = document.createElement("textarea");
  ta.rows = rows;
  ta.placeholder = placeholder;
  ta.spellcheck = false;
  ta.autocapitalize = "off";
  ta.autocorrect = "off";
  ta.wrap = "off";
  ta.style.cssText = `
    display:block; width:100%; box-sizing:border-box; resize:vertical;
    padding:10px 12px; border:1px solid #bbb; border-radius:6px; background:#fff;
    font:500 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    min-height:0;
  `;

  root.append(lab, ta);

  let programmatic = false;
  Object.defineProperty(root, "value", {
    get(){ return ta.value; },
    set(v){ ta.value = String(v ?? ""); }
  });
  root.setText = (txt) => { programmatic = true; ta.value = String(txt ?? ""); programmatic = false; };
  root.__isProg = () => programmatic;
  root.textarea = ta;

  return root;
}

const uploadPepsBtn = uploadButton({ label:"Upload Peptides (.txt/.csv)", accept: ".txt,.csv" });
const peptideBox = simpleTextarea({
  label: "Peptides",
  rows: 12,
  placeholder: "Paste peptides (one per line) or CSV with a 'peptide' column…"
});

const DEBOUNCE_PEP_MS = 350;
let pepDebounceTimer = null;

async function parseAndApplyPeptides(rawText) {
  const list = parsePeptideInput(rawText).slice(0, 100); // cap ~100 as requested
  setMut(peptideTextMut, rawText);
  setMut(peptideListMut, list);

  // Re-align against all sequences
  const aligned = alignAllPeptides(seqListMut.value || [], list);
  alignedPepsMut.value = aligned;
  latestAlignedPepsMut.value = aligned;

  // Refresh track & download for current selection
  renderPeptideTrack(selectedSeqIndex());
  updatePeptideDownloadForSeq(selectedSeqIndex());
}

const onPeptideInput = () => {
  if (peptideBox.__isProg()) return;
  clearTimeout(pepDebounceTimer);
  pepDebounceTimer = setTimeout(() => {
    parseAndApplyPeptides(peptideBox.value);
  }, DEBOUNCE_PEP_MS);
};
peptideBox.textarea.addEventListener("input", onPeptideInput);
invalidation.then(() => peptideBox.textarea.removeEventListener("input", onPeptideInput));

/* Upload wiring (mirror sequences) */
{
  const isFileLike = (f) => f && typeof f.text === "function";
  const processFile = async (file) => {
    if (!isFileLike(file)) {
      peptideBox.setText("");
      setMut(peptideListMut, []);
      setMut(peptideTextMut, "");
      alignedPepsMut.value = [];
      latestAlignedPepsMut.value = [];
      renderPeptideTrack(selectedSeqIndex());
      updatePeptideDownloadForSeq(selectedSeqIndex());
      return;
    }
    let txt = ""; try { txt = await file.text(); } catch {}
    peptideBox.setText(txt);
    await parseAndApplyPeptides(txt);
  };

  const onRootInput = async () => {
    const v = uploadPepsBtn?.value;
    const file = Array.isArray(v) ? v[0] : v;
    await processFile(file ?? null);
  };
  uploadPepsBtn.addEventListener("input", onRootInput);

  const fileEl = uploadPepsBtn?.querySelector?.('input[type="file"]');
  const onFileChange = async () => { await processFile(fileEl?.files?.[0] ?? null); };
  fileEl?.addEventListener("change", onFileChange);

  if (fileEl?.files?.length) onFileChange();

  invalidation.then(() => {
    uploadPepsBtn.removeEventListener("input", onRootInput);
    fileEl?.removeEventListener("change", onFileChange);
  });
}

```

```js
const peptideSlot = html`<div style="margin:8px 0"></div>`;
const dlPepsBtn   = makeButton("Download peptides (CSV)");
dlPepsBtn.disabled = true;

/* Filter aligned rows for a given seq index */
function alignedForSeq(idx) {
  const all = Array.isArray(latestAlignedPepsMut.value) && latestAlignedPepsMut.value.length
              ? latestAlignedPepsMut.value
              : Array.isArray(alignedPepsMut.value) ? alignedPepsMut.value : [];
  return all.filter(r => r.seq_index === idx);
}

/* Render track for current sequence; keep axis extent in sync with heatmap. */
function renderPeptideTrack(seqIdx = selectedSeqIndex()) {
  const rows = alignedForSeq(seqIdx).map(r => ({
    start  : r.start,
    length : r.length,
    peptide: r.peptide
  }));
  const posExtent = getAxisExtentForSeq(seqIdx);

  peptideSlot.replaceChildren();
  if (!rows.length) {
    const em = document.createElement("em");
    em.textContent = "No aligned peptides for the selected sequence.";
    peptideSlot.appendChild(em);
    return;
  }
  const el = peptideChartScan({
    data: rows,
    posExtent,
    rowHeight: 18,
    sizeFactor: 1.1,
    onReady: (xBase) => {
      // no-op
    },
    onZoom: (zx, t) => {
      __zoomSync.transform = t;
      const hm = __zoomSync.heatmapEl;
      const a  = __zoomSync.pepAllele;
      if (hm && typeof hm.__setZoom === "function") hm.__setZoom(t);
      if (a && typeof a.__setZoom === "function") a.__setZoom(t);
    }
  });
  peptideSlot.appendChild(el);
  __zoomSync.peptideEl = el;
  if (__zoomSync.transform && typeof el.__setZoom === "function") {
    el.__setZoom(__zoomSync.transform);
  }
}

/* CSV download */
let pepCsvUrl = null;
function buildPeptideCSV(rows) {
  if (!rows || !rows.length) return "";
  const cols = ["sequence_index","sequence_id","peptide","start","length"];
  const esc = v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}
function updatePeptideDownloadForSeq(seqIdx) {
  if (pepCsvUrl) { try { URL.revokeObjectURL(pepCsvUrl); } catch {} pepCsvUrl = null; }
  const rows = alignedForSeq(seqIdx);
  if (!rows.length) { dlPepsBtn.disabled = true; return; }
  const csv = buildPeptideCSV(rows);
  pepCsvUrl = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
  dlPepsBtn.disabled = false;
}
dlPepsBtn.onclick = () => {
  if (!pepCsvUrl) { alert("No aligned peptides to download."); return; }
  const a = document.createElement("a");
  a.href = pepCsvUrl;
  a.download = "aligned_peptides.csv";
  a.click();
};
invalidation.then(() => { if (pepCsvUrl) URL.revokeObjectURL(pepCsvUrl); });

```
