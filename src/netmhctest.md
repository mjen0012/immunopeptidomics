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
import {extendDB, sql, extended} from "./components/extenddb.js"
import {comboSelect} from "./components/comboSelect.js";
import {uploadButton} from "./components/uploadButton.js";
```



## NetMHCpan 4.1 





```js

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