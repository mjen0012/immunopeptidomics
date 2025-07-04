---
theme: [wide, air]
title: Influenza A (IAV) New
slug: IAVnew
toc: false
sql:
    sequencecalc: data/IAV6_sequencecalc.parquet
---

```js
// BLOCK 2: DEFINE UI VIEWS
// This block depends on `genotypeOptions` and `countryOptions` from the cell above.
// The Framework will wait for Block 1 to fully resolve before running this block.
import {multiSelect} from "./components/multiSelect.js";

const datasets = [
  {id: "M1", label: "M1"}, {id: "M2", label: "M2"}, {id: "HA", label: "HA"},
  {id: "PAX", label: "PA-X"}, {id: "NA", label: "NA"}, {id: "PB1F2", label: "PB1F2"},
  {id: "NP", label: "NP"}, {id: "NS1", label: "NS1"}, {id: "NS2", label: "NS2"},
  {id: "PA", label: "PA"}, {id: "PB1", label: "PB1"}, {id: "PB2", label: "PB2"}
];

const tableName = view(
  Inputs.select(datasets, {
    label: "Choose dataset:", value: datasets[0], keyof: d => d.label, valueof: d => d.id
  })
);
```


<style>
  .multi-select-container { position: relative; max-width: 400px; margin-bottom: 1rem; }
  .multi-select-container .label { font-weight: bold; display: block; margin-bottom: 4px; font-size: 14px;}
  .multi-select-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .multi-select-pill { background-color: #e0e0e0; color: #333; padding: 4px 8px; border-radius: 12px; font-size: 14px; display: flex; align-items: center; }
  .multi-select-pill .remove-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 16px; margin-left: 6px; padding: 0; line-height: 1; }
  .multi-select-container .text-input { width: 100%; box-sizing: border-box; }
  .multi-select-suggestions { position: absolute; background: white; border: 1px solid #ccc; border-top: none; width: 100%; max-height: 200px; overflow-y: auto; z-index: 1000; box-sizing: border-box;}
  .suggestion-item { padding: 8px 12px; cursor: pointer; }
  .suggestion-item:hover { background-color: #f0f0f0; }
  .suggestion-item.disabled { color: #999; cursor: not-allowed; }
</style>


```js
import {extendDB, sql, extended} from "./components/extenddb.js"
import {DuckDBClient} from "npm:@observablehq/duckdb";

```

```js
/* ----------   wrap the client  ---------- */
const db = extendDB(
  await DuckDBClient.of({
    proteins: FileAttachment("data/IAV6-all.parquet").parquet()
  })
);
```

```js
// should log true
db[extended]
```

```js
const rowsn = db.sql`SELECT COUNT(*) AS n_rows FROM proteins`

```

```js
Inputs.table(rowsn)
```



```js
// hard-coded sample — replace with your own later
const testGenotypes = [];

```

```js
const row2 = db.sql`
SELECT *
FROM   proteins
WHERE  ${
  selectedGenotypes.length
    ? sql`genotype IN (${ selectedGenotypes })`
    : sql`TRUE`
}
LIMIT  10
`

```

```js

Inputs.table(row2)
```

```js
/* pull distinct genotypes once */
const allGenotypes = (await db.sql`
  SELECT DISTINCT genotype
  FROM proteins
  WHERE genotype IS NOT NULL
`).toArray()
  .map(d => d.genotype)
  .sort();
```

```js
/* UI: checkbox list */
const selectedGenotypes = view(Inputs.checkbox(allGenotypes, {
  label: "Genotype filter",
  value: []            // ← start with none checked
}));

```