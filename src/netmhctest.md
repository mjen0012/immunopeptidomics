---
theme: [wide, air]
title: Netmhc
slug: netmhc
toc: false
---

```js
import * as Inputs from "@observablehq/inputs";
import {csvParse}      from "https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm";
import {dsvFormat}     from "https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm";

import {comboSelect} from "./components/comboSelect.js";
import {uploadButton} from "./components/uploadButton.js";

```

```js
const statusBanner = html`<div style="margin:0.5rem 0; font-style:italic;"></div>`;
function setBanner(msg) {
  statusBanner.textContent = msg;
}

```

```js
/* Read HLAlistClassI.csv → ["HLA‑A*01:01", …] */
const allHLA = (await FileAttachment("data/HLAlistClassI.csv").csv())
  .map(d => d["Class I"].trim())
  .sort();

/* Multi‑select control */
const alleleCtrl = comboSelect(allHLA, {
  label      : "MHC‑I alleles",
  placeholder: "Type allele…",
  multiple   : true,
  fontFamily : "'Roboto', sans-serif"
});
const alleleInput = view(alleleCtrl);    // show on page

```

```js
const peptideUpload = view(uploadButton({
  label : "Upload peptide CSV",
  accept: ".csv",
  required: false
}));
const peptideFile = Generators.input(peptideUpload);

```

```js
Inputs.table(peptideUpload)
```

```js
async function loadPeptides() {
  if (!peptideFile) return [];
  const rows = csvParse(await peptideFile.text());
  return rows
    .map(d => d.peptide?.trim()?.toUpperCase())
    .filter(Boolean);
}

```

```js
const runButton = view(Inputs.button("Run NetMHCpan EL 4.1"));

```

```js
async function submitPipeline() {
  /* wait until user clicks — Framework re‑runs this cell on every click */
  runButton;                       // dependency line

  /* 📦 gather inputs */
  const peptides = await loadPeptides();
  if (!peptides.length) throw new Error("No peptides uploaded.");

  const alleles = (alleleCtrl.value ?? []).filter(Boolean);
  if (!alleles.length) throw new Error("Select at least one allele.");

  const fasta = peptides.map((p, i) => `>pep${i + 1}\n${p}`).join("\n");

  /* build payload — exact peptides → peptide_length_range:null */
  const body = {
    run_stage_range: [1, 1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : "mhci",
      input_sequence_text: fasta,
      input_parameters: {
        alleles: alleles.join(","),           // comma‑separated
        peptide_length_range: null,           // exact peptides (spec)
        predictors: [{ type:"binding", method:"netmhcpan_el" }]
      }
    }]
  };

  /* POST via Vercel proxy */
  const resp  = await fetch("/api/iedb-pipeline", {
    method : "POST",
    headers: { "content-type": "application/json" },
    body   : JSON.stringify(body)
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.errors?.join("; ") || resp.statusText);

  if (!json.results_uri)
    throw new Error("IEDB did not return results_uri");

  return json;   // { result_id, results_uri, … }
}

```

```js
async function fetchPeptideTable() {
  setBanner("Submitting to IEDB…");
  const ticket = await submitPipeline();

  const id    = ticket.results_uri.split("/").pop();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < 90; ++i) {           // up to 90 s
    setBanner(`Polling ${i + 1}/90…`);
    const r = await fetch(`/api/iedb-result?id=${id}`);

    if (!r.ok) throw new Error(`Poll failed (${r.status})`);

    const j = await r.json();
    if (j.status === "done") {
      const peptideBlock = j.data?.results?.find(t => t.type === "peptide_table");
      if (!peptideBlock) throw new Error("peptide_table missing");
      setBanner("Peptide table received.");
      return peptideBlock;
    }
    await sleep(1000);
  }
  throw new Error("Timed out (90 s)");
}

```

```js
async function buildTable() {
  const tbl = await fetchPeptideTable();
  const keys = tbl.table_columns.map(c => c.display_name || c.name);
  const rows = tbl.table_data.map(r =>
    Object.fromEntries(r.map((v, i) => [keys[i], v]))
  );

  setBanner(`Loaded ${rows.length} predictions.`);
  return Inputs.table(rows, { rows: 25, height: 420 });
}

const resultsTable = await buildTable();      // triggers on button click

```

```js
const downloadCSV = (() => {
  const btn = Inputs.button("Download CSV");

  btn.onclick = async () => {
    const tbl = await fetchPeptideTable();      // cached if already run
    if (!tbl) return alert("Run prediction first.");

    const keys = tbl.table_columns.map(c => c.display_name || c.name);
    const rows = tbl.table_data.map(r =>
      Object.fromEntries(r.map((v, i) => [keys[i], v]))
    );

    const csv  = [
      keys.join(","),
      ...rows.map(r => keys.map(k => r[k]).join(","))
    ].join("\n");

    const blob = new Blob([csv], {type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url, download: "iedb_predictions.csv"
    }).click();
    URL.revokeObjectURL(url);
  };
  return btn;
})();

```

```js
display(downloadCSV)

```