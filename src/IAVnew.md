---
theme: [wide, air, alt]
title: Influenza A (IAV) New
slug: IAVnew
toc: false
---

<!-- Banner -->
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
  margin-bottom: var(--observable-layout-spacing-block, 1rem);

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

<!-- Dashboard CSS -->

<style>
/* 20 % / 80 % grid with uniform gap */
.layout-20-80 {
  display: grid;
  grid-template-columns: 20% 80%;
  gap: var(--observable-layout-spacing-block, 1rem);
}
/* kill the card’s default margin so gap rules all */
.layout-20-80 .card { margin: 0; }

/* mobile */
@media (max-width: 640px) {
  .layout-20-80 { grid-template-columns: 1fr; }
}

/* left-hand small headings */
.file-heading {
  font-family: "Roboto", sans-serif;
  font-weight: 700;
  font-size: 20px;
  margin: 0 0 0.5rem 0;
  color: #000;
}
</style>

<!-- HTML -->

<div class="layout-20-80">

  <!-- Row 1 · 20 % · Select files -->
  <div class="card" style="display:flex; flex-direction:column; gap:1rem;">
    <div class="file-heading">1. Select Files</div>
    ${referencefasta}
    ${peptideinput}
  </div>

  <!-- Row 1 · 80 % · Filters -->
  <div class="card" style="display:flex; flex-direction:column; gap:1rem;">
    <div class="file-heading">2. Filter</div>
    <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:1rem;">
      ${proteinInput}
      ${genotypeInput}
      <div style="display:flex; flex-direction:column; gap:.75rem;">
        ${hostInput}
        ${hostCategoryBox}
      </div>
      ${countryInput}
      ${collectionDateInput}
      ${releaseDateInput}
    </div>
    <div style="grid-column:1 / -1; justify-self:start;">
      ${applyButtonInput}
      ${clearButtonInput}
    </div>
  </div>

  <!-- Row 2-4 · 20 % · continuous sidebar card -->
  <div class="card" style="grid-row: 2 / span 3;">
    <div class="file-heading">3. Control Panel</div>
  </div>

  <!-- Row 2 · 80 % · metric cards -->
  <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem;">
    ${metricCard({title:"All sequences",     current: total_all_count,    previous: total_count_previous})}
    ${metricCard({title:"Unique sequences",  current: total_unique_count, previous: total_unique_previous})}
    ${metricCard({title:"Aligned peptides",  current: aligned_count,      previous: nonaligned_count, hideDelta:true})}
    ${metricCard({title:"Conserved peptides",current: aligned_count,      previous: nonaligned_count, hideDelta:true})}
  </div>

  <!-- Row 3 · 80 % · two equal cards -->
  <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:1rem;">
    <div class="card">${heatmapSVG}</div>
    <div class="card"><h3>Row 3 · Card B</h3></div>
  </div>

  <!-- Row 4 · 80 % · single wide card -->
  <div class="card" style="min-height:200px;">
    ${createIAVDashboard()}
  </div>

</div>

<!-- Imports and Loading Data -->
```js
/* Imports */
import {extendDB, sql, extended} from "./components/extenddb.js"
import {DuckDBClient} from "npm:@observablehq/duckdb";
import {dropSelect} from "./components/dropSelect.js";
import {comboSelect} from "./components/comboSelect.js"
import {dateSelect} from "./components/dateSelect.js";
import {uploadButton} from "./components/uploadButton.js";
import {checkboxSelect} from "./components/checkboxSelect.js";
import {filterButton} from "./components/filterButton.js";
import {downloadButton} from "./components/downloadButton.js";
import {metricCard} from "./components/metricCard.js";
import {peptideChart} from "./components/peptideChart.js";
import {stackedChart} from "./components/stackedChart.js";
import {makePeptideScale, colourAA} from "./components/palettes.js";
import { peptideHeatmap } from "./components/peptideHeatmap.js";
import * as d3 from "npm:d3";
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

<!-- Filter Buttons + Helpers -->
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
const proteinInput = dropSelect(proteinOptions, {
  label: "Protein",
  fontFamily: "'Roboto', sans-serif"
});
const selectedProtein = Generators.input(proteinInput);

const genotypeInput = comboSelect(allGenotypes, {
  label: "Genotype",
  placeholder: "Type genotype…",
  fontFamily: "'Roboto', sans-serif"
});
const selectedGenotypes = Generators.input(genotypeInput);

const hostInput = comboSelect(allHosts, {
  label: "Host",
  placeholder: "Type host…",
  fontFamily: "'Roboto', sans-serif"
});
const selectedHosts = Generators.input(hostInput);

const safe = arr => Array.isArray(arr) ? arr : [];

const countryInput = comboSelect(allCountries, {
  label: "Country",
  placeholder: "Type country…",
  fontFamily: "'Roboto', sans-serif"
});
const selectedCountries = Generators.input(countryInput);

const hostCategoryBox = checkboxSelect(["Human", "Non-human"]);
const hostCategory = Generators.input(hostCategoryBox);

const collectionDateInput = dateSelect({
  label: "Collection date",
  fontFamily: "'Roboto', sans-serif"
});
const selectedDates = Generators.input(collectionDateInput);

const releaseDateInput = dateSelect({
  label: "Release date",
  fontFamily: "'Roboto', sans-serif"
});
const selectedReleaseDates = Generators.input(releaseDateInput); 
```

