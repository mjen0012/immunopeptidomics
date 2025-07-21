---
theme: [wide, air]
title: Netmhc
slug: netmhc
toc: false
---

```js
import * as Inputs from "@observablehq/inputs";
import {Mutable} from "observablehq:stdlib";

import {csvParse}      from "https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm";
import {dsvFormat}     from "https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm";

import {comboSelect} from "./components/comboSelect.js";
import {uploadButton} from "./components/uploadButton.js";

```

```js
const statusBanner = html`<div style="margin:0.5rem 0; font-style:italic;"></div>`;
function setBanner(msg) { statusBanner.textContent = msg; }


```

```js
const allHLA = (await FileAttachment("data/HLAlistClassI.csv").csv())
  .map(d => d["Class I"].trim())
  .sort();

/* multi */
const alleleCtrl = comboSelect(allHLA, {
  label      : "MHC-I alleles",
  placeholder: "Type allele…",
  multiple   : true,
  fontFamily : "'Roboto', sans-serif"
});
const selectedAlleles = Generators.input(alleleCtrl);  // reactive array


```

```js
/* Peptide upload */
const peptideinput = uploadButton({
  label   : "Upload Peptides",
  accept  : ".csv",
  required: false
});
const peptideFile = Generators.input(peptideinput);     // <-- reactive File|null

```




```js
async function loadPeptides() {
  if (!peptideFile) return [];
  const txt  = await peptideFile.text();
  // simple CSV parse: assume "peptide" header present; lightweight regex split
  const [hdrLine, ...lines] = txt.trim().split(/\r?\n/);
  const hdrs = hdrLine.split(",").map(h => h.trim().toLowerCase());
  const idx  = hdrs.indexOf("peptide");
  if (idx < 0) return [];
  return lines
    .map(l => l.split(",")[idx]?.trim()?.toUpperCase())
    .filter(Boolean);
}


```

```js
const runButton = Inputs.button("Run NetMHCpan EL 4.1");
const applyTrigger = Generators.input(runButton);
```



```js
async function submitPipeline() {
  /* gather inputs */
  const peptides = await loadPeptides();
  if (!peptides.length) throw new Error("No peptides uploaded.");

  const alleles = selectedAlleles?.filter(Boolean) ?? [];
  if (!alleles.length) throw new Error("Select at least one allele.");

  /* FASTA block */
  const fasta = peptides.map((p,i)=>`>pep${i+1}\n${p}`).join("\n");

  /* payload: exact peptides => peptide_length_range:null */
  const body = {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : "mhci",
      input_sequence_text: fasta,
      input_parameters: {
        alleles: alleles.join(","),             // comma string
        peptide_length_range: null,             // exact peptides
        predictors: [{type:"binding", method:"netmhcpan_el"}]
      }
    }]
  };

  const resp = await fetch("/api/iedb-pipeline", {
    method : "POST",
    headers: {"content-type":"application/json"},
    body   : JSON.stringify(body)
  });
  const json = await resp.json();
  if (!resp.ok)
    throw new Error(json.errors?.join("; ") || resp.statusText);
  if (!json.results_uri)
    throw new Error("IEDB did not return results_uri.");
  return json; // {result_id, results_uri, ...}
}


```

```js
async function fetchPeptideTable() {
  setBanner("Submitting to IEDB…");
  const ticket = await submitPipeline();
  const id     = ticket.results_uri.split("/").pop();
  const sleep  = ms => new Promise(r => setTimeout(r, ms));

  for (let i=0; i<90; ++i) {
    setBanner(`Polling ${i+1}/90…`);
    const r = await fetch(`/api/iedb-result?id=${id}`);
    if (!r.ok) throw new Error(`Poll failed (${r.status})`);
    const j = await r.json();
    if (j.status === "done") {
      const block = j.data?.results?.find(t => t.type === "peptide_table");
      if (!block) throw new Error("peptide_table missing");
      setBanner("Peptide table received.");
      return block;
    }
    await sleep(1000);
  }
  throw new Error("Timed out waiting for peptide table.");
}

```

```js
const predictionRows = Mutable([]);   // .value holds the arra

```

```js
async function buildResultsRows() {
  try {
    const tbl  = await fetchPeptideTable();             // submit → poll
    const keys = tbl.table_columns.map(c => c.display_name || c.name);
    const rows = tbl.table_data.map(r =>
      Object.fromEntries(r.map((v,i)=>[keys[i],v]))
    );
    setBanner(`Loaded ${rows.length} predictions.`);
    predictionRows.value = rows;                      // store for others
    return rows;
  } catch (err) {
    console.error(err);
    setBanner(`Error: ${err.message}`);
    predictionRows.value = [];                       // reset on failure
    return [];
  }
}


```


```js
/* re‑runs on every click */
applyTrigger;

const rows = await buildResultsRows();
const resultsTable = rows.length
  ? Inputs.table(rows, {rows:25, height:420})
  : html`<p><em>No data.</em></p>`;
resultsTable

```

```js
const downloadCSV = (() => {
  const btn = Inputs.button("Download CSV");
  btn.onclick = () => {
    const rows = predictionRows.value;                 // current global rows
    if (!rows.length) {
      alert("Run prediction first."); return;
    }
    const cols = Object.keys(rows[0]);
    const csv  = [
      cols.join(","),
      ...rows.map(r => cols.map(c => r[c]).join(","))
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

${statusBanner}
${alleleCtrl}
${peptideinput}
${runButton}

---

### Results
${resultsTable}
${downloadCSV}
