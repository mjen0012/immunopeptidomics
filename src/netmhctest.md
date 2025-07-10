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
import {html} from "htl";

const statusBanner = html``;        // empty element
let   setBanner;                    // helper

{
  /* helper updates inner-HTML in place */
  setBanner = msg => statusBanner.innerHTML = `<em>${msg}</em>`;
}

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
async function fetchPeptideTable() {
  setStatus("Submitting to IEDB…");

  const ticket = await submitPipeline();
  if (!ticket) {
    setStatus("No ticket returned.");   // should never happen
    return [];
  }

  const resultId = ticket.results_uri.split("/").pop();
  const sleep    = ms => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < 60; ++i) {        // ≤ 60 s
    setStatus(`Polling ${i + 1}/60…`);
    const r = await fetch(`/api/iedb-result?id=${resultId}`);

    if (!r.ok) {
      const text = await r.text();
      console.error("Poll failed", r.status, text);
      setStatus(`Poll failed (${r.status}). Check console.`);
      throw new Error("Poll failed");
    }

    const j = await r.json();
    console.log("Poll cycle", i + 1, j.status);

    if (j.status === "done") {
      const resultsArray = j.data?.results;
      console.log("results array:", resultsArray);

      if (!Array.isArray(resultsArray)) {
        setStatus("Unexpected results format.");
        throw new Error("No results array");
      }

      const table = resultsArray.find(t => t.type === "peptide_table");
      if (!table) {
        setStatus("Peptide table missing.");
        throw new Error("No peptide_table");
      }

      setStatus("Peptide table received.");
      return {columns: table.table_columns, rows: table.table_data};
    }
    await sleep(1000);
  }

  setStatus("Timed out (60 s).");
  throw new Error("Timed out waiting for peptide table");
}



```

```js
async function parseRows() {
  const tbl = await fetchPeptideTable();
  if (!tbl.rows?.length) {
    console.warn("No rows in peptide table", tbl);
    setStatus("IEDB returned an empty table.");
    return [];
  }

  const keys = tbl.columns.map(c => c.display_name || c.name || c);
  const rows = tbl.rows.map(row =>
    Object.fromEntries(row.map((v, i) => [keys[i] ?? `col_${i}`, v]))
  );

  setStatus(`Loaded ${rows.length} rows.`);
  return rows;
}


```

```js
async function buildTable() {
  const rows = await parseRows();            // 318 rows in your test run
  if (!rows.length) return html`<p>No rows returned.</p>`;

  /* show a summary above the table */
  const summary = html`<strong>${rows.length}</strong> predictions received.`;

  /* the table itself */
  const table   = Inputs.table(rows, {rows: 25, height: 420});

  return html`${summary}${table}`;
}



```

```js
/* build the table when predictions are ready */
const resultsTable = await (async () => {
  setBanner("Fetching peptide table…");

  const rows = await parseRows();      // your existing helper

  if (!rows.length) {
    setBanner("IEDB returned an empty table.");
    return html`<p><em>No data.</em></p>`;
  }

  setBanner(`Loaded ${rows.length} predictions.`);
  return Inputs.table(rows, {rows: 25, height: 420});
})();
```


```js

/* one-off button element */
const downloadCSV = (() => {
  const btn = Inputs.button("Download CSV");

  btn.onclick = async () => {
    const rows = await parseRows();
    if (!rows.length) return alert("No data yet.");

    const header = Object.keys(rows[0]);
    const csv    = [
      header.join(","),
      ...rows.map(r => header.map(k => r[k]).join(","))
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