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
const runBtnI  = Inputs.button("Run Class I (EL + BA)");
const runBtnII = Inputs.button("Run Class II (EL + BA)");

const trigI  = Generators.input(runBtnI);
const trigII = Generators.input(runBtnII);

```

```js
/* commit helper parameterised by trigger */
function commitTo(btn, element) {
  return Generators.observe(change => {
    const update = () => change(element.value);
    update();
    btn.addEventListener("input", update);
    return () => btn.removeEventListener("input", update);
  });
}

```

```js
const committedI  = commitTo(runBtnI , alleleCtrl1);
const committedII = commitTo(runBtnII, alleleCtrl2);


```


```js
/* place these BEFORE any Markdown references */
const lastRows     = Mutable([]);   // (you already have this)

const resultsArrayI = Mutable([]);
const resultsArrayII = Mutable([]);

const excludedI = Mutable([]);   // pep length <8 or >14
const excludedII = Mutable([]);  // pep length <11 or >30

```

```js
function buildBodyI(alleles, fasta) {
  return {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : "mhci",
      input_sequence_text: fasta,
      input_parameters: {
        alleles: alleles.join(","),
        peptide_length_range: null,
        predictors: [
          {type:"binding", method:"netmhcpan_el"},
          {type:"binding", method:"netmhcpan_ba"}
        ]
      }
    }]
  };
}

function buildBodyII(alleles, fasta) {
  return {
    run_stage_range: [1,1],
    stages: [{
      stage_number: 1,
      stage_type  : "prediction",
      tool_group  : "mhcii",
      input_sequence_text: fasta,
      input_parameters: {
        alleles: alleles.join(","),
        peptide_length_range: null,
        predictors: [
          {type:"binding", method:"netmhciipan_el"},
          {type:"binding", method:"netmhciipan_ba"}
        ]
      }
    }]
  };
}
```

```js
async function submit(body) {
  const r = await fetch("/api/iedb-pipeline", {
    method:"POST", headers:{"content-type":"application/json"},
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.errors?.join("; ") || r.statusText);
  return j.results_uri.split("/").pop();   // return result_id
}

async function poll(resultId, timeout=90_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r  = await fetch(`/api/iedb-result?id=${resultId}`);
    const j  = await r.json();
    if (j.status === "done")
      return j.data?.results?.find(t => t.type === "peptide_table");
    await new Promise(res => setTimeout(res, 1000));
  }
  throw new Error("Timed out");
}

function rowsFromTable(tbl) {
  const keys = tbl.table_columns.map(c => c.display_name || c.name);
  return tbl.table_data.map(r =>
    Object.fromEntries(r.map((v,i)=>[keys[i],v]))
  );
}

```

```js
trigI;                                          // dependency

(async () => {
  setBanner("Class I: starting…");

  const alleles = [...committedI];
  const peptidesAll = await parsePeptides(peptideFile);
  const peptidesOK  = peptidesAll.filter(p => p.length>=8 && p.length<=14);
  excludedI.value   = peptidesAll.filter(p => p.length<8 || p.length>14);

  if (!alleles.length)      return setBanner("Class I: no alleles selected.");
  if (!peptidesOK.length)   return setBanner("Class I: no peptides in 8‑14 range.");

  const fasta = peptidesOK.map((p,i)=>`>p${i+1}\n${p}`).join("\n");
  const id    = await submit(buildBodyI(alleles, fasta));

  setBanner("Class I: polling…");
  const tbl   = await poll(id);
  resultsArrayI.value = rowsFromTable(tbl);
  setBanner(`Class I done — ${resultsArrayI.value.length} rows.`);
})();


```

```js
trigII;                                         // dependency

(async () => {
  setBanner("Class II: starting…");

  const alleles = [...committedII];
  const peptidesAll = await parsePeptides(peptideFile);
  const peptidesOK  = peptidesAll.filter(p => p.length>=11 && p.length<=30);
  excludedII.value  = peptidesAll.filter(p => p.length<11 || p.length>30);

  if (!alleles.length)     return setBanner("Class II: no alleles selected.");
  if (!peptidesOK.length)  return setBanner("Class II: no peptides in 11‑30 range.");

  const fasta = peptidesOK.map((p,i)=>`>p${i+1}\n${p}`).join("\n");
  const id    = await submit(buildBodyII(alleles, fasta));

  setBanner("Class II: polling…");
  const tbl   = await poll(id);
  resultsArrayII.value = rowsFromTable(tbl);
  setBanner(`Class II done — ${resultsArrayII.value.length} rows.`);
})();

```

```js
/* ------------------------------------------------------------------
   Utility to create a CSV‑download button for any Mutable rows array
-------------------------------------------------------------------*/
function makeDownloadButton(label, rowsMut, filename) {
  const btn = Inputs.button(label);
  btn.onclick = () => {
    const rows = rowsMut.value;
    if (!rows.length) {
      alert(`No ${label.toLowerCase()} available yet.`); return;
    }
    const cols = Object.keys(rows[0]);
    const csv  = [
      cols.join(","),                      // header
      ...rows.map(r => cols.map(c => r[c]).join(","))
    ].join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url, download: filename
    }).click();
    URL.revokeObjectURL(url);
  };
  return btn;
}

/* ------------------------------------------------------------------
   Two specific buttons
-------------------------------------------------------------------*/
const downloadCSVI  = makeDownloadButton("Download Class‑I CSV",
                                         resultsArrayI,  "mhcI_predictions.csv");

const downloadCSVII = makeDownloadButton("Download Class‑II CSV",
                                         resultsArrayII, "mhcII_predictions.csv");

```



### Inputs

```js
html`
${statusBanner}
${alleleCtrl1}
${alleleCtrl2}
${peptideinput}
${runBtnI}
${runBtnII}
`
```

---
### Results

```js
html`
${downloadCSVI}
${downloadCSVII}
`
```

```js
display(excludedI)
display(excludedII)
```


```js
display(resultsArrayI)
display(resultsArrayII)
```