```js
/* Apply Filters Button */
const applyButtonInput  = filterButton("Apply filters",  {color:"#006DAE"});
const applyTrigger = Generators.input(applyButtonInput);
```

```js
/* Apply Filters Function */
function commit(element) {
  return Generators.observe((change) => {
    const update = () => change(element.value);
    update();
    applyButtonInput.addEventListener("input", update);
    return () => applyButtonInput.removeEventListener("input", update);
  });
}

/* Committed Filters */
const proteinCommitted         = commit(proteinInput);
const genotypesCommitted       = commit(genotypeInput);
const hostsCommitted           = commit(hostInput);
const hostCategoryCommitted    = commit(hostCategoryBox);
const countriesCommitted       = commit(countryInput);
const collectionDatesCommitted = commit(collectionDateInput);
const releaseDatesCommitted    = commit(releaseDateInput);
```

```js
/* Clear Filters Button */
const clearButtonInput  = filterButton("Clear filters",  {color:"#A3A3A3"});

clearButtonInput.addEventListener("input", () => {
  proteinInput.clear();
  genotypeInput.clear();
  hostInput.clear();
  countryInput.clear();
  hostCategoryBox.clear();
  collectionDateInput.clear();
  releaseDateInput.clear();
});
```

<!-- Summary Stat Cards -->
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

```js
/* Peptide Alignment Count Tracker */
const aligned_count    = peptidesAligned.filter(d => d.peptide_aligned)?.length ?? 0;
const nonaligned_count = peptidesAligned.length - aligned_count;
```

<!-- Input Reference FASTA Alignment -->
```js
/* Input FASTA Button */
const referencefasta = uploadButton({
  label: "Upload Reference",
  accept: ".fasta",
  required: false
});
const referenceFile = Generators.input(referencefasta);
```

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

<!-- Input Peptide Alignment -->
```js
/* Input Peptide Button */
const peptideinput = uploadButton({
  label: "Upload Peptides",
  accept: ".csv",
  required: false
});
const peptideFile = Generators.input(peptideinput);
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

<!-- Download Buttons -->
```js
/* Download Alignment Button */
const downloadFastaBtn = downloadButton({
  label   : "Download FASTA CSV",
  filename: "fastaAligned.csv",
  data    : () => fastaAligned
});

