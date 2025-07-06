---
theme: [wide, air, alt]
title: Influenza A (IAV) New
slug: IAVnew
toc: false
---



```js
const banner = await FileAttachment("banner_static.jpg").image();
banner.alt = "";
banner.className = "banner__bg";
```

<style>
@import url("https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@300;400;700&display=swap");

/* ------------- banner shell --------------------------------------- */
.banner {
  position: relative;
  height: 200px;
  width: 100vw;
  left: 50%;
  margin-left: -50vw;

  /* ⬇️ NEW — cancel the article’s built-in top padding */
  margin-top: calc(-1 * var(--observable-layout-spacing-block, 2rem));

  background: none;           /* handled by the <img> element */
  display: flex;
  align-items: center;
  padding-left: 4rem;
  font-family: "Roboto Condensed", sans-serif;
  overflow: hidden;
}

/* background image fills the box */
.banner__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

/* ------------- text ---------------------------------------------- */
.banner__text {
  position: relative;
  z-index: 2;
}
.banner__text h1 {
  margin: 0;
  font-size: 64px;
  font-weight: 400;
  color: #fff;
  line-height: 1;
}
.banner__text h2 {
  margin: 0;
  font-size: 36px;
  font-weight: 300;
  color: #fff;
}

/* ------------- translucent “M” ----------------------------------- */
.banner__logo {
  position: absolute;
  top: 0;
  right: 200px;              /* 30-px inset from edge */
  width: 88px;
  height: 100%;
  fill: rgba(255,255,255,0.30);
  z-index: 1;
  pointer-events: none;
}
</style>

<header class="banner">
  ${banner}

  <div class="banner__text">
    <h1>PEPTIDE VIEWER</h1>
    <h2>Influenza A</h2>
  </div>

  <svg class="banner__logo" viewBox="0 0 1 1" preserveAspectRatio="none">
    <polygon points="0.5745 0,0.5 0.33,0.42 0,0 0,0 1,0.27 1,0.27 0.59,
                     0.37 1,0.634 1,0.736 0.59,0.736 1,1 1,1 0,0.5745 0" />      
  </svg>
</header>

<style>
/* reusable two-column, 20 / 80 split */
.row-20-80 {
  display: grid;
  grid-template-columns: 20% 80%;
  gap: var(--observable-layout-spacing-block, 1rem);
}

/* mobile: stack cards */
@media (max-width: 640px) {
  .row-20-80 {
    grid-template-columns: 1fr;
  }
}

.file-heading {
  font-family: "Roboto", sans-serif;
  font-weight: 700;
  font-size: 20px;
  color: #000;
  margin: 0 0 0.5rem 0;   /* optional bottom space */
  text-align: left;
}
</style>

<!-- ── Row 1 · two cards: 20 % + 80 % ─────────────────────────────── -->
<div class="row-20-80">

  <!-- left card · 20 % -->
  <div class="card" style="display:flex; flex-direction:column; gap:1rem;">
    <div class="file-heading">1. Select Files</div>
    ${referencefasta}
    ${peptideinput}
    </br>
  </div>

  <!-- right card · 80 % -->
  <div class="card" style="display:flex; flex-direction:column; gap:1rem;">
    <div class="file-heading">2. Filter</div>
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:1rem;">
    ${genotypeInput}
    ${hostInput}
    ${countryInput}
    </div>
  </div>

</div>



```js
/* Imports */
import {extendDB, sql, extended} from "./components/extenddb.js"
import {DuckDBClient} from "npm:@observablehq/duckdb";
import {dropSelect} from "./components/dropSelect.js";
import {comboSelect} from "./components/comboSelect.js"
import {dateSelect} from "./components/dateSelect.js";
import {uploadButton} from "./components/uploadButton.js";
```


```js
/* Wrap Database */
const db = extendDB(
  await DuckDBClient.of({
    proteins: FileAttachment("data/IAV6-all.parquet").parquet(),
    sequencecalc: FileAttachment("data/IAV8_sequencecalc.parquet").parquet()
  })
);
```

