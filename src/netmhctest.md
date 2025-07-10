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
const alleleInput = view(
  Inputs.text({label: "MHC-I allele", value: "HLA-A*02:01"})
);

const runButton = view(
  Inputs.button("Run NetMHCpan (EL 4.1)")
);
```




```js
Inputs.table(raw)
```

```js
async function submitPipeline() {
  /* guard: wait for the user to click the Run button */
  if (!runButton) return null;

  /* load peptides and compute min/max length (IEDB requires [min,max]) */
  const peptides = await loadPeptides();
  if (!peptides.length) throw new Error("No peptides to submit.");

  const lengths   = peptides.map(p => p.length);
  const range     = [Math.min(...lengths), Math.max(...lengths)]; // e.g. [8,11]
  const fastaText = peptides.map((p, i) => `>pep${i + 1}\n${p}`).join("\n");

  /* build payload */
  const body = {
    run_stage_range: [1, 1],
    stages: [{
      stage_number: 1,
      tool_group:   "mhci",
      input_sequence_text: fastaText,
      input_parameters: {
        alleles: alleleInput.value.trim(),         // string, not array
        peptide_length_range: range,               // required [min,max]
        predictors: [{ type: "binding", method: "netmhcpan_el" }]
      }
    }]
  };

  /* send to proxy on same origin */
  const res  = await fetch("/api/iedb-pipeline", {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify(body)
  });

  const json = await res.json();

  if (!res.ok)
    throw new Error(json.errors?.join("; ") || res.statusText);

  if (!json.results_uri)
    throw new Error(`IEDB missing results_uri: ${JSON.stringify(json)}`);

  return json;            // downstream cells will poll this URI
}

```

```js
async function fetchTSV() {
  const resp = await submitPipeline();
  if (!resp) return "";

  const {results_uri} = resp;
  const sleep = ms => new Promise(f => setTimeout(f, ms));

  for (let t = 0; t < 30; ++t) {                     // 30 × 1 s
    const r = await fetch(results_uri);
    if (!r.ok) throw new Error(`Poll failed (${r.status})`);
    const j = await r.json();
    if (j.status === "COMPLETE" && j.outputs?.tsv)   // TSV ready
      return j.outputs.tsv;
    await sleep(1000);
  }
  throw new Error("Timed out waiting for prediction");
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