/* Download Peptides Button */
const downloadPeptideBtn = downloadButton({
  label   : "Download Peptides CSV",
  filename: "peptidesAligned.csv",
  data    : () => peptidesAligned
});
```

<!-- Synchronised Graphs -->
```js
/* Function to Create Synchronised Graphs */
function createIAVDashboard({
  rowHeight   = 18,
  gap         = 2,
  sizeFactor  = 1.2,
  margin      = {top:20,right:20,bottom:30,left:40}
} = {}) {

  /* 1 ▸ peptide data & colour scale --------------------------- */
  const pepData = peptidesAligned.filter(
    d => d.protein === proteinCommitted
  );
  const keys        = [...new Set(pepData.map(d => d[colourAttr]))].sort();
  /* d3.scaleOrdinal needs at least 1 key–colour pair */
  const colourScale = makePeptideScale(keys.length ? keys : ["­­dummy­­"]);

  /* 2 ▸ stacked-bar data already built in `stackedBars` -------- */

  /* 3 ▸ SHARED X SCALE  (0.5 … max+0.5) ------------------------ */
  const maxPos = Math.max(
    pepData.length ? d3.max(pepData, d => d.start + d.length) : 1,
    d3.max(stackedBars, d => d.position)
  );
  const domain = [0.5, maxPos + 0.5];                 // ← key change
  const svgWidth = width;
  const x0       = d3.scaleLinear(domain,
                   [margin.left, svgWidth - margin.right]);
  let   xCurrent = x0;

  /* 4 ▸ responsive SVG & slot helper -------------------------- */
  const svg = d3.create("svg")
    .style("width", "100%")
    .attr("font-family", "sans-serif");

  let yOff = 0;
  const slot = () => svg.append("g")
                        .attr("transform", `translate(0,${yOff})`);

  /* 5 ▸ peptide viewer ---------------------------------------- */
  const pep = peptideChart(slot(), {
    data       : pepData,
    xScale     : xCurrent,
    rowHeight, gap, sizeFactor, margin, colourScale,
    onClick    : d => {                 //  ← this stays as-is
      setSelectedPeptide(d.peptide);
      setSelectedStart(d.start);
      setSelectedLength(d.length);
    }
  });
  yOff += pep.height;

  /* 6 ▸ stacked bar chart ------------------------------------- */
  const stack = stackedChart(slot(), {
    data       : stackedBars,
    tooltipRows: aaFrequencies.map(d => ({
                  position : d.position,
                  aminoacid: d.aminoacid,
                  value    : d.value_selected
                })),
    xScale     : xCurrent,
    sizeFactor,
    margin,
    height     : 90 * sizeFactor
  });
  yOff += stack.height;

  /* 7 ▸ finalise SVG ------------------------------------------ */
  svg.attr("height", yOff)
     .attr("viewBox", `0 0 ${svgWidth} ${yOff}`);

  /* 8 ▸ shared zoom (integer ticks preserved) ----------------- */
  const updaters = [pep.update, stack.update];
  const EPS      = 1e-6;
  const zoom = d3.zoom()
    .scaleExtent([1,15])
    .translateExtent([[margin.left,0],
                      [svgWidth - margin.right, yOff]])
    .on("zoom", function (ev) {
      /* --- 1. snap to identity when user is fully zoomed out --- */
      if (Math.abs(ev.transform.k - 1) < EPS &&
          (Math.abs(ev.transform.x) > EPS)) {
        // force-reset — affects every chart simultaneously
        svg.call(zoom.transform, d3.zoomIdentity);
        return;                              // skip stale update
      }

      /* --- 2. normal re-flow for any other transform ----------- */
      xCurrent = ev.transform.rescaleX(x0);
      updaters.forEach(fn => fn(xCurrent));
    });
  svg.call(zoom);

  return svg.node();
}
```

<!-- Control Panel Buttons -->
```js
const colourAttrInput = Inputs.radio(
  ["attribute_1", "attribute_2", "attribute_3"],
  {label: "Colour peptides by:", value: "attribute_1"}
);
const colourAttr = Generators.input(colourAttrInput);
```

```js
/* Switch All vs Unique Sequences Radio */
const seqSetInput = Inputs.radio(
  ["All sequences", "Unique sequences"],
  {label: "Sequence set:", value: "All sequences"}
);
const seqSet = Generators.input(seqSetInput);
```

```js
/* Colour Peptide Cell Plot Button */
const colourModeInput = Inputs.radio(
  ["Mismatches", "Properties"],
  { label: "Cell colouring:", value: "Mismatches" }
);
const colourMode = Generators.input(colourModeInput);
```

<!-- Data Source Switcher -->
```js
/* Any Filters Present */
function noExtraFilters() {
  return (
    !genotypesCommitted.length          &&
    !hostsCommitted.length              &&
    !hostCategoryCommitted.length       &&
    !countriesCommitted.length          &&
    !(collectionDatesCommitted.from || collectionDatesCommitted.to) &&
    !(releaseDatesCommitted.from   || releaseDatesCommitted.to)
  );
}
```

```js
/* Calculate Position Data */
const positionStats = (
  noExtraFilters()
    ? db.sql`                       -- fast path
        SELECT position, aminoacid,
               frequency_all, total_all, value,
               frequency_unique, total_unique, value_unique
        FROM sequencecalc
        WHERE protein = ${proteinCommitted}`
    : db.sql`                       -- live path
        WITH
        /* ──────────────  A.  Data Filters  ───────────────────────────── */
        filtered AS (
          SELECT *
          FROM   proteins
          WHERE  protein = ${ proteinCommitted } 

          /* Genotype */
          AND ${
            genotypesCommitted.length
              ? sql`genotype IN (${ genotypesCommitted })`
              : sql`TRUE`
          }

          /* Host drop-down */
          AND ${
            hostsCommitted.length
              ? sql`host IN (${ hostsCommitted })`
              : sql`TRUE`
          }

          /* Host category checkboxes */
          AND ${
            hostCategoryCommitted.includes("Human") &&
            !hostCategoryCommitted.includes("Non-human")
              ? sql`host = 'Homo sapiens'`
              : (!hostCategoryCommitted.includes("Human") &&
                hostCategoryCommitted.includes("Non-human"))
                  ? sql`host <> 'Homo sapiens'`
                  : sql`TRUE`
          }

          /* Country */
          AND ${
            countriesCommitted.length
              ? sql`country IN (${ countriesCommitted })`
              : sql`TRUE`
          }

          /* Collection date */
          AND ${
            collectionDatesCommitted.from || collectionDatesCommitted.to
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
                    collectionDatesCommitted.from && collectionDatesCommitted.to
                      ? sql`BETWEEN CAST(${ collectionDatesCommitted.from } AS DATE)
                              AND   CAST(${ collectionDatesCommitted.to   } AS DATE)`
                      : collectionDatesCommitted.from
                          ? sql`>= CAST(${ collectionDatesCommitted.from } AS DATE)`
                          : sql`<= CAST(${ collectionDatesCommitted.to   } AS DATE)`
                  }
                `
              : sql`TRUE`
          }

          /* Release date */
          AND ${
            releaseDatesCommitted.from || releaseDatesCommitted.to
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
                    releaseDatesCommitted.from && releaseDatesCommitted.to
                      ? sql`BETWEEN CAST(${ releaseDatesCommitted.from } AS DATE)
                              AND   CAST(${ releaseDatesCommitted.to   } AS DATE)`
                      : releaseDatesCommitted.from
                          ? sql`>= CAST(${ releaseDatesCommitted.from } AS DATE)`
                          : sql`<= CAST(${ releaseDatesCommitted.to   } AS DATE)`
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
    `
);
```

```js
/* JS Array for Plotting */
const aaFrequencies = (
  await positionStats.toArray()
).map(r => {
  const all  = Number(r.value       );
  const uniq = Number(r.value_unique);
  return {
    position        : Number(r.position),
    aminoacid       : r.aminoacid,
    value_selected  : (seqSet === "Unique sequences" ? uniq : all)
  };
});

/* Stacked Bar Chart Data */
const stackedBars = (() => {
  const rows = [];
  for (const [pos, arows] of d3.group(aaFrequencies, d=>d.position)) {
    const maxVal = d3.max(arows, d=>d.value_selected);
    arows
      .filter(d => d.value_selected !== maxVal)
      .sort((a,b)=>d3.descending(a.value_selected,b.value_selected))
      .reduce((y0,d)=>{
        rows.push({
          position : +pos,
          aminoacid: d.aminoacid,
          y0,
          y1      : y0 += d.value_selected
        });
        return y0;
      },0);
  }
  return rows;
})();
```

```js
/* Mutable Peptide Selected */
const selectedPeptide = Mutable(null);
const setSelectedPeptide = x => selectedPeptide.value = x;

const selectedStart = Mutable(null);
const setSelectedStart = x => selectedStart.value = x;

const selectedLength = Mutable(null);
const setSelectedLength = x => selectedLength.value = x;
```

```js
/* Peptide Query Data */
const peptideProps = db.sql`
WITH
/* Clicked Peptide */
params AS (
  SELECT
    CAST(${selectedStart}  AS BIGINT) AS start,
    CAST(${selectedLength} AS BIGINT) AS len,
    ${selectedPeptide}                 AS sel_peptide
),
/* Chosen Filters */
filtered AS (
  SELECT *
  FROM   proteins
  WHERE  protein = ${proteinCommitted}
    /* Genotype */
    AND ${ genotypesCommitted.length
            ? sql`genotype IN (${ genotypesCommitted })`
            : sql`TRUE` }
    /* Host Search */
    AND ${ hostsCommitted.length
            ? sql`host IN (${ hostsCommitted })`
            : sql`TRUE` }
    /* Host Checkbox */
    AND ${
          hostCategoryCommitted.includes('Human') &&
          !hostCategoryCommitted.includes('Non-human')
            ? sql`host = 'Homo sapiens'`
            : (!hostCategoryCommitted.includes('Human') &&
               hostCategoryCommitted.includes('Non-human'))
                ? sql`host <> 'Homo sapiens'`
                : sql`TRUE`
        }
    /* Country */
    AND ${ countriesCommitted.length
            ? sql`country IN (${ countriesCommitted })`
            : sql`TRUE` }
    /* Collection Date */
    AND ${
      collectionDatesCommitted.from || collectionDatesCommitted.to
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
              collectionDatesCommitted.from && collectionDatesCommitted.to
                ? sql`BETWEEN CAST(${collectionDatesCommitted.from} AS DATE)
                         AND   CAST(${collectionDatesCommitted.to  } AS DATE)`
                : collectionDatesCommitted.from
                    ? sql`>= CAST(${collectionDatesCommitted.from} AS DATE)`
                    : sql`<= CAST(${collectionDatesCommitted.to   } AS DATE)`
            }
          `
        : sql`TRUE`
    }
    /* Release Date */
    AND ${
      releaseDatesCommitted.from || releaseDatesCommitted.to
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
              releaseDatesCommitted.from && releaseDatesCommitted.to
                ? sql`BETWEEN CAST(${releaseDatesCommitted.from} AS DATE)
                         AND   CAST(${releaseDatesCommitted.to  } AS DATE)`
                : releaseDatesCommitted.from
                    ? sql`>= CAST(${releaseDatesCommitted.from} AS DATE)`
                    : sql`<= CAST(${releaseDatesCommitted.to   } AS DATE)`
            }
          `
        : sql`TRUE`
    }
),