```js
const filteredData = db.sql`
SELECT *
FROM   proteins
WHERE  protein = ${ selectedProtein }
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
Inputs.table(filteredData)
```

```js
/* Filter Helpers */
const proteinOptions = [
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
const selectedProtein = view(dropSelect(proteinOptions, {
  label: "Protein",
  fontFamily: "'Roboto', sans-serif"
}));

const genotypeInput = comboSelect(allGenotypes, {
  label: "Genotype",
  placeholder: "Type genotype…",
  fontFamily: "'Roboto', sans-serif"
});
const selectedGenotypes = Generators.input(genotypeInput);   // reactive value

const hostInput = comboSelect(allHosts, {
  label: "Host",
  placeholder: "Type host…",
  fontFamily: "'Roboto', sans-serif"
});
const selectedHosts = Generators.input(hostInput);           // reactive value

const countryInput = comboSelect(allCountries, {
  label: "Country",
  placeholder: "Type country…",
  fontFamily: "'Roboto', sans-serif"
});
const selectedCountries = Generators.input(countryInput);    // reactive value

const hostCategory = view(Inputs.checkbox(
  ["Human", "Non-human"],
  { label: "Host category", value: [] }
));

const selectedDates = view(dateSelect({
  label: "Collection date",
  fontFamily: "'Roboto', sans-serif"
}));

const selectedReleaseDates = view(dateSelect({
  label: "Release date",
  fontFamily: "'Roboto', sans-serif"
}));
```

```js
const positionStats = db.sql`
WITH
/* Data Filters */
filtered AS (
  SELECT *
  FROM   proteins
  WHERE  protein = ${ selectedProtein }

    /* Genotype */
    AND ${
      selectedGenotypes.length
        ? sql`genotype IN (${ selectedGenotypes })`
        : sql`TRUE`
    }

    /* Host Filter */
    AND ${
      selectedHosts.length
        ? sql`host IN (${ selectedHosts })`
        : sql`TRUE`
    }

    /* Host Checkbox Filter */
    AND ${
      hostCategory.includes("Human") && !hostCategory.includes("Non-human")
        ? sql`host = 'Homo sapiens'`
        : (!hostCategory.includes("Human") && hostCategory.includes("Non-human"))
            ? sql`host <> 'Homo sapiens'`
            : sql`TRUE`
    }

    /* Country Filter */
    AND ${
      selectedCountries.length
        ? sql`country IN (${ selectedCountries })`
        : sql`TRUE`
    }

    /* Collection Date Filter */
    AND ${
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

    /* Release Date Filter */
    AND ${
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
),

/* Total Tallies */
parsed AS (
  SELECT sequence, LENGTH(sequence) AS len
  FROM   filtered
),
pos AS (
  SELECT p.sequence, gs.position
  FROM   parsed AS p
  CROSS  JOIN generate_series(1, p.len) AS gs(position)
),
chars AS (
  SELECT position,
         SUBSTRING(sequence, position, 1) AS aminoacid
  FROM   pos
),
counts AS (
  SELECT position, aminoacid, COUNT(*) AS cnt
  FROM   chars
  GROUP  BY position, aminoacid
),
totals AS (
  SELECT position, SUM(cnt) AS total
  FROM   counts
  GROUP  BY position
),

/* Unique Tallies */
filtered_u AS (
  SELECT DISTINCT sequence
  FROM   filtered
),
parsed_u AS (
  SELECT sequence, LENGTH(sequence) AS len
  FROM   filtered_u
),
pos_u AS (
  SELECT p.sequence, gs.position
  FROM   parsed_u AS p
  CROSS  JOIN generate_series(1, p.len) AS gs(position)
),
chars_u AS (
  SELECT position,
         SUBSTRING(sequence, position, 1) AS aminoacid
  FROM   pos_u
),
counts_u AS (
  SELECT position, aminoacid, COUNT(*) AS cnt
  FROM   chars_u
  GROUP  BY position, aminoacid
),
totals_u AS (
  SELECT position, SUM(cnt) AS total
  FROM   counts_u
  GROUP  BY position
)

/* Final Table */
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

FROM   counts AS c
JOIN   totals AS t USING (position)
LEFT   JOIN counts_u AS cu
         ON cu.position  = c.position
        AND cu.aminoacid = c.aminoacid
LEFT   JOIN totals_u AS tu
         ON tu.position  = c.position
ORDER  BY c.position, c.aminoacid
`;
```

```js
Inputs.table(positionStats)
```

```js
/* Current Counts */
const total_all_count = positionStats.toArray()[0]?.total_all ?? 0;
const total_unique_count = positionStats.toArray()[0]?.total_unique ?? 0;

/* Previous Counts */
const total_count_previous = getPrevTotal(total_all_count);
const total_unique_previous = getPrevUnique(total_unique_count);
```

```js
/* Previous Count Tracker */
function trackPrev() {
  let prev;
  return function (current) {
    const value = prev === undefined ? null : prev;
    prev = current;
    return value;
  };
}

const getPrevTotal = trackPrev();
const getPrevUnique = trackPrev();
```

**All sequences:** ${total_all_count} (prev ${total_count_previous ?? "—"})

**Unique sequences:** ${total_unique_count} (prev ${total_unique_previous ?? "—"})


```js
/* Alignment Algorithm Precalculated Set Helpers*/
const seqCalcAll = (await db.sql`
  SELECT protein, position, aminoacid, value
  FROM   sequencecalc
`).toArray()
  .map(r => ({
    ...r,
    position  : Number(r.position),
    frequency : Number(r.value)
  }));

const normProtein = s => s.trim().replace(/\s+/g, "").toUpperCase();

const aaFreqsByProtein = new Map();
for (const { protein, position, aminoacid, frequency } of seqCalcAll) {
  const key = normProtein(protein);
  if (!aaFreqsByProtein.has(key)) aaFreqsByProtein.set(key, []);
  const arr = aaFreqsByProtein.get(key);
  while (arr.length < position) arr.push(new Map());
  arr[position - 1].set(aminoacid, frequency);
}
```

```js
/* Banded Needleman-Wunsch with Dynamic Band Width */
function nwAffineBanded(ref, freqs, baseBandWidth = 75, gOpen = -5, gExt = -2) {
  const M = freqs.length, N = ref.length;
  const lengthDiff = Math.abs(M - N);
  const bandWidth = Math.max(baseBandWidth, lengthDiff + 20);

  const Mx = Array.from({ length: M + 1 }, () => Array(N + 1).fill(-1e9)),
        Ix = Array.from({ length: M + 1 }, () => Array(N + 1).fill(-1e9)),
        Iy = Array.from({ length: M + 1 }, () => Array(N + 1).fill(-1e9));

  const TBM = Array.from({ length: M + 1 }, () => Array(N + 1).fill(0)),
        TBIx= Array.from({ length: M + 1 }, () => Array(N + 1).fill(0)),
        TBIy= Array.from({ length: M + 1 }, () => Array(N + 1).fill(0));

  Mx[0][0] = 0;
  for (let i = 1; i <= bandWidth && i <= M; ++i) { Ix[i][0] = gOpen + (i-1)*gExt; TBIx[i][0] = 1; }
  for (let j = 1; j <= bandWidth && j <= N; ++j) { Iy[0][j] = gOpen + (j-1)*gExt; TBIy[0][j] = 2; }

  for (let i = 1; i <= M; ++i) {
    const j_start = Math.max(1, i - bandWidth);
    const j_end = Math.min(N, i + bandWidth);
    const freqMap = freqs[i-1];

    for (let j = j_start; j <= j_end; ++j) {
      const residue = ref[j-1];
      const freq = freqMap.get(residue) || 0;
      
      let subst;
      if (freq > 0) {
        subst = 2 * Math.log(freq / 0.05);
      } else if (freqMap.has("X")) {
        subst = 0;
      } else {
        subst = -5;
      }
      
      const mFrom = [ Mx[i-1][j-1] + subst, Ix[i-1][j-1] + subst, Iy[i-1][j-1] + subst ];
      Mx[i][j]  = Math.max(...mFrom);
      TBM[i][j] = mFrom.indexOf(Mx[i][j]);

      const ixFromM = Mx[i-1][j] + gOpen;
      const ixFromI = Ix[i-1][j] + gExt;
      if (ixFromM >= ixFromI) { Ix[i][j] = ixFromM; TBIx[i][j] = 0; }
      else                    { Ix[i][j] = ixFromI; TBIx[i][j] = 1; }

      const iyFromM = Mx[i][j-1] + gOpen;
      const iyFromI = Iy[i][j-1] + gExt;
      if (iyFromM >= iyFromI) { Iy[i][j] = iyFromM; TBIy[i][j] = 0; }
      else                    { Iy[i][j] = iyFromI; TBIy[i][j] = 2; }
    }
  }

  let aln_b = "";
  let i = M, j = N;
  let state;
  const m_final = Mx[i][j], i_final = Ix[i][j], y_final = Iy[i][j];
  if (m_final >= i_final && m_final >= y_final) state = 0;
  else if (i_final >= y_final)                  state = 1;
  else                                          state = 2;

  while (i > 0 || j > 0) {
    if (state === 0) {
        if(j > 0) aln_b = ref[j-1] + aln_b;
        state = TBM[i][j];
        i--; j--;
    } else if (state === 1) {
        aln_b = "-" + aln_b;
        state = TBIx[i][j];
        i--;
    } else {
        if(j > 0) aln_b = ref[j-1] + aln_b;
        state = TBIy[i][j];
        j--;
    }
     if (i <= 0 && j <= 0) break;
  }
  return aln_b;
}
```

```js
/* Fasta Alignment Table */
const fastaAligned = referenceFile
  ? (await referenceFile.text())
      .trim()
      .split(/\r?\n>(?=[^\n])/g)
      .map(block => {
        const [head, ...seqLines] = block.replace(/^>/, "").split(/\r?\n/);
        const protein       = head.split("|")[0].trim();
        const canon         = normProtein(protein);
        const raw_sequence = seqLines.join("").trim();
        const freqs = aaFreqsByProtein.get(canon);
        return {
          protein,
          raw_sequence,
          aligned_sequence: freqs ? nwAffineBanded(raw_sequence, freqs) : "Error: No profile for this protein."
        };
      })
  : [];
```

```js
Inputs.table(fastaAligned)
```

```js
/* Read Peptide File + Normalisation */
const peptidesRaw = peptideFile
  ? (await (await peptideFile.text()).trim())
      .split(/\r?\n/)
      .map(line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/))
      .map(row => row.map(cell => cell.replace(/^"|"$/g, "")))
      .reduce((acc, row, i, arr) => {
        if (i === 0) {
          const hdrs = row.map(h =>
            h.toLowerCase().replace(/\s+/g, "_")
          );
          acc.headers = hdrs;
        } else {
          const obj = {};
          row.forEach((v, j) => (obj[acc.headers[j]] = v.trim()));
          acc.rows.push(obj);
        }
        return acc;
      }, { headers: [], rows: [] }).rows
  : [];

