---
theme: [wide, air]
title: Influenza A (IAV) New
slug: IAVnew
toc: false
sql:
    proteins: data/IAV_all.parquet
    sequencecalc: data/IAV_sequencecalc.parquet
---

```js
// 1. Import the custom component.
import {multiSelect} from "./components/multiSelect.js";

// 2. Define the data for the filters by awaiting the SQL query results.
// This ensures `distinctGenotypes` and `distinctCountries` are JavaScript arrays.
const distinctGenotypes = await sql`SELECT DISTINCT genotype FROM proteins WHERE genotype IS NOT NULL ORDER BY genotype`;
const distinctCountries = await sql`SELECT DISTINCT country FROM proteins WHERE country IS NOT NULL ORDER BY country`;

// 3. Define the datasets for the protein selector.
const datasets = [
  { id: "M1", label: "M1" },
  { id: "M2", label: "M2" },
  { id: "HA", label: "HA" },
  { id: "PAX", label: "PA-X" },
  { id: "NA", label: "NA" },
  { id: "PB1F2", label: "PB1F2" },
  { id: "NP", label: "NP" },
  { id: "NS1", label: "NS1" },
  { id: "NS2", label: "NS2" },
  { id: "PA", label: "PA" },
  { id: "PB1", label: "PB1" },
  { id: "PB2", label: "PB2" },
];

const tableName = view(
  Inputs.select(datasets, {
    label: "Choose dataset:",
    value: datasets[0],
    keyof:  d => d.label,
    valueof: d => d.id
  })
);

// 4. Use the multiSelect component. This will now work correctly because
// distinctGenotypes and distinctCountries are arrays.
const genotypes = view(multiSelect(distinctGenotypes.map(d => d.genotype), {label: "Filter by Genotype(s):"}));
const countries = view(multiSelect(distinctCountries.map(d => d.country), {label: "Filter by Country(s):"}));
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

```sql id=sequenceCalcnew display
WITH
/* ─────  A.  all sequences  ─────────────────────────────────────────── */
filtered AS (
  SELECT *
  FROM proteins
  /* --- UPDATED WHERE CLAUSE ---
     The logic is changed to handle an array of selected items from the multi-select component.
     If the array is empty (length=0), the filter is ignored (evaluates to TRUE).
     If the array has items, it uses the SQL `IN` operator to match any of them.
  */
  WHERE
    protein = ${tableName}
    AND (${genotypes.length} = 0 OR genotype IN (${genotypes}))
    AND (${countries.length} = 0 OR country IN (${countries}))
),
parsed AS (
  SELECT sequence, LENGTH(sequence) AS len
  FROM filtered
),
pos AS (
  SELECT p.sequence, gs.position
  FROM parsed AS p
  CROSS JOIN generate_series(1, p.len) AS gs(position)
),
chars AS (
  SELECT position,
         SUBSTRING(sequence, position, 1) AS aminoacid
  FROM pos
),
counts AS (                            -- frequency_all
  SELECT position, aminoacid, COUNT(*) AS cnt
  FROM chars
  GROUP BY position, aminoacid
),
totals AS (                            -- total_all
  SELECT position, SUM(cnt) AS total
  FROM counts
  GROUP BY position
),

/* ─────  B.  unique sequences only  ─────────────────────────────────── */
filtered_u AS (                        -- one row per distinct sequence
  SELECT DISTINCT sequence
  FROM filtered
),
parsed_u AS (
  SELECT sequence, LENGTH(sequence) AS len
  FROM filtered_u
),
pos_u AS (
  SELECT p.sequence, gs.position
  FROM parsed_u AS p
  CROSS JOIN generate_series(1, p.len) AS gs(position)
),
chars_u AS (
  SELECT position,
         SUBSTRING(sequence, position, 1) AS aminoacid
  FROM pos_u
),
counts_u AS (                          -- frequency_unique
  SELECT position, aminoacid, COUNT(*) AS cnt
  FROM chars_u
  GROUP BY position, aminoacid
),
totals_u AS (                          -- total_unique
  SELECT position, SUM(cnt) AS total
  FROM counts_u
  GROUP BY position
)

/* ─────  C.  final projection  ──────────────────────────────────────── */
SELECT
  c.position,
  c.aminoacid,

  /* all-sequence metrics */
  CAST(c.cnt   AS INT) AS frequency_all,
  CAST(t.total AS INT) AS total_all,
  (c.cnt::DOUBLE) / t.total            AS value,

  /* unique-sequence metrics */
  CAST(cu.cnt  AS INT) AS frequency_unique,
  CAST(tu.total AS INT) AS total_unique,
  (cu.cnt::DOUBLE) / tu.total          AS value_unique

FROM counts      AS c
JOIN totals      AS t   USING (position)
LEFT JOIN counts_u AS cu
       ON cu.position  = c.position
      AND cu.aminoacid = c.aminoacid
LEFT JOIN totals_u AS tu
       ON tu.position  = c.position
ORDER BY
  c.position,
  c.aminoacid;

```