/* All-Sequence Tallies */
extracted_all AS (
  SELECT SUBSTR(sequence, params.start, params.len) AS peptide
  FROM   filtered, params
),
counts_all AS (
  SELECT peptide, COUNT(*) AS cnt_all
  FROM   extracted_all
  GROUP  BY peptide
),
total_all AS ( SELECT SUM(cnt_all) AS total_all FROM counts_all ),

/* Unique-Sequence Tallies */
filtered_dist AS ( SELECT DISTINCT sequence FROM filtered ),
extracted_u AS (
  SELECT SUBSTR(sequence, params.start, params.len) AS peptide
  FROM   filtered_dist, params
),
counts_u AS (
  SELECT peptide, COUNT(*) AS cnt_unique
  FROM   extracted_u
  GROUP  BY peptide
),
total_u AS ( SELECT SUM(cnt_unique) AS total_unique FROM counts_u ),

/* Merge Lists */
combined AS (
  SELECT
    COALESCE(ca.peptide, cu.peptide)                      AS peptide,

    /* all sequences */
    CAST(COALESCE(ca.cnt_all,0)  AS INT)                  AS frequency_all,
    CAST(ta.total_all           AS INT)                   AS total_all,
    CASE WHEN ta.total_all = 0
         THEN 0.0
         ELSE COALESCE(ca.cnt_all,0) * 1.0 / ta.total_all
    END                                                   AS proportion_all,

    /* unique sequences */
    CAST(COALESCE(cu.cnt_unique,0) AS INT)                AS frequency_unique,
    CAST(tu.total_unique          AS INT)                 AS total_unique,
    CASE WHEN tu.total_unique = 0
         THEN 0.0
         ELSE COALESCE(cu.cnt_unique,0) * 1.0 / tu.total_unique
    END                                                   AS proportion_unique
  FROM        counts_all  AS ca
  FULL  JOIN  counts_u    AS cu USING (peptide)
  CROSS JOIN  total_all   AS ta
  CROSS JOIN  total_u     AS tu
)

