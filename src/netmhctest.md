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

```

```js
const raw = FileAttachment("data/Peptides A test.csv").csv();
```



```js
async function loadPeptides() {
  const rows = await FileAttachment("data/Peptides A test.csv").csv();
  return rows.map(d => d.peptide?.trim()).filter(Boolean);
}
```

```js
async function uniqueLengths() {
  const ps = await loadPeptides();
  return Array.from(new Set(ps.map(p => p.length))).sort();
}

```

```js
/* create the Inputs control (this object has .value) */
const alleleCtrl = Inputs.text({
  label: "MHC-I allele",
  value: "HLA-A*02:01"         // default
});
```

```js

/* show it in the page */
const alleleInput = view(alleleCtrl);   // DOM element (no .value)
```

```js
const runButton = view(
  Inputs.button("Run NetMHCpan (EL 4.1)")
);
```




```js
Inputs.table(raw)
```

```js
async function submitPipeline() {
  /* Wait until the user presses the button */
  if (!runButton) return null;

  /* Peptides ----------------------------------------------- */
  const peptides = await loadPeptides();
  if (!peptides.length) throw new Error("No peptides to submit.");

  const lengths = peptides.map(p => p.length);
  const range   = [Math.min(...lengths), Math.max(...lengths)];   // [min,max]
  const fasta   = peptides.map((p,i)=>`>pep${i+1}\n${p}`).join("\n");

  /* Allele string (defensive if value is briefly undefined) */
  const allele = (alleleCtrl.value + "").trim();   // ← use alleleCtrl
  if (!allele) throw new Error("Allele field is empty.");


  /* Build payload ----------------------------------------- */
  const body = {
    run_stage_range: [1, 1],
    stages: [{
      stage_number: 1,
      tool_group:   "mhci",
      input_sequence_text: fasta,
      input_parameters: {
        alleles: allele,                    // STRING, not array
        peptide_length_range: range,        // e.g. [8,11]
        predictors: [{type:"binding",method:"netmhcpan_el"}]
      }
    }]
  };

  /* POST to proxy ----------------------------------------- */
  const resp = await fetch("/api/iedb-pipeline", {
    method:  "POST",
    headers: {"content-type":"application/json"},
    body:    JSON.stringify(body)
  });

  const json = await resp.json();

  if (!resp.ok)
    throw new Error(json.errors?.join("; ") || resp.statusText);

  if (!json.results_uri)
    throw new Error(`IEDB did not return results_uri: ${JSON.stringify(json)}`);

  return json;                // { results_uri: "...", … }
}


```

```js
async function fetchTSV() {
  const ticket = await submitPipeline();
  if (!ticket) return "";

  const resultId = ticket.results_uri.split("/").pop();
  const sleep    = ms => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < 60; ++i) {
    const r = await fetch(`/api/iedb-result?id=${resultId}`);
    const j = await r.json();

    if (j.status === "COMPLETE") {
      const tsv = j.outputs?.tsv
               ?? j.outputs?.binding?.tsv
               ?? j.outputs?.mhci?.tsv;
      if (tsv) return tsv;
      throw new Error("Job complete but TSV missing.");
    }
    await sleep(1000);
  }
  throw new Error("Timed out waiting for results.");
}


```

```js
async function parseRows() {
  const tsv = await fetchTSV();
  if (!tsv) return [];
  const cleaned = tsv
    .split("\n")
    .filter(l => l && !l.startsWith("#"))
    .join("\n");
  const tsvFmt = dsvFormat("\t");
  return tsvFmt.parse(cleaned);
}

```

```js
async function buildTable() {
  const rows = await parseRows();
  return Inputs.table(rows, {rows: 25});
}

const resultsTable = view(buildTable());

```