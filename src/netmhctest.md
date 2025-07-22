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
const hlaCSV = await FileAttachment("data/HLAlistClassI.csv").csv();
const allHLA1 = hlaCSV.map(d => d["Class I"]?.trim()).filter(Boolean);
const allHLA2 = hlaCSV.map(d => d["Class II"]?.trim()).filter(Boolean);

/* Class I multi‑select */
const alleleCtrl1 = comboSelect(allHLA1, {
  label: "Class I alleles (MHCI)",
  multiple: true, placeholder: "Type class‑I allele…",
  fontFamily: "'Roboto', sans-serif"
});
const selectedI = Generators.input(alleleCtrl1);

/* Class II multi‑select */
const alleleCtrl2 = comboSelect(allHLA2, {
  label: "Class II alleles (MHCII)",
  multiple: true, placeholder: "Type class‑II allele…",
  fontFamily: "'Roboto', sans-serif"
});
const selectedII = Generators.input(alleleCtrl2);

```

```js
const committedI  = commit(alleleCtrl1);   // updates only on click
const committedII = commit(alleleCtrl2);   // updates only on click


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
/* place these BEFORE any Markdown references */
const lastRows     = Mutable([]);   // (you already have this)
const resultsArray = Mutable([]);   // <-- new: raw prediction rows
const excludedPeptides = Mutable([]);          // list of length‑invalid peptides
```

```js
function buildStages({allelesI, allelesII, fastaI, fastaII}) {
  const stages = [];
  let stageNo  = 1;

  if (allelesI.length) {
    stages.push({
      stage_number: stageNo++,
      stage_type  : "prediction",
      tool_group  : "mhci",
      input_sequence_text: fastaI,
      input_parameters: {
        alleles: allelesI.join(","),
        peptide_length_range: null,
        predictors: [
          {type:"binding", method:"netmhcpan_el"},
          {type:"binding", method:"netmhcpan_ba"}
        ]
      }
    });
  }

  if (allelesII.length) {
    stages.push({
      stage_number: stageNo++,
      stage_type  : "prediction",
      tool_group  : "mhcii",
      input_sequence_text: fastaII,
      input_parameters: {
        alleles: allelesII.join(","),
        peptide_length_range: null,
        predictors: [
          {type:"binding", method:"netmhciipan_el"},
          {type:"binding", method:"netmhciipan_ba"}
        ]
      }
    });
  }
  return stages;
}

async function submitPipeline(allelesI, allelesII, peptides) {
  if (!peptides.length) throw new Error("No peptides uploaded.");
  if (!allelesI.length && !allelesII.length)
    throw new Error("Select at least one class‑I or class‑II allele.");

  /* length filters */
  const pepI  = peptides.filter(p => p.length >= 8  && p.length <= 14);
  const pepII = peptides.filter(p => p.length >= 11 && p.length <= 30);
  excludedI.value  = peptides.filter(p => p.length < 8  || p.length > 14);
  excludedII.value = peptides.filter(p => p.length < 11 || p.length > 30);

  if (!pepI.length && !pepII.length)
    throw new Error("All peptides outside valid length ranges.");

  const body = {
    run_stage_range: [1, buildStages({
      allelesI, allelesII, fastaI:"", fastaII:""
    }).length],
    stages: buildStages({
      allelesI,
      allelesII,
      fastaI : pepI .map((p,i)=>`>pep${i+1}\n${p}`).join("\n"),
      fastaII: pepII.map((p,i)=>`>pep${i+1}\n${p}`).join("\n")
    })
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
  const allelesSnapI  = [...committedI];
  const allelesSnapII = [...committedII];
  const allPeps      = await parsePeptides(peptideFile);
 
  // length filter: NetMHCpan EL/BA accepts 8‑14 aa
  const IN_RANGE_MIN = 8;
  const IN_RANGE_MAX = 14;
  const peptidesSnap = allPeps.filter(p => p.length >= IN_RANGE_MIN && p.length <= IN_RANGE_MAX);
  excludedPeptides.value = allPeps.filter(p => p.length < IN_RANGE_MIN || p.length > IN_RANGE_MAX);

  /* guards */
  if (!allelesSnapI.length && !allelesSnapII.length) {
    setBanner("No allele selected.");
    resultsArray.value = [];
    html`<span></span>`;
  } else if (!peptidesSnap.length) {
    setBanner("All peptides were out of length range (8‑14).");
    resultsArray.value = [];
    html`<span></span>`;
  } else {
    /* submit → poll */
    setBanner("Submitting to IEDB…");
    const ticket = await submitPipeline(
      allelesSnapI, allelesSnapII, peptidesSnap);
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
${alleleCtrl1}
${alleleCtrl2}
${peptideinput}
${runButton}
`
```

---
### Results

```js
html`
${downloadCSV}
`
```

```js
display(excludedI.value)
display(excludedII.value)
```


```js
display(resultsArray)
```