/* Final Table */
SELECT *
FROM   combined                           -- everything except the click
CROSS  JOIN params
WHERE  peptide <> params.sel_peptide

UNION ALL                                -- clicked peptide at the end
SELECT *
FROM   combined
RIGHT  JOIN params
       ON combined.peptide = params.sel_peptide

ORDER BY proportion_all DESC;
`;
```

```js
/* Peptide JS Array */
const rowsRaw = await peptideProps.toArray();

/* Peptide Unique vs All Switcher */
const useUnique = seqSet === "Unique sequences";

const propCol = useUnique ? "proportion_unique" : "proportion_all";
const freqCol = useUnique ? "frequency_unique"  : "frequency_all";
const totCol  = useUnique ? "total_unique"      : "total_all";

/* Map Peptide Plot Data */
const heatmapData = rowsRaw.map(r => ({
  peptide   : r.peptide,
  proportion: Number(r[propCol]),
  frequency : Number(r[freqCol]),
  total     : Number(r[totCol])
}));

/* Create Peptide Plot */
const heatmapSVG = peptideHeatmap({
  data      : heatmapData,
  selected  : selectedPeptide,
  colourMode: colourMode
});
```

```js
/* Reset Peptide Plot when Protein Changes */
{
  const _ = proteinCommitted;
  setSelectedPeptide(null);
  setSelectedStart(null);
  setSelectedLength(null);
}

```


