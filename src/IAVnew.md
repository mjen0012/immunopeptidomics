---
theme: [wide, air]
title: Influenza A (IAV) New
slug: IAVnew
toc: false
sql:
    sequencecalc: data/IAV6_sequencecalc.parquet
---

```js
/* Imports */
import {extendDB, sql, extended} from "./components/extenddb.js"
import {DuckDBClient} from "npm:@observablehq/duckdb";
import {dropSelect} from "./components/dropSelect.js";
import {comboSelect} from "./components/comboSelect.js"
import {dateSelect} from "./components/dateSelect.js";
```

```js
/* Wrap Database */
const db = extendDB(
  await DuckDBClient.of({
    proteins: FileAttachment("data/IAV6-all.parquet").parquet()
  })
);
```

```js
const row2 = db.sql`
SELECT *
FROM   proteins
WHERE  protein = ${ tableName }
AND       ${
  selectedGenotypes.length
    ? sql`genotype IN (${ selectedGenotypes })`
    : sql`TRUE`
}
AND    ${
  selectedHosts.length
    ? sql`host      IN (${ selectedHosts })`
    : sql`TRUE`
}
AND    ${
  hostCategory.includes("Human") && !hostCategory.includes("Non-human")
    ? sql`host = 'Homo sapiens'`
    : (!hostCategory.includes("Human") && hostCategory.includes("Non-human"))
        ? sql`host <> 'Homo sapiens'`
        : sql`TRUE`
}
AND    ${
  selectedCountries.length
    ? sql`country IN (${ selectedCountries })`
    : sql`TRUE`
}
AND    ${
  selectedDates.from || selectedDates.to
    ? sql`
        TRY_CAST(
          CASE
            WHEN collection_date IS NULL OR collection_date = '' THEN NULL
            WHEN LENGTH(collection_date)=4  THEN collection_date || '-01-01'
            WHEN LENGTH(collection_date)=7  THEN collection_date || '-01'
            ELSE collection_date
          END AS DATE
        )
        ${
          selectedDates.from && selectedDates.to
            ? sql`BETWEEN CAST(${ selectedDates.from } AS DATE)
                     AND   CAST(${ selectedDates.to   } AS DATE)`
            : selectedDates.from
                ? sql`>= CAST(${ selectedDates.from } AS DATE)`
                : sql`<= CAST(${ selectedDates.to   } AS DATE)`
        }
      `
    : sql`TRUE`
}
AND    ${
  selectedReleaseDates.from || selectedReleaseDates.to
    ? sql`
        TRY_CAST(
          CASE
            WHEN release_date IS NULL OR release_date = '' THEN NULL
            WHEN LENGTH(release_date)=4 THEN release_date || '-01-01'
            WHEN LENGTH(release_date)=7 THEN release_date || '-01'
            ELSE release_date
          END AS DATE
        )
        ${
          selectedReleaseDates.from && selectedReleaseDates.to
            ? sql`BETWEEN CAST(${ selectedReleaseDates.from } AS DATE)
                     AND   CAST(${ selectedReleaseDates.to   } AS DATE)`
            : selectedReleaseDates.from
                ? sql`>= CAST(${ selectedReleaseDates.from } AS DATE)`
                : sql`<= CAST(${ selectedReleaseDates.to   } AS DATE)`
        }
      `
    : sql`TRUE`
}
LIMIT  25
`
```

```js
Inputs.table(row2)
```

```js
/* Filter Helpers */
const datasets = [
  {id: "M1",    label: "Matrix 1 (M1)"},
  {id: "M2",    label: "Matrix 2 (M2)"},
  {id: "HA",    label: "Hemagglutinin (HA)"},
  {id: "PAX",   label: "Polymerase Acidic X (PA-X)"},
  {id: "NA",    label: "Neuraminidase (NA)"},
  {id: "PB1F2", label: "PB1-F2 (PB1-F2)"},
  {id: "NP",    label: "Nucleocapsid (NP)"},
  {id: "NS1",   label: "Nonstructural 1 (NS1)"},
  {id: "NS2",   label: "Nonstructural 2 (NS2)"},
  {id: "PA",    label: "Polymerase Acidic (PA)"},
  {id: "PB1",   label: "Polymerase Basic 1 (PB1)"},
  {id: "PB2",   label: "Polymerase Basic 2 (PB2)"}
];

const allGenotypes = (await db.sql`
  SELECT DISTINCT genotype
  FROM proteins
  WHERE genotype IS NOT NULL
`).toArray()
  .map(d => d.genotype)
  .sort();

const allHosts = (await db.sql`
  SELECT DISTINCT host
  FROM   proteins
  WHERE  host IS NOT NULL
`).toArray().map(d => d.host).sort();

const allCountries = (await db.sql`
  SELECT DISTINCT country
  FROM   proteins
  WHERE  country IS NOT NULL
`).toArray().map(d => d.country).sort();
```

```js
/* Filter Buttons */
const tableName = view(dropSelect(datasets, {
  label: "Protein",
  fontFamily: "'Roboto', sans-serif"
}));

const selectedGenotypes = view(comboSelect(allGenotypes, {
  label: "Genotype",
  placeholder: "Type genotype…",
  fontFamily: "'Roboto', sans-serif"
}))

const selectedHosts = view(comboSelect(allHosts, {
  label: "Host",
  placeholder: "Type host…",
  fontFamily: "'Roboto', sans-serif"
}));

const hostCategory = view(Inputs.checkbox(
  ["Human", "Non-human"],
  { label: "Host category", value: [] }
));

const selectedCountries = view(comboSelect(allCountries, {
  label: "Country",
  placeholder: "Type country…",
  fontFamily: "'Roboto', sans-serif"
}));

const selectedDates = view(dateSelect({
  label: "Collection date",
  fontFamily: "'Roboto', sans-serif"
}));

const selectedReleaseDates = view(dateSelect({
  label: "Release date",
  fontFamily: "'Roboto', sans-serif"
}));
```

