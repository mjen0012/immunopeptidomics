---
theme: [wide, air, alt]
title: Influenza A (IAV) with netMHC
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
    <br>${facetSelectInput}</br>
    <br>${colourAttrInput}</br>
    <br>${colourModeInput}</br>
    <br>${aaKeyEl}</br>
    <br>${seqSetInput}</br>
    <br>${downloadFastaBtn}</br>
    <br>${downloadPeptideBtn}</br>
  </div>

  <!-- Row 2 · 80 % · metric cards -->
  <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem;">
    ${metricCard({title:"All sequences",     current: total_all_count,    previous: total_count_previous})}
    ${metricCard({title:"Unique sequences",  current: total_unique_count, previous: total_unique_previous})}
    ${metricCard({title:"Aligned peptides",  current: aligned_count,      previous: nonaligned_count, hideDelta:true})}
    ${metricCard({title:"Conserved peptides",current: aligned_count,      previous: nonaligned_count, hideDelta:true})}
  </div>

  <!-- Row 3 · 80 % · three equal cards -->
  <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:1rem;">
    <div class="card">${heatmapSVG}</div>
    <div class="card">${allelePlot}</div>   <!-- ⬅️ NEW: netMHC heatmap card -->
    <div class="card">${histEl}</div>
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
import {areaChart} from "./components/areaChart.js";
import {sequenceCompareChart} from "./components/sequenceCompareChart.js";
import {histogramChart} from "./components/histogramChart.js";
import {alleleChart} from "./components/alleleChart.js";
import {aaColourKey} from "./components/aaColourKey.js";
import {runButton} from "./components/runButton.js";
import * as d3 from "npm:d3";
```

```js
/* Wrap Database */
const db = extendDB(
  await DuckDBClient.of({
    proteins: FileAttachment("data/IAV6-all.parquet").parquet(),
    sequencecalc: FileAttachment("data/IAV8_sequencecalc.parquet").parquet(),
    netmhccalc: FileAttachment("data/iedb_netmhcpan_30k_allalleles_results.parquet").parquet(),
    hla: FileAttachment("data/HLAlistClassI.parquet").parquet()
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

/* Peptide Alignment Table  – now exposes BOTH lengths */
const peptidesAligned = peptidesClean.map(d => {
  const ref  = alignRefMap.get(d.protein);

  const { start_raw, start_aln, aligned } = ref
        ? alignPeptideToRef(d.peptide, ref)
        : { start_raw: null, start_aln: null, aligned: null };

  return {
    ...d,
    /* NEW FIELD NAMES */
    length_raw       : d.peptide.length,               // ← ungapped length
    length           : aligned ? aligned.length : null,/* ← aligned length */
    start_raw        : start_raw,                      // optional info
    start            : start_aln,                      // aligned coord
    peptide_aligned  : aligned,                        // string incl. gaps
    aligned_length   : aligned ? aligned.length : null // kept for legacy
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

    /* align-aware click handler */
    onClick    : d => {
      setSelectedPeptide(d.peptide_aligned); // always the aligned string
      setSelectedStart  (d.start);
      setSelectedLength (d.length);          // aligned span
    }
  });
  yOff += pep.height;

  /* 7 ▸ reference vs consensus cells -------------------------- */
  const seqcmp = sequenceCompareChart(slot(), {
    refRows   : refRows,
    consRows  : consensusRows,
    xScale    : xCurrent,
    colourMode,
    sizeFactor,
    margin,
    cell      : 24*sizeFactor
  });
  yOff += seqcmp.height;

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

  /* ⭐ 8 ▸ area chart -------------------------------------------- */
  const area = areaChart(slot(), {
    data      : areaData,
    xScale    : xCurrent,
    sizeFactor,
    margin,
    height    : 90 * sizeFactor
  });
  yOff += area.height;  

  /* 9 ▸ facet overlays (only if we actually have them) ------------- */
  const facetUpdaters = [];

  if (facetArea.size) {
    const titleStyle = {
      "font-family": "sans-serif",
      "font-size"  : 12*sizeFactor,
      "font-weight": "bold",
      "fill"       : "#444"
    };

    for (const [facetName, rows] of facetArea) {
      const g = slot();                       // new row
      /* facet label (no `.attrs` helper needed) */
      g.append("text")
        .attr("x",           margin.left)
        .attr("y",           margin.top - 4*sizeFactor)
        .attr("font-family", "sans-serif")
        .attr("font-size",   12*sizeFactor)
        .attr("font-weight", "bold")
        .attr("fill",        "#444")
        .text(facetName);

      const chart = areaChart(g, {
        data      : rows,
        xScale    : xCurrent,
        sizeFactor,
        margin,
        height    : 90*sizeFactor
      });
      yOff += chart.height;
      facetUpdaters.push(chart.update);
    }
  }

  /* 7 ▸ finalise SVG ------------------------------------------ */
  svg.attr("height", yOff)
     .attr("viewBox", `0 0 ${svgWidth} ${yOff}`);

  /* 8 ▸ shared zoom (integer ticks preserved) ----------------- */
  const updaters = [pep.update, stack.update, seqcmp.update, area.update, ...facetUpdaters];
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
import { radioButtons } from "./components/radioButtons.js";

/* Colour peptides by */
const colourAttrInput = radioButtons(
  ["attribute_1", "attribute_2", "attribute_3"],
  { label: "Colour peptides by:", value: "attribute_1" }
);
const colourAttr = Generators.input(colourAttrInput);

/* Sequence set */
const seqSetInput = radioButtons(
  ["All sequences", "Unique sequences"],
  { label: "Sequence set:", value: "All sequences" }
);
const seqSet = Generators.input(seqSetInput);

/* Cell colouring */
const colourModeInput = radioButtons(
  ["Mismatches", "Properties"],
  { label: "Cell colouring:", value: "Mismatches" }
);
const colourMode = Generators.input(colourModeInput);

const aaKeyEl = aaColourKey({
  label: "Amino-acid colour key",   // or "" to hide the heading
  square: 22,
  gap: 6,
  showGroupLabels: true
});
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

/* Area Chart Data */
const areaData = Array.from(
  d3.group(aaFrequencies, d => d.position),
  ([position, rows]) => {
    const top = rows.reduce((a, b) =>
      b.value_selected > a.value_selected ? b : a
    );
    return {
      position : +position,
      value    : top.value_selected,
      aminoacid: top.aminoacid
    };
  }
).sort((a, b) => d3.ascending(a.position, b.position));

/* ─── reference (aligned) sequence rows ───────────────────── */
const refAligned = fastaAligned.find(d => d.protein === proteinCommitted )
                     ?.aligned_sequence ?? "";               // empty string if none
const refRows = refAligned.split("")
  .map((aa,i)=>({ position:i+1, aminoacid:aa }));

/* ─── consensus rows (respecting the All / Unique toggle) ─── */
const consensusRows = Array.from(
  d3.rollups(
    aaFrequencies,
    v => v.reduce((m,r)=> r.value_selected>m.value_selected? r : m),
    d => d.position
  ),
  ([pos, r]) => ({ position:+pos, aminoacid:r.aminoacid })
).sort((a,b)=>d3.ascending(a.position,b.position));

/* facetArea :  Map<facetKey → [{position,value,aminoacid}]> */
const facetArea = new Map();


if (positionFacetStats !== null) {
  const rows = await positionFacetStats.toArray();

  /* choose the right value column once */
  const valueField = (seqSet === "Unique sequences" ? "value_unique" : "value");

  for (const [facetKey, groupRows] of d3.group(rows, d => d.facet)) {
    const areaRows = Array.from(
      d3.group(groupRows, d => d.position),
      ([position, posRows]) => {
        const top = posRows.reduce(
          (m, x) => (x[valueField] > m[valueField] ? x : m)
        );
        return {
          position : +position,
          value    : Number(top[valueField]),
          aminoacid: top.aminoacid
        };
      }
    ).sort((a,b)=>d3.ascending(a.position,b.position));

    facetArea.set(facetKey ?? "Unknown", areaRows);   // null → "Unknown"
  }
}

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

/* ─── 5. merge frequencies (may be empty for the click) ──────────── */
combined AS (
  SELECT
    COALESCE(ca.peptide, cu.peptide)                  AS peptide,

    /* all sequences */
    CAST(COALESCE(ca.cnt_all,0)  AS INT)              AS frequency_all,
    CAST(ta.total_all           AS INT)               AS total_all,
    CASE WHEN ta.total_all = 0
         THEN 0.0
         ELSE COALESCE(ca.cnt_all,0) * 1.0 / ta.total_all
    END                                               AS proportion_all,

    /* unique sequences */
    CAST(COALESCE(cu.cnt_unique,0) AS INT)            AS frequency_unique,
    CAST(tu.total_unique          AS INT)             AS total_unique,
    CASE WHEN tu.total_unique = 0
         THEN 0.0
         ELSE COALESCE(cu.cnt_unique,0) * 1.0 / tu.total_unique
    END                                               AS proportion_unique
  FROM        counts_all  AS ca
  FULL  JOIN  counts_u    AS cu USING (peptide)
  CROSS JOIN  total_all   AS ta
  CROSS JOIN  total_u     AS tu
),

/* ─── 6. guaranteed filler row for the clicked peptide ───────────── */
selected_filler AS (
  SELECT
    params.sel_peptide                     AS peptide,
    0                                      AS frequency_all,
    CAST(ta.total_all      AS INT)         AS total_all,        -- ← CAST!
    0.0                                    AS proportion_all,
    0                                      AS frequency_unique,
    CAST(tu.total_unique   AS INT)         AS total_unique,     -- ← CAST!
    0.0                                    AS proportion_unique
  FROM params, total_all AS ta, total_u AS tu
)

 /* ─── 7. final ordered result ------------------------------------- */
SELECT *
FROM   combined
WHERE  peptide <> (SELECT sel_peptide FROM params)   -- others first

UNION ALL
/* existing row for the click (if it exists) */
SELECT *
FROM   combined
WHERE  peptide = (SELECT sel_peptide FROM params)

UNION ALL
/* synthetic zero-frequency row if the click was unseen */
SELECT *
FROM   selected_filler
WHERE  NOT EXISTS (
  SELECT 1 FROM combined
  WHERE  peptide = (SELECT sel_peptide FROM params)
);
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
  data        : heatmapData,                        // peptides (ungapped)
  selected    : selectedPeptide,                    // may include '-'
  colourMode  : colourMode,
  // ── NEW overlay props:
  alleleData  : chartRowsI,                         // cache + API (snake_case)
  alleles     : Array.from(alleleCtrl1.value || []),
  mode        : percMode,                           // "EL" | "BA"
  showAlleles : true,
  baseCell    : 28,
  height0     : 280,
  margin      : { top:20, right:150, bottom:20, left:4 }
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


```js
/* -------- facetChoices  ────────────────────────────────────────────
   Re-evaluates automatically whenever any committed filter changes.
   A facet option appears only when the user has at least ONE value
   selected for that attribute.                                        */
const facetChoices = (() => {
  const list = ["None"];                 // always available

  if (genotypesCommitted.length) list.push("Genotype");
  if (hostsCommitted.length)     list.push("Host");
  if (countriesCommitted.length) list.push("Country");

  return list;
})();
```
```js

/* -------- radio input  ─────────────────────────────────────────────
   Re-created every time `facetChoices` changes, so the UI never
   shows options that would facet the *entire* data set.                */
const facetSelectInput = Inputs.radio(
  facetChoices,
  {
    label : "Facet by:",
    value : facetChoices[0]              // whichever is first (“None”)
  }
);
const facetSelect = Generators.input(facetSelectInput);


```

```js
/* ------------------------------------------------------------------ *
 *  positionFacetStats  – runs ONLY when the user has chosen a facet  *
 *  ----------------------------------------------------------------- *
 *  facetSelect   : "None" | "Genotype" | "Host" | "Country"
 *  ────────────────────────────────────────────────────────────────── */

/* positionFacetStats – new guard clause -------------------------- */
const positionFacetStats =
  (facetSelect === "None" || noExtraFilters())
    ? null                                     // fully skip the query
    : db.sql`
      WITH
      /* -------- choose the facet column once ---------------------- */
      proteins_faceted AS (
        SELECT
          ${
            facetSelect === "Genotype"
              ? sql`genotype`
              : facetSelect === "Host"
                ? sql`host`
                : sql`country`
          }  AS facet,
          *
        FROM proteins
      ),

      /* -------- apply the SAME filter clauses as positionStats ---- */
      filtered AS (
        SELECT *
        FROM   proteins_faceted
        WHERE  protein = ${proteinCommitted}

          /* Genotype filter */
          AND ${
            genotypesCommitted.length
              ? sql`genotype IN (${ genotypesCommitted })`
              : sql`TRUE`
          }

          /* Host filter */
          AND ${
            hostsCommitted.length
              ? sql`host IN (${ hostsCommitted })`
              : sql`TRUE`
          }

          /* Host-category check-boxes */
          AND ${
            hostCategoryCommitted.includes('Human') &&
            !hostCategoryCommitted.includes('Non-human')
              ? sql`host = 'Homo sapiens'`
              : (!hostCategoryCommitted.includes('Human') &&
                 hostCategoryCommitted.includes('Non-human'))
                  ? sql`host <> 'Homo sapiens'`
                  : sql`TRUE`
          }

          /* Country filter */
          AND ${
            countriesCommitted.length
              ? sql`country IN (${ countriesCommitted })`
              : sql`TRUE`
          }

          /* Collection-date window */
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

          /* Release-date window */
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

      /* ─────────────── 3-A. ALL-sequence tallies ─────────────────── */
      parsed_a AS (
        SELECT facet, sequence, LENGTH(sequence) AS len
        FROM   filtered
      ),
      pos_a AS (
        SELECT facet, p.sequence, gs.position
        FROM   parsed_a AS p
        CROSS  JOIN generate_series(1, p.len) AS gs(position)
      ),
      chars_a AS (
        SELECT facet, position,
               SUBSTRING(sequence, position, 1) AS aminoacid
        FROM   pos_a
      ),
      counts_a AS (
        SELECT facet, position, aminoacid, COUNT(*) AS cnt_all
        FROM   chars_a
        GROUP  BY facet, position, aminoacid
      ),
      totals_a AS (
        SELECT facet, position, SUM(cnt_all) AS total_all
        FROM   counts_a
        GROUP  BY facet, position
      ),

      /* ─────────────── 3-B. UNIQUE-sequence tallies ──────────────── */
      filtered_u AS ( SELECT DISTINCT facet, sequence FROM filtered ),
      parsed_u AS (
        SELECT facet, sequence, LENGTH(sequence) AS len
        FROM   filtered_u
      ),
      pos_u AS (
        SELECT facet, p.sequence, gs.position
        FROM   parsed_u AS p
        CROSS  JOIN generate_series(1, p.len) AS gs(position)
      ),
      chars_u AS (
        SELECT facet, position,
               SUBSTRING(sequence, position, 1) AS aminoacid
        FROM   pos_u
      ),
      counts_u AS (
        SELECT facet, position, aminoacid, COUNT(*) AS cnt_unique
        FROM   chars_u
        GROUP  BY facet, position, aminoacid
      ),
      totals_u AS (
        SELECT facet, position, SUM(cnt_unique) AS total_unique
        FROM   counts_u
        GROUP  BY facet, position
      ),

      /* ─────────────── 4. Merge & final projection ──────────────── */
      combined AS (
        SELECT
          COALESCE(ca.facet, cu.facet)         AS facet,
          COALESCE(ca.position, cu.position)   AS position,
          COALESCE(ca.aminoacid, cu.aminoacid) AS aminoacid,

          /* all-sequence metrics */
          CAST(COALESCE(ca.cnt_all,0)  AS INT) AS frequency_all,
          CAST(ta.total_all            AS INT) AS total_all,
          CASE WHEN ta.total_all = 0
               THEN 0.0
               ELSE COALESCE(ca.cnt_all,0)*1.0 / ta.total_all
          END                                  AS value,

          /* unique-sequence metrics */
          CAST(COALESCE(cu.cnt_unique,0) AS INT) AS frequency_unique,
          CAST(tu.total_unique           AS INT) AS total_unique,
          CASE WHEN tu.total_unique = 0
               THEN 0.0
               ELSE COALESCE(cu.cnt_unique,0)*1.0 / tu.total_unique
          END                                  AS value_unique
        FROM        counts_a  AS ca
        FULL JOIN   counts_u  AS cu
          USING (facet, position, aminoacid)
        LEFT JOIN   totals_a  AS ta
          USING (facet, position)
        LEFT JOIN   totals_u  AS tu
          USING (facet, position)
      )

      SELECT *
      FROM   combined
      ORDER  BY facet, position, aminoacid
    `
;

```

```js
/*****************************************************************
 * 1.  Prepare an in-memory table of all aligned peptides
 *****************************************************************/
const peptideParams = peptidesAligned
  .filter(d => d.peptide_aligned && d.start)   // only usable rows
  .map(d => ({
    protein : d.protein,
    peptide : d.peptide_aligned,
    start   : d.start,           // 1-based aligned start
    len     : d.aligned_length
  }));  
```

```js
const joinSql = (arr, sep = sql`, `) =>
  arr.reduce((acc, cur, i) => (i === 0 ? cur : sql`${acc}${sep}${cur}`), sql``);

/*****************************************************************
 * 2 · build VALUES rows for every uploaded peptide
 *****************************************************************/
const peptideValues = peptidesAligned
  .filter(d => d.peptide_aligned && d.start)          // skip unusable rows
  .map(r =>
    sql`(${r.protein}, ${r.peptide_aligned},
         ${r.start}, ${r.aligned_length})`
  );
```

```js
/* ------------------------------------------------------------------
   Create a SINGLE memo‑cache on the global object (survives reloads)
   ------------------------------------------------------------------*/
if (!globalThis.__peptideCache) {
  globalThis.__peptideCache = { key: null, table: null };
}

```



```js
/********************************************************************
 * getPeptidePropsAll()    · v2                                      *
 * ‑ re‑runs only when:                                              *
 *     • any non‑protein filter changes, OR                          *
 *     • the uploaded peptide set changes (length)                   *
 ********************************************************************/
function getPeptidePropsAll() {

  /* 1. build a key that now ALSO tracks the peptide list size */
  const filterKey = JSON.stringify({
    genotypes       : [...genotypesCommitted].sort(),
    hosts           : [...hostsCommitted].sort(),
    hostCategory    : [...hostCategoryCommitted].sort(),
    countries       : [...countriesCommitted].sort(),
    collectionDates : collectionDatesCommitted,
    releaseDates    : releaseDatesCommitted,
    nPeptides       : peptideValues.length            // ← NEW
  });

  /* 2. return cached table when key matches ----------------------- */
  if (globalThis.__peptideCache?.key === filterKey &&
      globalThis.__peptideCache.table) {
    return globalThis.__peptideCache.table;              // ⚡ hit
  }

  /* 3. if still no peptides, return an empty table ---------------- */
  if (peptideValues.length === 0) {
    const empty = db.sql`SELECT NULL::VARCHAR AS protein LIMIT 0`;
    globalThis.__peptideCache = { key: filterKey, table: empty };
    return empty;
  }

  /* 4. heavy query (exact body unchanged) ------------------------ */
  const table = db.sql`
    WITH
      params(protein, peptide, start, len) AS (
        VALUES ${joinSql(peptideValues)}
      ),

    /* 2. filtered proteins (all active filters EXCEPT protein) ---- */
    filtered AS (
      SELECT *
      FROM   proteins
      WHERE  1 = 1
        AND (${genotypesCommitted.length
                ? sql`genotype IN (${genotypesCommitted})` : sql`TRUE`})
        AND (${hostsCommitted.length
                ? sql`host IN (${hostsCommitted})` : sql`TRUE`})
        AND (${hostCategoryCommitted.includes('Human') &&
               !hostCategoryCommitted.includes('Non-human')
                ? sql`host = 'Homo sapiens'`
                : (!hostCategoryCommitted.includes('Human') &&
                   hostCategoryCommitted.includes('Non-human'))
                    ? sql`host <> 'Homo sapiens'` : sql`TRUE`})
        AND (${countriesCommitted.length
                ? sql`country IN (${countriesCommitted})` : sql`TRUE`})

        /* collection‑date window */
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
              ` : sql`TRUE`
        }

        /* release‑date window */
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
              ` : sql`TRUE`
        }
    ),

    /* 3. all‑sequence tallies ------------------------------------ */
    ex_all AS (
      SELECT p.protein, p.peptide, COUNT(*) AS cnt_all
      FROM   filtered f
      JOIN   params   p
        ON   f.protein = p.protein
       AND   SUBSTR(f.sequence,
                    CAST(p.start AS BIGINT),
                    CAST(p.len   AS BIGINT)) = p.peptide
      GROUP BY p.protein, p.peptide
    ),
    tot_all AS (
      SELECT protein, COUNT(*) AS total_all
      FROM   filtered
      GROUP  BY protein
    ),

    /* 4. unique‑sequence tallies --------------------------------- */
    filtered_u AS ( SELECT DISTINCT protein, sequence FROM filtered ),
    ex_u AS (
      SELECT p.protein, p.peptide, COUNT(*) AS cnt_unique
      FROM   filtered_u fu
      JOIN   params     p
        ON   fu.protein = p.protein
       AND   SUBSTR(fu.sequence,
                    CAST(p.start AS BIGINT),
                    CAST(p.len   AS BIGINT)) = p.peptide
      GROUP BY p.protein, p.peptide
    ),
    tot_u AS (
      SELECT protein, COUNT(*) AS total_unique
      FROM   filtered_u
      GROUP  BY protein
    ),

    /* 5. merge ---------------------------------------------------- */
    combined AS (
      SELECT
        p.protein,
        p.peptide,

        /* all sequences */
        CAST(COALESCE(a.cnt_all,0)  AS INT) AS frequency_all,
        CAST(ta.total_all           AS INT) AS total_all,
        CASE WHEN ta.total_all = 0
             THEN 0.0
             ELSE COALESCE(a.cnt_all,0)*1.0/ta.total_all
        END                                 AS proportion_all,

        /* unique sequences */
        CAST(COALESCE(u.cnt_unique,0) AS INT) AS frequency_unique,
        CAST(tu.total_unique          AS INT) AS total_unique,
        CASE WHEN tu.total_unique = 0
             THEN 0.0
             ELSE COALESCE(u.cnt_unique,0)*1.0/tu.total_unique
        END                                 AS proportion_unique
      FROM   params        p
      LEFT   JOIN ex_all   a  USING (protein, peptide)
      LEFT   JOIN tot_all  ta USING (protein)
      LEFT   JOIN ex_u     u  USING (protein, peptide)
      LEFT   JOIN tot_u    tu USING (protein)
    )

    SELECT *
    FROM   combined
    ORDER  BY protein, proportion_all DESC;
  `;

  /* ----- update cache & return ----------------------------------- */
  globalThis.__peptideCache = { key: filterKey, table };
  return table;
}
```


```js
/* Keeps the old name so downstream cells don’t change */
const peptidePropsAll = getPeptidePropsAll();
```

```js
const histEl = histogramChart({
  data      : await peptidePropsAll.toArray(),
  useUnique : seqSet === "Unique sequences"
})
```

```js
/* ────────────────────────────────────────────────────────────────
   NetMHC-pan integration – Class I & II
   - Appears *below* the existing dashboard cards for now
──────────────────────────────────────────────────────────────── */

const statusBanner = html`<div style="margin:0.5rem 0; font-style:italic;"></div>`;
function setBanner(msg) { statusBanner.textContent = msg; }

/* ▸ RUN buttons -------------------------------------------------- */
const runBtnI  = runButton("Run Class I (EL + BA)");
const runBtnII = runButton("Run Class II (EL + BA)");

// keep your existing reactive plumbing
const trigI  = Generators.input(runBtnI);
const trigII = Generators.input(runBtnII);



/* commit helper */
const commitTo = (btn, element) =>
  Generators.observe(change => {
    const update = () => change(element.value);
    update();
    btn.addEventListener("input", update);
    return () => btn.removeEventListener("input", update);
  });
```

```js
/* ▸ state holders ------------------------------------------------ */
const resultsArrayI = Mutable([]);
const resultsArrayII = Mutable([]);

const excludedI = Mutable([]);      // peptides <8 or >14
const excludedII = Mutable([]);     // peptides <11 or >30
```

```js
/* ▸ helpers to talk to IEDB -------------------------------------- */
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
    method:"POST",
    headers:{"content-type":"application/json"},
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  const j   = (()=>{try{return JSON.parse(txt);}catch{return txt;}})();
  if (!r.ok) throw new Error(j.errors?.join("; ") || r.statusText);
  return j.results_uri.split("/").pop();       // result_id
}

async function poll(resultId, timeout = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await fetch(`/api/iedb-result?id=${resultId}`);
    const txt = await r.text();
    const j   = (()=>{try{return JSON.parse(txt);}catch{return txt;}})();
    if (j.status === "done")
      return j.data?.results?.find(t => t.type === "peptide_table");
    await new Promise(res => setTimeout(res, 1000));
  }
  throw new Error("Timed out");
}

function rowsFromTable(tbl) {
  const keys = tbl.table_columns.map(c => c.display_name || c.name);
  return tbl.table_data.map(r => Object.fromEntries(r.map((v,i)=>[keys[i],v])));
}

/* ▸ peptide-upload helper (re-uses existing peptideFile) ---------- */
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

/* ▸ parse uploaded peptide table with protein column ------------- */
async function parsePeptideTable(file) {
  if (!file) return [];
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map(s => s.trim());
  const lower   = headers.map(h => h.toLowerCase());
  const iPep    = lower.indexOf("peptide");
  const iProt   = lower.indexOf("protein");

  if (iPep < 0) return []; // must have peptide column

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const pep  = cols[iPep]?.trim()?.toUpperCase();
    const prot = iProt >= 0 ? cols[iProt]?.trim() : null;
    if (pep) out.push({ peptide: pep, protein: prot });
  }
  return out;
}

```

```js
/* committed protein id — reactive */
function normalizeProteinId(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.id ?? v.value ?? v.protein ?? null;
  return null;
}

const committedProteinId = (() => {
  const raw = proteinCommitted;        // ← establish reactive dependency
  const id  = normalizeProteinId(raw);
  const out = id ? String(id).trim().toUpperCase() : null;
  return out;
})();



```

```js
/* ── Unified schema (snake_case) for Class I rows ─────────────── */
const keyMapI = {
  // API display names → snake_case
  "peptide": "peptide",
  "allele": "allele",
  "netmhcpan_el percentile": "netmhcpan_el_percentile",
  "netmhcpan_ba percentile": "netmhcpan_ba_percentile",
  "netmhcpan_el score": "netmhcpan_el_score",
  "netmhcpan_ba ic50": "netmhcpan_ba_ic50"
  // add more if you need them in the UI
};

/* Cache rows are already snake_case → pass-through */
function normalizeRowI_cache(r) { return r; }

/* API table rows (display headers) → snake_case */
function normalizeRowI_api(r) {
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    out[keyMapI[k] || k] = v;
  }
  return out;
}

```

```js
/* ▸ peptides for Class I preview (derived from uploaded peptideFile) */
const peptidesI = await (async () => {
  if (!peptideFile) return [];
  const all = await parsePeptides(peptideFile);
  return all.filter(p => p.length >= 8 && p.length <= 14);
})();

```

```js
const cachePreviewI = await (async () => {
  selectedI;
  committedProteinId;

  const alleles = Array.from(alleleCtrl1.value || []);
  const peps    = peptidesICommitted;

  if (!committedProteinId || !alleles.length || !peps.length) return [];

  const cacheRows = (
    await db.sql`
      SELECT *
      FROM   netmhccalc
      WHERE  allele  IN (${alleles})
        AND  peptide IN (${peps})
    `
  ).toArray();

  return cacheRows; // ← keep snake_case
})();



```

```js
/* merged rows for the chart — STRICT to committed protein (snake_case) */
const chartRowsI = (() => {
  selectedI;
  committedProteinId;

  if (!committedProteinId) return [];

  const allelesNow = new Set(alleleCtrl1.value || []);
  if (!allelesNow.size) return [];

  const allowed = new Set(peptidesICommitted); // ungapped peptides
  if (!allowed.size) return [];

  const map = new Map();

  // cached rows (already snake_case)
  for (const r of cachePreviewI) {
    if (allowed.has(r.peptide) && allelesNow.has(r.allele)) {
      map.set(`${r.allele}|${r.peptide}`, normalizeRowI_cache(r));
    }
  }

  // API rows (display → snake_case)
  const apiRows = Array.isArray(runResultsI) ? runResultsI : [];
  for (const r of apiRows) {
    const row = normalizeRowI_api(r);
    if (allowed.has(row.peptide) && allelesNow.has(row.allele)) {
      map.set(`${row.allele}|${row.peptide}`, row);
    }
  }

  return [...map.values()];
})();



```

```js
{
  Object.defineProperty(globalThis, "debugNetMHC", {
    configurable: true,
    get() {
      return {
        get selectedI()     { return [...selectedI]; },
        get peptidesI()     { return peptidesI; },
        get cachePreviewI() { return cachePreviewI; },
        get runResultsI()   { return runResultsI; },
        get resultsI()      { return resultsArrayI.value; }, // value (array) for CSV
        get chartRowsI()    { return chartRowsI; }
      };
    }
  });
  console.debug("debugNetMHC ready → try:", "debugNetMHC.chartRowsI.length");
}


```

```js
/* ▸ RUN results – Class I  (reactive to button click; per-allele missing) */
const runResultsI = await (async () => {
  trigI;                           // re-run when Run Class I is clicked

  if (!peptideFile) return [];
  setBanner("Class I: starting…");

  const alleles = Array.from(alleleCtrl1.value || []);  // Class I
  const allPeps = await parsePeptides(peptideFile);
  const okPeps  = allPeps.filter(p => p.length >= 8 && p.length <= 14);
  excludedI.value = allPeps.filter(p => p.length < 8 || p.length > 14);

  if (!alleles.length) { setBanner("Class I: no alleles selected."); return []; }
  if (!okPeps.length)  { setBanner("Class I: no peptides in 8-14 range."); return []; }

  console.debug("Run I start", { alleles, okPeps: okPeps.length });

  /* 1 ▸ pull any existing predictions from netmhccalc */
  const cacheRows = (
    await db.sql`
      SELECT *
      FROM   netmhccalc
      WHERE  allele IN (${alleles})
        AND  peptide IN (${okPeps})
    `
  ).toArray();

  // cacheSet is over unique (allele|peptide) pairs
  const cacheSet = new Set(cacheRows.map(r => `${r.allele}|${r.peptide}`));
  const cachedConverted = cacheRows.map(convertCacheRowI);

  /* 2 ▸ compute missing peptides per allele */
  const missingByAllele = new Map();
  for (const al of alleles) {
    const miss = [];
    for (const p of okPeps) {
      if (!cacheSet.has(`${al}|${p}`)) miss.push(p);
    }
    if (miss.length) missingByAllele.set(al, miss);
  }

  // If everything is cached for all alleles, we’re done.
  if (missingByAllele.size === 0) {
    const merged = [...new Map(cachedConverted.map(r => [`${r.allele}|${r.peptide}`, r])).values()];
    resultsArrayI.value = merged;
    setBanner(`Class I: all ${merged.length} rows from cache ✅`);
    console.debug("resultsArrayI after run", { len: resultsArrayI.value.length, sample: resultsArrayI.value[0] });
    return merged;
  }

  /* 3 ▸ build API request only for alleles that have missing peptides */
  const allelesToQuery = [...missingByAllele.keys()];
  const unionMissingPeps = [...new Set([].concat(...allelesToQuery.map(al => missingByAllele.get(al))))];

  const fasta = unionMissingPeps.map((p,i)=>`>p${i+1}\n${p}`).join("\n");

  try {
    const id  = await submit(buildBodyI(allelesToQuery, fasta));
    setBanner("Class I: polling…");
    const tbl = await poll(id);
    const apiRows = rowsFromTable(tbl);

    /* 4 ▸ merge cache + fresh rows (API rows win on duplicates) */
    const map = new Map();
    for (const r of cachedConverted) map.set(`${r.allele}|${r.peptide}`, r);
    for (const r of apiRows)       map.set(`${r.allele}|${r.peptide}`, r);

    // Accurate counts:
    const apiKeySet = new Set(apiRows.map(r => `${r.allele}|${r.peptide}`));
    const newCount  = [...apiKeySet].filter(k => !cacheSet.has(k)).length;   // truly new pairs
    const cacheHit  = cacheSet.size;                                         // unique cached pairs
    const totalRows = map.size;

    const merged = [...map.values()];
    resultsArrayI.value = merged;  // keep CSV button working

    setBanner(`Class I done — ${totalRows} rows (cache ${cacheHit} + new ${newCount}).`);
    console.debug("resultsArrayI after run", { len: resultsArrayI.value.length, sample: resultsArrayI.value[0] });
    return merged;
  } catch (err) {
    setBanner(`Class I error: ${err.message}`);
    return [];
  }
})();

```

```js
/* ▸ RUN pipeline – Class II -------------------------------------- */
trigII;                     // make cell reactive
(async () => {
  if (!peptideFile) return;
  setBanner("Class II: starting…");

  const alleles = Array.from(alleleCtrl2.value || []);  // Class II
  const allPeps = await parsePeptides(peptideFile);
  const okPeps  = allPeps.filter(p => p.length >= 11 && p.length <= 30);
  excludedII.value = allPeps.filter(p => p.length < 11 || p.length > 30);

  if (!alleles.length)  return setBanner("Class II: no alleles selected.");
  if (!okPeps.length)   return setBanner("Class II: no peptides in 11-30 range.");

  const fasta = okPeps.map((p,i)=>`>p${i+1}\n${p}`).join("\n");
  try {
    const id  = await submit(buildBodyII(alleles, fasta));
    setBanner("Class II: polling…");
    const tbl = await poll(id);
    resultsArrayII.value = rowsFromTable(tbl);
    setBanner(`Class II done — ${resultsArrayII.value.length} rows.`);
  } catch (err) {
    setBanner(`Class II error: ${err.message}`);
  }
})();
```

```js
/* ▸ CSV download helpers ----------------------------------------- */
function makeDownloadButton(label, rowsMut, filename) {
  const btn = Inputs.button(label);
  btn.onclick = () => {
    const rows = rowsMut.value;
    if (!rows.length) { alert(`No ${label.toLowerCase()} yet.`); return; }
    const cols = Object.keys(rows[0]);
    const csv  = [
      cols.join(","), ...rows.map(r => cols.map(c => r[c]).join(","))
    ].join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {href:url, download:filename}).click();
    URL.revokeObjectURL(url);
  };
  return btn;
}

const downloadCSVI  = makeDownloadButton("Download Class-I CSV",
                                         resultsArrayI,  "mhcI_predictions.csv");
const downloadCSVII = makeDownloadButton("Download Class-II CSV",
                                         resultsArrayII, "mhcII_predictions.csv");
```

```js
/* ▸ uploaded peptides table + committed-protein slice (Class I) -- */
const uploadedPeptidesTable = await parsePeptideTable(peptideFile);


/* peptides for Class I, scoped to committed protein (reactive) */
const peptidesICommitted = (() => {
  const pid = committedProteinId;         // ← dependency
  if (!pid) return [];
  return peptidesClean
    .filter(r => (r.protein || "").toUpperCase() === pid)
    .map(r => (r.peptide || "").toUpperCase())
    .filter(p => p.length >= 8 && p.length <= 14);
})();



```






<!-- ─── NetMHC-pan controls & downloads (temporary position) ─── -->
<div class="card" style="margin-top:1rem; display:flex; flex-direction:column; gap:0.75rem;">
  ${statusBanner}
  ${alleleCtrl1}
  ${alleleCtrl2}
  ${runBtnI}
  ${runBtnII}
  ${downloadCSVI}
  ${downloadCSVII}
  ${percentileModeInput}
  ${mhcClassInput}
</div>


```js
/* external radios – place these with your other controls */
const percentileModeInput = Inputs.radio(["EL","BA"], {
  label : "Percentile type:",
  value : "EL"
});
const mhcClassInput = Inputs.radio(["Class I","Class II"], {
  label : "MHC class:",
  value : "Class I"
});
const percMode = Generators.input(percentileModeInput);
const mhcClass = Generators.input(mhcClassInput);

/* allele plot — reactive to allele picks and Apply (protein) */
selectedI;
committedProteinId;

const allelePlot = alleleChart({
  data      : chartRowsI,
  alleles   : Array.from(alleleCtrl1.value || []),
  mode      : percentileModeInput,
  classType : "I",
  baseCell  : 28,
  margin    : { top: 40, right: 20, bottom: 20, left: 140 },
  showNumbers: false
});




// Build the allele-chart element reactively (preview from cache, then API)



```


```js
import {comboSelectLazy} from "./components/comboSelectLazy.js";

```

```js
/* HLA fetchers (on-demand from DuckDB) -------------------------- */
const PAGE_LIMIT_DEFAULT = 50;  // when searching (≥2 chars)
const PAGE_LIMIT_INITIAL = 20;  // first display when q === ""

/* cls: "I" | "II"; q: string; offset/limit: paging */
async function fetchAlleles(cls, q = "", offset = 0, limit = PAGE_LIMIT_DEFAULT) {
  const like = `%${q}%`;
  const filterLike = q.length >= 2 ? sql`AND allele ILIKE ${like}` : sql``;

  const rows = (await db.sql`
    WITH base AS (
      SELECT 'I'  AS class, TRIM("Class I")  AS allele
      FROM   hla
      WHERE  "Class I"  IS NOT NULL
         AND LENGTH(TRIM("Class I"))  > 0

      UNION ALL

      SELECT 'II' AS class, TRIM("Class II") AS allele
      FROM   hla
      WHERE  "Class II" IS NOT NULL
         AND LENGTH(TRIM("Class II")) > 0
    ),
    dedup AS ( SELECT DISTINCT class, allele FROM base )

    SELECT allele
    FROM   dedup
    WHERE  class = ${cls} ${filterLike}
    ORDER  BY allele
    LIMIT  ${limit} OFFSET ${offset}
  `).toArray();

  // extra guard (in case)
  return rows.map(r => r.allele).filter(s => s && s.trim().length);
}
```

```js
import {comboSelectLazy} from "./components/comboSelectLazy.js";

/* ▸ allele lists (lazy) ----------------------------------------- */
const alleleCtrl1 = comboSelectLazy({
  label: "Class I alleles (MHCI)",
  placeholder: "Type class-I allele…",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,          // show 20 on focus
  pageLimit: 50,             // fetch 50 at a time when q ≥ 2
  fetch: ({ q, offset, limit }) => fetchAlleles("I", q, offset, limit)
});
const selectedI = Generators.input(alleleCtrl1);

const alleleCtrl2 = comboSelectLazy({
  label: "Class II alleles (MHCII)",
  placeholder: "Type class-II allele…",
  fontFamily: "'Roboto', sans-serif",
  initialLimit: 20,
  pageLimit: 50,
  fetch: ({ q, offset, limit }) => fetchAlleles("II", q, offset, limit)
});
const selectedII = Generators.input(alleleCtrl2);

/* commit helper must run AFTER the controls exist */
const committedI  = commitTo(runBtnI , alleleCtrl1);
const committedII = commitTo(runBtnII, alleleCtrl2);
```