/* Keep Original Columns */
const peptidesClean = peptidesRaw.map(d => {
  const o = {
    peptide : d.peptide?.toUpperCase?.() ?? "",
    protein : d.protein?.trim?.() ?? ""
  };
  ["attribute_1", "attribute_2", "attribute_3"].forEach((k, i) => {
    const src = Object.keys(d).find(h => h.startsWith("attribute") && +h.match(/\d+/)?.[0] === i+1);
    if (src) o[k] = d[src];
  });
  return o;
});
```

```js
/* Reference Grids */
const alignRefMap = new Map(
  (fastaAligned ?? []).map(d => [d.protein, d.aligned_sequence])
);

/* Align Peptides to Reference */
function alignPeptideToRef(peptide, refAlign) {
  const p     = peptide.toUpperCase();
  const ungap = refAlign.replace(/-/g, "");
  const idxRaw = ungap.indexOf(p);
  if (idxRaw === -1) return { start_raw: null, start_aln: null, aligned: null };

  let rawCounter = 0, startAln = null;
  for (let i = 0; i < refAlign.length; ++i) {
    if (refAlign[i] !== "-") {
      if (rawCounter === idxRaw) { startAln = i + 1; break; }
      rawCounter++;
    }
  }

  let aligned = "", collectedRaw = 0;
  for (let i = startAln - 1; i < refAlign.length; ++i) {
    const ch = refAlign[i];
    aligned += ch;
    if (ch !== "-") {
      collectedRaw++;
      if (collectedRaw === p.length) break;
    }
  }

  return { start_raw: idxRaw + 1, start_aln: startAln, aligned };
}

/* Peptide Alignment Table */
const peptidesAligned = peptidesClean.map(d => {
  const ref  = alignRefMap.get(d.protein);
  const { start_raw, start_aln, aligned } = ref
        ? alignPeptideToRef(d.peptide, ref)
        : { start_raw: null, start_aln: null, aligned: null };

  return {
    ...d,
    length           : d.peptide.length,
    start_raw        : start_raw,
    start            : start_aln,
    peptide_aligned  : aligned,
    aligned_length   : aligned ? aligned.length : null
  };
});
```

```js
Inputs.table(peptidesAligned)
```

```js
/* ── detached inputs ─────────────────────────────────────────────── */
const referencefasta = uploadButton({
  label: "Upload Reference",
  accept: ".fasta",
  required: true
});
const referenceFile = Generators.input(referencefasta);   // ← value

const peptideinput = uploadButton({
  label: "Upload Peptides",
  accept: ".csv",
  required: true
});
const peptideFile = Generators.input(peptideinput);       // ← value
```

```js

```