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

```js
import {extendDB, sql, extended} from "./components/extenddb.js"
```

```js
/* Wrap Database */
const db = extendDB(
  await DuckDBClient.of({
    peptidescan: FileAttachment("data/peptide_table.parquet").parquet(),
  })
);
```



```js
/* 2.  Expand windows → min percentile table (cache in memory) --- */
const heatmapRaw = (await db.sql`
  WITH exploded AS (
    SELECT
      "seq #"                AS seq_id,
      "peptide length"       AS pep_len,
      allele,
      peptide,
      start,
      UNNEST(GENERATE_SERIES(start, "end")) AS pos,
      "netmhcpan_el percentile"             AS pct,
      SUBSTR(peptide, 1 + pos - start, 1)   AS aa       -- ← char at pos
    FROM peptidescan
  )
  SELECT
    seq_id,
    pep_len,
    allele,
    pos,

    /*   value      ,  key  */
    arg_min(pct    , pct)      AS pct,      --  =  MIN(pct)
    arg_min(peptide, pct)      AS peptide,  --  row whose pct is min
    arg_min(aa     , pct)      AS aa

  FROM exploded
  GROUP BY 1,2,3,4;
`).toArray();   // [{seq_id, pep_len, allele, pos, pct, peptide, aa}]


```



```js

import {heatmapChart}         from "./components/heatmapChart.js";

```


```js
/* 3.  Interactive selectors (sequence & alleles) ---------------- */

const allAlleles = [...new Set(heatmapRaw.map(d => d.allele))].sort();

/* 0 ▸ mapping table once, near the other constants ---------------- */
const seqNames = new Map([
  [ 1, "HA"     ],
  [ 2, "M1"     ],
  [ 3, "M2"     ],
  [ 4, "NA"     ],
  [ 5, "NP"     ],
  [ 6, "NS1"    ],
  [ 7, "NS2"    ],
  [ 8, "PA"     ],
  [ 9, "PAX"    ],
  [10, "PB1"    ],
  [11, "PB1‑F2" ],
  [12, "PB2"    ]
]);

/* 1 ▸ existing helper arrays ------------------------------------- */
const allSeqIDs  = [...new Set(heatmapRaw.map(d => d.seq_id))].sort(d3.ascending);

/* 2 ▸ selector with friendly labels ------------------------------ */
const chosenSeq = view(
  Inputs.select(allSeqIDs, {
    label : "Sequence",
    value : allSeqIDs[0],                // default
    format: id => seqNames.get(id)       // show “HA”, “M1”, …
  })
);


const chosenAlleles = view(Inputs.select(allAlleles, {
  label: "Alleles (multi‑select)",
  multiple: true,
  value: allAlleles
}));

const allLens = [...new Set(heatmapRaw.map(d => d.pep_len))].sort(d3.ascending);

const chosenLen = view(Inputs.select(allLens, {
  label: "Peptide length",
  value: allLens[0]            // default first length
}));

```


```js
const heatmapData = heatmapRaw
  .filter(d =>
       d.seq_id  === chosenSeq
    && d.pep_len === chosenLen
    && chosenAlleles.includes(d.allele)
  )
  .map(({allele, pos, pct, peptide, aa}) =>
       ({allele, pos, pct, peptide, aa}));



```


```js
const seqLen = seqLengths[chosenSeq] ?? d3.max(heatmapData, d => d.pos);

/* build “heatmapData” however you like … then: */
const heatEl = heatmapChart({
  data: heatmapData,
  posExtent : [1, seqLen]        // [{allele,pos,pct}, …]
});

```


```js


/* cache a lookup of true sequence lengths ‑—————————————— */
const seqLengths = Object.fromEntries(
  (await db.sql`
    SELECT "seq #", MAX("end") AS len   -- “end” is 1‑based inclusive
    FROM   peptidescan
    GROUP  BY "seq #"
  `).toArray().map(d => [+d["seq #"], +d.len])
);

```




<style>
.chart-card {
  width: 100%;                     /* full page width                */
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;              /* room for axes & legend         */
  box-shadow: 0 2px 4px rgba(0,0,0,.06);
  margin-bottom: 1rem;             /* keep breathing space below     */
}
</style>


<div class="chart-card">${heatEl}</div>