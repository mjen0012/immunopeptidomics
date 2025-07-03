---
theme: [wide, air]
title: Influenza A (IAV) New
slug: IAVnew
toc: false
sql:
    proteins: data/IAV_all.parquet
    sequencecalc: data/IAV_sequencecalc.parquet
---

```sql id=sequenceCalcnew display
WITH
/* ─────  A.  all sequences  ─────────────────────────────────────────── */
filtered AS (                         -- by protein / genotype / country
  SELECT *
  FROM proteins
  WHERE protein = ${tableName}
    AND (${genotype} = '' OR genotype = ${genotype})
    AND (${country}  = '' OR country  = ${country})
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