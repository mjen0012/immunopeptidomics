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
function commit(element) {
  return Generators.observe((change) => {
    const update = () => change(element.value);
    update();  // initialize with the element’s current value
    runButton.addEventListener("input", update);     // tie to the button
    return () => runButton.removeEventListener("input", update);
  });
}

```

```js
const allelesCommitted = commit(alleleCtrl);   // updates only on click

```


```js
/* place these BEFORE any Markdown references */
const lastRows     = Mutable([]);   // (you already have this)
const resultsArray = Mutable([]);   // <-- new: raw prediction rows
```

```js
async function submitPipeline(alleles, peptides) {
  /* guards */
  if (!peptides.length) throw new Error("No peptides uploaded.");
  if (!alleles.length)  throw new Error("Select at least one allele.");

  /* FASTA */
  const fasta = peptides.map((p,i)=>`>pep${i+1}\n${p}`).join("\n");

  const body = {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : "mhci",
      input_sequence_text: fasta,
      input_parameters: {
        alleles: alleles.join(","),   // exact list, comma‑sep
        peptide_length_range: null,   // exact peptides
        predictors: [{type:"binding", method:"netmhcpan_el"}]
      }
    }]
  };

  const resp = await fetch("/api/iedb-pipeline", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body:   JSON.stringify(body)
  });
  const json = await resp.json();
  if (!resp.ok)  throw new Error(json.errors?.join("; ") || resp.statusText);
  if (!json.results_uri) throw new Error("IEDB did not return results_uri.");
  return json;                     // {results_uri, …}
}

```

```js
/*************************************************************************
 * Results runner – re‑runs ONLY when the button is clicked
 *************************************************************************/
applyTrigger;                               // sole reactive dependency

if (!applyTrigger) {                        // page load / no click yet
  setBanner("Idle — click Run to start.");
  // nothing visible from this cell yet
  html`<span></span>`;
} else {
  /* snapshots at click‑time */
  const allelesSnap  = [...allelesCommitted];
  const peptidesSnap = await parsePeptides(peptideFile);

  /* guards */
  if (!allelesSnap.length) {
    setBanner("No allele selected.");
    resultsArray.value = [];
    html`<span></span>`;
  } else if (!peptidesSnap.length) {
    setBanner("No peptides uploaded.");
    resultsArray.value = [];
    html`<span></span>`;
  } else {
    /* submit → poll */
    setBanner("Submitting to IEDB…");
    const ticket = await submitPipeline(allelesSnap, peptidesSnap);
    const id     = ticket.results_uri.split("/").pop();
    const sleep  = ms => new Promise(r => setTimeout(r, ms));

    let block;
    for (let i = 0; i < 90; ++i) {
      setBanner(`Polling ${i + 1}/90…`);
      const r = await fetch(`/api/iedb-result?id=${id}`);
      if (!r.ok) throw new Error(`Poll failed (${r.status})`);
      const j = await r.json();
      if (j.status === "done") {
        block = j.data?.results?.find(t => t.type === "peptide_table");
        break;
      }
      await sleep(1000);
    }
    if (!block) throw new Error("Timed out waiting for peptide table");

    /* store rows */
    const keys = block.table_columns.map(c => c.display_name || c.name);
    lastRows.value = block.table_data.map(r =>
      Object.fromEntries(r.map((v,i)=>[keys[i],v]))
    );
    resultsArray.value = lastRows.value;

    setBanner(`Loaded ${lastRows.value.length} predictions.`);
    html`<span></span>`            // cell returns a trivial node
  }
}

```

```js
const downloadCSV = (() => {
  const btn = Inputs.button("Download CSV");
  btn.onclick = () => {
    if (!lastRows.value.length) {
      alert("Run prediction first."); return;
    }
    const cols = Object.keys(lastRows.value[0]);
    const csv  = [
      cols.join(","),
      ...lastRows.value.map(r => cols.map(c => r[c]).join(","))
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



### Inputs

```js
html`
${statusBanner}
${alleleCtrl}
${peptideinput}
${runButton}
`
```

---
### Results

```js
html`
${resultsArray.value}
${downloadCSV}
`
```


```js
display(resultsArray)
```

```js

Inputs.table(resultsArray)

```