<!-- Delete Later -->
```js
const filteredData = db.sql`
SELECT *
FROM   proteins
WHERE  protein = ${ proteinCommitted }

AND ${
  genotypesCommitted.length
    ? sql`genotype IN (${ genotypesCommitted })`
    : sql`TRUE`
}

AND ${
  hostsCommitted.length
    ? sql`host IN (${ hostsCommitted })`
    : sql`TRUE`
}

AND ${
  hostCategoryCommitted.includes("Human") &&
  !hostCategoryCommitted.includes("Non-human")
    ? sql`host = 'Homo sapiens'`
    : (!hostCategoryCommitted.includes("Human") &&
        hostCategoryCommitted.includes("Non-human"))
        ? sql`host <> 'Homo sapiens'`
        : sql`TRUE`
}

AND ${
  countriesCommitted.length
    ? sql`country IN (${ countriesCommitted })`
    : sql`TRUE`
}

AND ${
  collectionDatesCommitted.from || collectionDatesCommitted.to
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
          collectionDatesCommitted.from && collectionDatesCommitted.to
            ? sql`BETWEEN CAST(${ collectionDatesCommitted.from } AS DATE)
                     AND   CAST(${ collectionDatesCommitted.to   } AS DATE)`
            : collectionDatesCommitted.from
                ? sql`>= CAST(${ collectionDatesCommitted.from } AS DATE)`
                : sql`<= CAST(${ collectionDatesCommitted.to   } AS DATE)`
        }
      `
    : sql`TRUE`
}

AND ${
  releaseDatesCommitted.from || releaseDatesCommitted.to
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
          releaseDatesCommitted.from && releaseDatesCommitted.to
            ? sql`BETWEEN CAST(${ releaseDatesCommitted.from } AS DATE)
                     AND   CAST(${ releaseDatesCommitted.to   } AS DATE)`
            : releaseDatesCommitted.from
                ? sql`>= CAST(${ releaseDatesCommitted.from } AS DATE)`
                : sql`<= CAST(${ releaseDatesCommitted.to   } AS DATE)`
        }
      `
    : sql`TRUE`
}
LIMIT 25
`;
```

```js
createIAVDashboard()
```

${colourAttrInput}

${colourModeInput}

${seqSetInput}

${downloadFastaBtn}

${downloadPeptideBtn}

```js
Inputs.table(filteredData)
```

```js
Inputs.table(positionStats)
```

```js
Inputs.table(peptidesAligned)
```

```js
Inputs.table(peptideProps)
```