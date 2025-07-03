---
theme: [wide, air]
title: Influenza B (IBV)
slug: IBV
toc: false
sql:
    proteins: data/IBV_all.parquet
    sequencecalc: data/IBV_sequencecalc.parquet
---

```js
const datasets = [
  { id: "M1", label: "M1" },
  { id: "HA", label: "HA" },
  { id: "BM2", label: "BM2" },
  { id: "NA", label: "NA" },
  { id: "NB", label: "NB" },
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
    keyof:  d => d.label,
    valueof: d => d.id
  })
);

const genotype = view(Inputs.text({
  label: "Genotype:",
  placeholder: "e.g. H5N1",
  submit: true
}));

const country = view(Inputs.text({
  label: "Country:",
  placeholder: "e.g. USA",
  submit: true
}));

const uniqueSequences = view(Inputs.toggle({label: "Unique:", value: false}));

const  togglecolour = view(Inputs.toggle({label: "Toggle Colour", value: false}));
```

```js
// ─── 1. A saveSvg helper ─────────────────────────────────────────────────
function saveSvg(svgEl, fileName) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgEl);
  // ensure namespace
  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(source)) {
    source = source.replace(
      /^<svg/,
      '<svg xmlns="http://www.w3.org/2000/svg"'
    );
  }
  // add XML declaration
  source = '<?xml version="1.0" standalone="no"?>\n' + source;
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

```sql id=sequenceCalc display
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

```js
const referencefasta = view(Inputs.file({label: "FASTA file", accept: ".fasta", required: true}));
```

```js
/*****************************************************************
 * 1️⃣  Load the pre-computed Parquet and normalise “position”
 *****************************************************************/
/*****************************************************************
 * 1️⃣  Load the pre-computed Parquet and normalise “position”
 *     (Arrow Table → Array → cast BigInt → Number)
 *****************************************************************/
const seqCalcAll = (
  await FileAttachment("data/IBV_sequencecalc.parquet").parquet()
)
  .toArray()                      // Arrow → plain JS rows
  .map(r => ({
    ...r,
    position         : Number(r.position),
    frequency_all    : Number(r.frequency_all),
    total_all        : Number(r.total_all),
    frequency_unique : Number(r.frequency_unique),
    total_unique     : Number(r.total_unique)
  }));

```

```js
/* helper – canonicalise protein names the same way everywhere */
const normProtein = s => s.trim().replace(/\s+/g, "").toUpperCase();

/* aaSetsByProtein : Map<canonical protein → Array<Set(residues)>> */
const aaSetsByProtein = new Map();

for (const { protein, position, aminoacid } of seqCalcAll) {
  const key = normProtein(protein);
  if (!aaSetsByProtein.has(key)) aaSetsByProtein.set(key, []);
  const arr = aaSetsByProtein.get(key);
  while (arr.length < position) arr.push(new Set());   // pad out
  arr[position - 1].add(aminoacid);
}
```

```js
function nwConstrained(ref, sets, gap = -1) {
  const M = sets.length, N = ref.length;
  const S = Array.from({ length: M + 1 }, () => Array(N + 1).fill(-Infinity));
  const T = Array.from({ length: M + 1 }, () => Array(N + 1).fill(""));

  S[0][0] = 0;
  for (let i = 1; i <= M; ++i) { S[i][0] = i * gap; T[i][0] = "↑"; }
  for (let j = 1; j <= N; ++j) { S[0][j] = j * gap; T[0][j] = "←"; }

  for (let i = 1; i <= M; ++i) {
    for (let j = 1; j <= N; ++j) {
      const match =
        sets[i - 1].has(ref[j - 1]) || sets[i - 1].has("X") ? 1 : -Infinity;
      const diag = S[i - 1][j - 1] + match;
      const up   = S[i - 1][j]     + gap;
      const left = S[i][j - 1]     + gap;
      const best = Math.max(diag, up, left);
      S[i][j] = best;
      T[i][j] = best === diag ? "↖" : best === up ? "↑" : "←";
    }
  }

  let i = M, j = N, out = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && T[i][j] === "↖") { out.push(ref[--j]); --i; }
    else if (i > 0 && (j === 0 || T[i][j] === "↑")) { out.push("-"); --i; }
    else { --j; }                                       //  "←"
  }
  return out.reverse().join("");
}
```

```js
/* fastaAligned – [{ protein, raw_sequence, aligned_sequence }] */
const fastaAligned = referencefasta
  ? (await referencefasta.text())
      .trim()
      .split(/\r?\n>(?=[^\n])/g)
      .map(block => {
        const [head, ...seqLines] = block.replace(/^>/, "").split(/\r?\n/);
        const protein      = head.split("|")[0].trim();          // keep readable
        const canon        = normProtein(protein);               // canonical key
        const raw_sequence = seqLines.join("").trim();

        /* look up the residue-sets using the canonical name */
        const sets = aaSetsByProtein.get(canon);

        return {
          protein,
          raw_sequence,
          aligned_sequence: sets ? nwConstrained(raw_sequence, sets) : null
        };
      })
  : [];
```

```js
const peptideinput = view(Inputs.file({label: "CSV file", accept: ".csv", required: true}));
```

```js
/*  🅰  read file + header normalisation  ----------------------------- */
const peptidesRaw = peptideinput
  ? (await (await peptideinput.text()).trim())
      .split(/\r?\n/)                           // lines
      .map(line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) // naive CSV split
      .map(row => row.map(cell => cell.replace(/^"|"$/g, ""))) // strip quotes
      .reduce((acc, row, i, arr) => {
        if (i === 0) {                          // header line
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
  : [];                                         // no file picked yet

/*  keep only peptide / protein + first three attribute columns ------ */
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
/*  🅱  reference grids (built once)  --------------------------------- */
const alignRefMap = new Map(
  (fastaAligned ?? []).map(d => [d.protein, d.aligned_sequence])
);

/*  🅲  align peptide to reference (ignores gaps in reference) -------- */
/* alignPeptideToRef  – returns:
     start_raw   – 1-based coord in the ungapped reference
     start_aln   – 1-based coord in the gapped (aligned) reference
     aligned     – peptide string with any gaps preserved              */
function alignPeptideToRef(peptide, refAlign) {
  const p     = peptide.toUpperCase();
  const ungap = refAlign.replace(/-/g, "");

  /* A.  index in the ungapped reference ----------------------------- */
  const idxRaw = ungap.indexOf(p);          // 0-based
  if (idxRaw === -1) return { start_raw: null, start_aln: null, aligned: null };

  /* B.  translate that index into the ALIGNED coordinate ------------ */
  let rawCounter = 0, startAln = null;
  for (let i = 0; i < refAlign.length; ++i) {
    if (refAlign[i] !== "-") {
      if (rawCounter === idxRaw) { startAln = i + 1; break; }  // 1-based
      rawCounter++;
    }
  }

  /* C.  collect exactly p.length residues, keeping gaps ------------- */
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

/* peptidesAligned – one tidy table: protein, raw_sequence, aligned_sequence */
const peptidesAligned = peptidesClean.map(d => {
  const ref  = alignRefMap.get(d.protein);
  const { start_raw, start_aln, aligned } = ref
        ? alignPeptideToRef(d.peptide, ref)
        : { start_raw: null, start_aln: null, aligned: null };

  return {
    ...d,
    length           : d.peptide.length,
    start_raw        : start_raw,          // keep if you still need it
    start            : start_aln,          // ← use THIS in the plots
    peptide_aligned  : aligned,
    aligned_length   : aligned ? aligned.length : null
  };
});
```

```js
Inputs.table(peptidesAligned)
```

```js
html`
  <button style="margin-bottom:1em;"
          onclick=${() => {
            /* 1) sanity-check */
            if (!peptidesAligned?.length) {
              alert("No aligned-peptide data available.");
              return;
            }

            /* 2) convert to CSV text */
            const csv  = d3.csvFormat(peptidesAligned);

            /* 3) blob → temp link → download */
            const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = "peptides-aligned.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}>
    ⬇️ Download Aligned Peptides
  </button>
  <br/>`

```

```js
import { rollup } from "d3-array";
```

```js
const peptideR = peptidesAligned.filter(d => d.protein === tableName);
```

```js
// tooltip = a D3-managed <div> appended to the page
const tooltip = d3.select(document.body)
  .append("div")
  .attr("class","tooltip")
  .style("position",       "absolute")
  .style("pointer-events", "none")
  .style("background",     "white")
  .style("padding",        "6px")
  .style("border",         "1px solid #ccc")
  .style("border-radius",  "4px")
  .style("font-family",    "sans-serif")
  .style("font-size",      "12px")
  .style("line-height",    "1.2")
  .style("opacity",        0)
  .style("transition",     "opacity 0.1s ease-in-out")
  .style("z-index",        1000);

// ─── 1) Define your custom AA colour map ───────────────────────────────
const aaColors = {
  P: "#8acb97",
  W: "#77c385",
  G: "#63ba74",
  A: "#50b262",
  M: "#3ca951",
  F: "#369849",
  L: "#308741",
  V: "#2a7639",
  I: "#246531",
  C: "#7b96de",
  T: "#6887d9",
  S: "#5578d5",
  Y: "#4269d0",
  N: "#3b5fbb",
  Q: "#3554a6",
  H: "#FF806C",
  K: "#FF725C",
  R: "#E66753",
  E: "#ffe761",
  D: "#ffd500",
  X: "#757171",
  "-": "#D9D9D9"
};
```

```js
/*****************************************************************
 * 2️⃣  Bring `sequenceCalc` (DuckDB result) into JS -- but cast
 *     every 64-bit integer column to a normal Number first.
 *****************************************************************/
const aaFrequencies = (await sequenceCalc.toArray()).map(r => ({
  ...r,
  position         : Number(r.position),
  frequency_all    : Number(r.frequency_all),
  total_all        : Number(r.total_all),
  value            : Number(r.value),          // already DOUBLE, but safe
  frequency_unique : Number(r.frequency_unique),
  total_unique     : Number(r.total_unique),
  value_unique     : Number(r.value_unique)
}));

```

```js
/* refProp – per-position proportion for the residue found in the
             uploaded reference sequence (fastaAligned)                */

/* refProp – per-position proportion for the residue found in the
             reference sequence (aligned if available, else raw) */

const refRow  = fastaAligned.find(d => d.protein === tableName);

/* pick the best available sequence string, or null */
const refSeq  =
  refRow
    ? (refRow.aligned_sequence   // preferred (already gap-aligned)
        ?? refRow.raw_sequence   // from FASTA header block
        ?? refRow.sequence       // fallback for CSV reference
      )
    : null;

const refProp = refSeq
  ? refSeq.split("").map((aa, i) => {
      const pos  = i + 1;
      const hit  = aaFrequencies.find(r =>
                   r.position  === pos &&
                   r.aminoacid === aa);
      return {
        position : pos,
        aminoacid: aa,
        value    : hit ? hit.value : 0     // 0 if never observed
      };
    })
  : [];                                        // no reference available

```



```js
/* area-chart data (svg4) — keep max value per position */
const areaData = d3.rollups(
  aaFrequencies,                                   // ⇐ now defined
  v => d3.max(v, d => d.value),
  d => +d.position
)
  .map(([position, value]) => ({ position, value }))
  .sort((a, b) => d3.ascending(a.position, b.position));

/* stacked-bar data (svg2) — exclude the max, order high→low */
const rowsNoMax = [];
for (const [pos, rows] of d3.group(aaFrequencies, d => d.position)) {
  const maxVal = d3.max(rows, d => d.value);
  rows
    .filter(r => r.value !== maxVal)
    .forEach(r =>
      rowsNoMax.push({
        position: +r.position,
        aminoacid: r.aminoacid,
        value: +r.value
      })
    );
}
const barGroups = d3.group(rowsNoMax, d => d.position);
const stackedBars = [];
for (const [pos, arr] of barGroups) {
  arr.sort((a, b) => d3.descending(a.value, b.value));
  let y0 = 0;
  for (const r of arr) {
    stackedBars.push({
      position: +pos,
      aminoacid: r.aminoacid,
      y0,
      y1: y0 + r.value
    });
    y0 += r.value;
  }
}

/* sequence-viewer data (svg3) — max-AA row per position */
const seqData = [];
for (const group of d3.group(aaFrequencies, d => d.position).values()) {
  seqData.push(group.reduce((m, r) => (r.value > m.value ? r : m)));
}
seqData.sort((a, b) => d3.ascending(+a.position, +b.position));

/* peptide viewer data (svg1) — assign vertical “levels” to avoid overlap */
/*****************************************************************
 * 3️⃣  Build the peptide-track array without any unary “+”
 *     (all arithmetic uses Numbers, never BigInts)
 *****************************************************************/
const peptidesplot = peptideR
  .filter(d => d.peptide_aligned)               // keep only aligned rows
  .map(d => {
    const start  = Number(d.start);
    const length = Number(d.aligned_length);

    return {
      start,
      length,
      end     : start + length,
      peptide : d.peptide_aligned,
      hla     : d.attribute_1,                  // colour-by attribute
      protein : d.protein,
      cellline: d.cellline
    };
  })
  .sort((a, b) => d3.ascending(a.start, b.start));

// ─── Assign tracks but pack from bottom ────────────────────────────────
const levels = [];
for (const p of peptidesplot) {
  let lvl = levels.findIndex(end => p.start >= end);
  if (lvl === -1) {
    lvl = levels.length;
    levels.push(0);
  }
  p.level = lvl;
  levels[lvl] = p.end;
}
// Now invert the levels so 0→bottom, max→top
const nLevels = levels.length;

// ───────────── HLA colour scale ─────────────
const hlaKeys = Array.from(new Set(peptidesplot.map(d => d.hla))).sort();
// ─── 1) define custom colours for specific HLAs ─────────────────────────
const customHLAcolors = {
  "A*11:01": "#76069a",
  "B44":     "#ff8100",
  "A*02:01": "#00c100"
};

// ─── 2) keep a default palette for anything else ────────────────────────
const defaultHLAcolor = d3.scaleOrdinal(hlaKeys, d3.schemeTableau10);

// ─── 3) override accessor that your bars use ───────────────────────────
function colourHLA(hla) {
  return customHLAcolors[hla] || defaultHLAcolor(hla);
}


/* ─────────────────────  LAYOUT CONSTANTS  ─────────────────────────── */
const margin = {top: 20, right: 20, bottom: 30, left: 40};

const hStd = 90; // height for svg2–svg4
const rowH = 14; // vertical step per peptide “track”
const h1 = margin.top + levels.length * rowH + margin.bottom;

const w = width; // responsive width
const maxPos = d3.max(areaData, d => d.position);

const x0 = d3.scaleLinear().domain([0, maxPos]).range([margin.left, w - margin.right]);

const yArea = d3
  .scaleLinear()
  .domain([0, d3.max(areaData, d => d.value)])
  .nice()
  .range([hStd - margin.bottom, margin.top]);

const yBar = d3
  .scaleLinear()
  .domain([0, d3.max(stackedBars, d => d.y1)])
  .nice()
  .range([hStd - margin.bottom, margin.top]);

// ← here’s the only change: use d3.group on the Arrow Table
const aaKeys = Array.from(d3.group(aaFrequencies, d => d.aminoacid).keys()).sort();

function colourAA(a) {
  return aaColors[a] || "#cccccc";  // fallback if you ever see something unexpected
}

/* ─────────────────────  SVG FACTORY  ──────────────────────────────── */
function makeSvg(height = hStd) {
  const svg = d3.create("svg").attr("width", w).attr("height", height);

  const axisG = svg
  .append("g")
  .attr("class", "x-axis")
  .attr("transform", `translate(0,${height - margin.bottom})`)
  .call(d3.axisBottom(x0));

  //  ─── inline stroke/fill so it survives serialization ──────────────
  axisG.selectAll("path, line")
      .attr("stroke", "black")
      .attr("fill",   "none");
    
        // ─── inline tick-label text ────
    axisG.selectAll("text")
        .attr("fill",        "black")
        .attr("font-family", "sans-serif")
        .attr("font-size",   "10px");   // adjust size as needed


  return svg;
}

/* ──────────────────  CREATE FOUR SYNCHRONISED SVGs  ───────────────── */
const svg1 = makeSvg(h1); // peptide viewer
const svg2 = makeSvg(); // stacked bars
const svg3 = makeSvg(); // sequence viewer
const svg4 = makeSvg(); // area chart
const svg5 = makeSvg(); // same default height (hStd)
const svg7 = makeSvg(); 
const svgs = [svg1, svg2, svg3, svg4, svg5, svg7];

/* ─────────────  svg4 ▸ proportional area chart  ───────────────────── */
svg4
  .append("path")
  .datum(areaData)
  .attr("class", "aa-area")
  .attr("fill", "steelblue")
  .attr("fill-opacity", 0.4)
  .attr("stroke", "steelblue")
  .attr("stroke-width", 1.5)
  .attr(
    "d",
    d3
      .area()
      .x(d => x0(d.position))
      .y0(yArea(0))
      .y1(d => yArea(d.value))
  );

// ─── overlay reference proportions (thinner, semi‐transparent) ────────
svg4.append("path")
  .datum(refProp)
  .attr("class", "ref-line")
  .attr("fill", "none")
  .attr("stroke", "red")
  .attr("stroke-width", 1)       // thinner line
  .attr("stroke-opacity", 0.8)   // 80% opacity
  .attr("d", d3.line()
    .x(d => x0(d.position))
    .y(d => yArea(d.value))
  );

// ─── svg5: mismatch‐highlight area chart ────────────────────────────────
// (make sure this cell is async so you can await refProp.toArray())

// 1) pull the DuckDB Table into a JS Array
const refArray = refProp;

// 2) build maps of ref and consensus AAs by position
const refMap  = new Map(refArray.map(d => [d.position, d.aminoacid]));
const consMap = new Map(seqData.map(d => [d.position, d.aminoacid]));

// 3) combine your areaData with a match flag
const compareData = areaData.map(d => ({
  position: d.position,
  value:    d.value,
  match:    refMap.get(d.position) === consMap.get(d.position)
}));



// ─── 2) blue background area (always full domain) ─────────────────────────
const areaGen = d3.area()
  .x(d => x0(d.position))
  .y0(yArea(0))
  .y1(d => yArea(d.value));

svg5.append("path")
  .datum(areaData)
  .attr("class", "bg-area")
  .attr("fill", "#55a0fb")
  .attr("fill-opacity", 0.4)
  .attr("d", areaGen);

// 2) define a clipPath of that exact area shape
const defs = svg5.append("defs");
defs.append("clipPath")
    .attr("id", "area-clip")
  .append("path")
    .datum(areaData)
    .attr("d", areaGen);

// 3) draw red rectangles for each mismatch, but *clip* them to the area region
const mismatchG = svg5.append("g")
  .attr("clip-path", "url(#area-clip)");

mismatchG.selectAll("rect.mismatch")
  .data(compareData.filter(d => !d.match))
  .enter().append("rect")
    .attr("class", "mismatch")
    .attr("x",      d => x0(d.position - 0.5))
    .attr("width",  d => x0(d.position + 0.5) - x0(d.position - 0.5))
    .attr("y",      margin.top)
    .attr("height", hStd - margin.top)
    .attr("fill",   "red")
    .attr("fill-opacity", 0.4)
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>Position:</strong> ${d.position}<br/>
          <strong>Proportion:</strong> ${d.value.toFixed(3)}
        `);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 10}px`)
        .style("top",  `${event.pageY + 10}px`);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });
// 4) consensus blue‐line on top
svg5.append("path")
  .datum(areaData)
  .attr("class", "cons-line")
  .attr("fill", "none")
  .attr("stroke", "#55a0fb")
  .attr("stroke-width", 2.)
  .attr("d", d3.line()
    .x(d => x0(d.position))
    .y(d => yArea(d.value))
  );

// --- right after you draw your mismatches and consensus line ---

// 1) Add a new <g> for hover‐rectangles
const hoverG = svg5.append("g").attr("class","hover‐areas");

// 2) Bind your areaData (one datum per position) and append transparent rects
hoverG.selectAll("rect")
  .data(areaData)
  .enter().append("rect")
    .attr("x",      d => x0(d.position - 0.5))
    .attr("width",  d => x0(d.position + 0.5) - x0(d.position - 0.5))
    .attr("y",      margin.top)
    .attr("height", hStd - margin.top - margin.bottom)
    .attr("fill",   "transparent")
    .attr("pointer-events", "all")
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>Position:</strong> ${d.position}<br/>
          <strong>Proportion:</strong> ${d.value.toFixed(3)}
        `);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 10}px`)
        .style("top",  `${event.pageY + 10}px`);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });


/* ─────────────  svg2 ▸ stacked bar chart  ─────────────────────────── */
let bars = svg2
  .append("g")
  .selectAll("rect")
  .data(stackedBars)
  .enter().append("rect")
    .attr("fill",   d => colourAA(d.aminoacid))
    .attr("x",      d => x0(d.position - 0.5))
    .attr("width",  d => x0(d.position + 0.5) - x0(d.position - 0.5))
    .attr("y",      d => yBar(d.y1))
    .attr("height", d => yBar(d.y0) - yBar(d.y1))
    .attr("cursor", "pointer")
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>Position:</strong> ${d.position}<br/>
          <strong>Amino acid:</strong> ${d.aminoacid}<br/>
          <strong>Value:</strong> ${(d.y1 - d.y0).toFixed(2)}
        `);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 10}px`)
        .style("top",  `${event.pageY + 10}px`);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });

/* ─────────────  svg3 ▸ interactive sequence viewer  ───────────────── */
const baseLen = 12;
let zxCurrent = x0;

const lines3 = svg3
  .append("g")
  .attr("class", "seq-lines")
  .selectAll("line")
  .data(seqData)
  .enter()
  .append("line")
  .attr("stroke-width", 3)
  .attr("stroke", d => colourAA(d.aminoacid))
  .attr("x1", d => x0(d.position))
  .attr("x2", d => x0(d.position))
  .attr("y1", hStd - margin.bottom)
  .attr("y2", hStd - margin.bottom - baseLen);

const letters3 = svg3
  .append("g")
  .attr("class", "seq-letters")
  .selectAll("text")
  .data(seqData)
  .enter()
  .append("text")
  .attr("font-family", "Courier")
  .attr("text-anchor", "middle")
  .attr("x", d => x0(d.position))
  .attr("y", hStd - margin.bottom - baseLen - 3)
  .text(d => d.aminoacid);

function letterStyle(zScale) {
  const wR = zScale(2) - zScale(1);
  letters3
    .style("display", wR < 12 ? "none" : null)
    .attr("font-size", wR < 12 ? null : Math.min(wR, 24) + "px");
}
letterStyle(x0);

function popLines(center) {
  const popSpacing = 20;
  const wR = zxCurrent(2) - zxCurrent(1);
  const xCenter = zxCurrent(center);

  // Zoomed-in: reset everything immediately
  if (wR >= 12) {
    lines3.interrupt().attr("y2", hStd - margin.bottom - baseLen);
    letters3.interrupt()
      .style("display", null)
      .style("opacity", 1)
      .attr("x", d => zxCurrent(d.position))
      .attr("y", hStd - margin.bottom - baseLen - 3);
    return;
  }

  // Mouse out: reset
  if (isNaN(center)) {
    lines3.interrupt().attr("y2", hStd - margin.bottom - baseLen);
    letters3.interrupt();
    letterStyle(zxCurrent);
    return;
  }

  // Hover + zoomed-out: update both lines & letters instantly
  lines3.interrupt().attr("y2", d => {
    const Δ = Math.abs(d.position - center);
    const lift = Δ === 0 ? 22 : Δ === 1 ? 16 : Δ === 2 ? 8 : 0;
    return hStd - margin.bottom - baseLen - lift;
  });

  letters3.interrupt()
    .style("display", d => (Math.abs(d.position - center) <= 2 ? null : "none"))
    .style("opacity", d => (Math.abs(d.position - center) <= 2 ? 1 : 0.4))
    .attr("y", hStd - margin.bottom - baseLen - 25)
    .attr("x", d => {
      const Δ = d.position - center;
      return Math.abs(Δ) <= 2
        ? xCenter + Δ * popSpacing
        : zxCurrent(d.position);
    });
}


svg3
  .append("rect")
  .attr("fill", "transparent")
  .attr("pointer-events", "all")
  .attr("x", margin.left)
  .attr("y", margin.top)
  .attr("width", w - margin.left - margin.right)
  .attr("height", hStd - margin.top - margin.bottom)
  .on("mousemove", function (e) {
    const [mx] = d3.pointer(e, this);
    popLines(Math.round(zxCurrent.invert(mx)));
  })
  .on("mouseleave", () => popLines(NaN));


/* ───────────── svg7 ▸ X31 reference sequence viewer ───────────────── */

/* 1️⃣ use the uploaded FASTA if it contains the chosen protein */
let refRow7 = fastaAligned.find(d => d.protein === tableName);

/* 2️⃣ if still nothing, NO other fallback — empty viewer is OK   */

/* 3️⃣ guard against missing sequence so .split() is never called on undefined */
const refSeq7 =
  refRow7
    ? (refRow7.aligned_sequence ?? refRow7.sequence ?? null)
    : null;

const seqData7 = refSeq7
  ? refSeq7.split("").map((aa, i) => ({ position: i + 1, aminoacid: aa }))
  : [];     // nothing to draw ➔ keep array empty

/* 4️⃣  draw sticks + letters only when we have data              */
const lines7  = svg7.append("g")
  .attr("class", "seq-lines7")
  .selectAll("line")
  .data(seqData7)
  .enter().append("line")
    .attr("stroke-width", 3)
    .attr("stroke", d => colourAA(d.aminoacid))
    .attr("x1", d => x0(d.position))
    .attr("x2", d => x0(d.position))
    .attr("y1", hStd - margin.bottom)
    .attr("y2", hStd - margin.bottom - baseLen);

const letters7 = svg7.append("g")
  .attr("class", "seq-letters7")
  .selectAll("text")
  .data(seqData7)
  .enter().append("text")
    .attr("font-family", "Courier")
    .attr("text-anchor", "middle")
    .attr("x", d => x0(d.position))
    .attr("y", hStd - margin.bottom - baseLen - 3)
    .text(d => d.aminoacid);

// 4) Copy the letter‐visibility logic
function letterStyle7(zScale) {
  const wR = zScale(2) - zScale(1);
  letters7
    .style("display", wR < baseLen ? "none" : null)
    .attr("font-size", wR < baseLen ? null : Math.min(wR, 24) + "px");
}
letterStyle7(x0);

// 5) Copy the “pop-out” hover logic
function popLines7(center) {
  const popSpacing = 20;
  // same guards as popLines
  const wR = zxCurrent(2) - zxCurrent(1);
  if (wR >= baseLen) {
    lines7.interrupt().attr("y2", hStd - margin.bottom - baseLen);
    letters7.interrupt()
      .style("display", null)
      .style("opacity", 1)
      .attr("x", d => zxCurrent(d.position))
      .attr("y", hStd - margin.bottom - baseLen - 3);
    return;
  }
  if (isNaN(center)) {
    lines7.interrupt().attr("y2", hStd - margin.bottom - baseLen);
    letters7.interrupt();
    letterStyle7(zxCurrent);
    return;
  }
  // hover + zoomed-out
  lines7.interrupt().attr("y2", d => {
    const Δ = Math.abs(d.position - center);
    const lift = Δ === 0 ? 22 : Δ === 1 ? 16 : Δ === 2 ? 8 : 0;
    return hStd - margin.bottom - baseLen - lift;
  });
  letters7.interrupt()
    .style("display", d => (Math.abs(d.position - center) <= 2 ? null : "none"))
    .style("opacity", d => (Math.abs(d.position - center) <= 2 ? 1 : 0.4))
    .attr("y", hStd - margin.bottom - baseLen - 25)
    .attr("x", d => {
      const Δ = d.position - center;
      const xCenter = zxCurrent(center);
      return Math.abs(Δ) <= 2
        ? xCenter + Δ * popSpacing
        : zxCurrent(d.position);
    });
}

// 6) Overlay a transparent rect to capture pointer events
svg7.append("rect")
  .attr("fill", "transparent")
  .attr("pointer-events", "all")
  .attr("x", margin.left)
  .attr("y", margin.top)
  .attr("width", w - margin.left - margin.right)
  .attr("height", hStd - margin.top - margin.bottom)
  .on("mousemove", function (e) {
    const [mx] = d3.pointer(e, this);
    popLines7(Math.round(zxCurrent.invert(mx)));
  })
  .on("mouseleave", () => popLines7(NaN));


/* ─────────────  svg1 ▸ PEPTIDE VIEWER  ─────────────────────────────── */
const barH = rowH - 2;
function leftPos(scale, d) {
  return scale(d.start - 0.5);
}
function barWidth(scale, d) {
  return scale(d.start + d.length - 0.5) - scale(d.start - 0.5);
}

svg1.selectAll("g.peptides").remove();
const peptideG = svg1.append("g").attr("class", "peptides");

const peptideBars = peptideG.selectAll("rect")
  .data(peptidesplot)
  .enter().append("rect")
    .attr("fill",       d => colourHLA(d.hla))
    .attr("stroke",     "#444")
    .attr("stroke-width", 0.5)
    .attr("cursor",     "pointer")
    .attr("x",          d => leftPos(x0, d))
    .attr("width",      d => barWidth(x0, d))
    .attr("y",          d => margin.top + (nLevels - 1 - d.level) * rowH)
    .attr("height",     barH)
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>Protein:</strong> ${d.protein}<br/>
          <strong>Peptide:</strong> ${d.peptide}<br/>
          <strong>HLA:</strong> ${d.hla}<br/>
          <strong>Cell line:</strong> ${d.cellline}
        `);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", `${event.pageX + 10}px`)
        .style("top",  `${event.pageY + 10}px`);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    })
    .on("click", (event, d) => {
      setSelectedPeptide(d.peptide);
      setSelectedStart(d.start);
      setSelectedLength(d.length);
      console.log("Clicked peptide:", d.peptide, "start=", d.start, "length=", d.length);
    });


/* ────────────────────  SHARED ZOOM  ──────────────────────────────── */
// 1) Define the zoom behavior
const zoom = d3.zoom()
  .scaleExtent([1, 10])
  .translateExtent([[margin.left, 0], [w - margin.right, h1]])
  .on("zoom", zoomed);

// 2) Put all 5 SVGs into one array and call zoom on each
svgs.forEach(svg => svg.call(zoom));

// 3) The zoom handler
function zoomed(event) {
  const t = event.transform;
  zxCurrent = t.rescaleX(x0);

  // ─── Update all x-axes ───────────────────────────────────────────────
  svgs.forEach(svg =>
    svg.select(".x-axis").call(d3.axisBottom(zxCurrent))
  );

  // ─── svg4: area chart ────────────────────────────────────────────────
  svg4.select(".aa-area")
    .attr("d", d3.area()
      .x(d => zxCurrent(d.position))
      .y0(yArea(0))
      .y1(d => yArea(d.value))
    );

  // ─── svg4: reference red line ────────────────────────────────────────
  svg4.select(".ref-line")
    .attr("d", d3.line()
      .x(d => zxCurrent(d.position))
      .y(d => yArea(d.value))
    );

  // ─── svg2: stacked bars ─────────────────────────────────────────────
  bars
    .attr("x", d => zxCurrent(d.position - 0.5))
    .attr("width", d => zxCurrent(d.position + 0.5) - zxCurrent(d.position - 0.5));

  // ─── svg3: sequence viewer ──────────────────────────────────────────
  lines3
    .attr("x1", d => zxCurrent(d.position))
    .attr("x2", d => zxCurrent(d.position));
  letters3
    .attr("x", d => zxCurrent(d.position));
  letterStyle(zxCurrent);

  // ─── svg7: reference‐sequence viewer ─────────────────────────────────────
  lines7
    .attr("x1", d => zxCurrent(d.position))
    .attr("x2", d => zxCurrent(d.position));
  letters7
    .attr("x", d => zxCurrent(d.position));
  letterStyle7(zxCurrent);

  // ─── svg1: peptide viewer ──────────────────────────────────────────
  peptideBars
    .attr("x", d => leftPos(zxCurrent, d))
    .attr("width", d => barWidth(zxCurrent, d));

  // 1) update blue background area
  svg5.select(".bg-area")
    .attr("d", d3.area()
      .x(d => zxCurrent(d.position))
      .y0(yArea(0))
      .y1(d => yArea(d.value))
    );

  // 2) update the clip‐path shape itself
  svg5.select("#area-clip path")
    .datum(areaData)
    .attr("d", d3.area()
      .x(d => zxCurrent(d.position))
      .y0(yArea(0))
      .y1(d => yArea(d.value))
    );

  // 3) shift the red mismatch rects horizontally
  svg5.selectAll("rect.mismatch")
    .attr("x",     d => zxCurrent(d.position - 0.5))
    .attr("width", d => zxCurrent(d.position + 0.5) - zxCurrent(d.position - 0.5));

  // 4) redraw the consensus line
  svg5.select(".cons-line")
    .attr("d", d3.line()
      .x(d => zxCurrent(d.position))
      .y(d => yArea(d.value))
    );
  
    // **new**: update the hover rectangles too
  hoverG.selectAll("rect")
    .attr("x",     d => zxCurrent(d.position - 0.5))
    .attr("width", d => zxCurrent(d.position + 0.5) - zxCurrent(d.position - 0.5));


  // ─── Synchronize transforms across the five charts ──────────────────
  if (event.sourceEvent) {
    svgs.forEach(s => {
      if (s.node() !== this) s.call(zoom.transform, t);
    });
  }
}

```




```js
// in one code block (so foo and setFoo live together)
const selectedPeptide = Mutable(null);
const setSelectedPeptide = x => selectedPeptide.value = x;

const selectedStart = Mutable(null);
const setSelectedStart = x => selectedStart.value = x;

const selectedLength = Mutable(null);
const setSelectedLength = x => selectedLength.value = x;
```

```js
html`
  ${svg6.node()}
`

```

```js
html`
  ${svg1.node()}<br/>
  ${svg7.node()}<br/>
  ${svg3.node()}<br/>
  ${svg2.node()}<br/>
  ${svg5.node()}
`

```

```js
html`
  <button style="margin-bottom: 1em;"
          onclick=${() => saveSvg(svg1.node(), 'peptides-viewer.svg')}>
    ⬇️ Download Peptide Viewer
  </button>
  <br/>`
```

```js
html`
  <button style="margin-bottom: 1em;"
          onclick=${() => saveSvg(svg5.node(), 'area-chart.svg')}>
    ⬇️ Download Area Chart
  </button>
  <br/>`

```

```js

html`
  <button style="margin-bottom: 1em;"
          onclick=${async () => {
            // 1) pull the results of your SQL cell into a JS array
            const rows = await peptideProps.toArray();
            // 2) convert to CSV text
            const csv   = d3.csvFormat(rows);
            // 3) make a Blob and a temporary link to download it
            const blob  = new Blob([csv], {type: "text/csv;charset=utf-8;"});
            const url   = URL.createObjectURL(blob);
            const a     = document.createElement("a");
            a.href      = url;
            a.download  = "peptide-proportions.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}>
    ⬇️ Download Peptide Proportions
  </button>
  <br/>`

```










```sql id=peptideProps display
WITH
  params AS (
    SELECT
      CAST(${selectedStart}  AS BIGINT) AS start,
      CAST(${selectedLength} AS BIGINT) AS len,
      ${selectedPeptide}                        AS sel_peptide
  ),
  filtered AS (
    SELECT *
    FROM proteins
    WHERE protein = ${tableName}
      AND (${genotype} = '' OR genotype = ${genotype})
      AND (${country}  = '' OR country  = ${country})
  ),
  extracted AS (
    SELECT SUBSTR(sequence, params.start, params.len) AS peptide
    FROM filtered
    JOIN params ON TRUE
  ),
  counts AS (
    SELECT
      peptide,
      COUNT(*) AS cnt
    FROM extracted
    GROUP BY peptide
  ),
  total AS (
    SELECT SUM(cnt) AS total_count
    FROM counts
  ),
  proportions AS (
    SELECT
      peptide,
      cnt * 1.0 / total_count AS proportion
    FROM counts, total
  ),
  selected AS (
    SELECT
      sel_peptide AS peptide,
      COALESCE(
        (SELECT proportion FROM proportions WHERE peptide = sel_peptide),
        0
      ) AS proportion
    FROM params
  )

-- 1) all peptides except the clicked one
SELECT
  p.peptide,
  p.proportion
FROM
  proportions AS p
  CROSS JOIN params
WHERE
  p.peptide <> params.sel_peptide

UNION ALL

-- 2) then exactly one row for the clicked peptide
SELECT
  peptide,
  proportion
FROM
  selected

ORDER BY
  proportion DESC;


```

```js
// svg6 cell
const all = await peptideProps.toArray();
const sel = selectedPeptide;
const propMap = new Map(all.map(d => [d.peptide, d.proportion]));
const top4Data = all.filter(d => d.peptide !== sel).slice(0, 4);
const rows = [
  { peptide: sel, proportion: propMap.get(sel) || 0 },
  ...top4Data.map(d => ({ peptide: d.peptide, proportion: d.proportion }))
];

const cellSize = 24;
const margin = { top: 20, right: 40, bottom: 20, left: 4 };
const maxLen = d3.max(rows, d => d.peptide.length);
const width6 = margin.left + maxLen * cellSize + margin.right;
const height6 = margin.top + rows.length * cellSize + margin.bottom;

const svg6 = d3.create("svg")
  .attr("width", width6)
  .attr("height", height6)
  .attr("font-family", "sans-serif")
  .attr("font-size", "10px");

rows.forEach((row, i) => {
  const y0 = margin.top + i * cellSize;

  svg6.append("g")
    .attr("transform", `translate(${margin.left},${y0})`)
    .selectAll("rect")
    .data(d3.range(maxLen))
    .enter().append("rect")
      .attr("x",       j => j * cellSize + 0.5)
      .attr("y",       0.5)
      .attr("width",   cellSize - 1)
      .attr("height",  cellSize - 1)
      .attr("stroke",  "#fff")
      .attr("fill",    j => {
        const char   = row.peptide[j] || "";
        const isHead = i === 0;
        // if toggle is on, always use the AA colour map (with a fallback):
        if (togglecolour) {
          return aaColors[char] || "#D9D9D9";
        }
        // otherwise fall back to your old header/mismatch logic:
        if (isHead) return "#fde0dd";
        return (j < row.peptide.length && char !== sel[j])
          ? "#ffcccc"
          : "#f9f9f9";
      });

  // draw the letters
  svg6.append("g")
    .attr("transform", `translate(${margin.left},${y0})`)
    .selectAll("text")
    .data(row.peptide.split(""))
    .enter().append("text")
      .attr("x", (_, j) => j * cellSize + cellSize / 2)
      .attr("y", cellSize / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-weight", i === 0 ? "bold" : null)
      .text(c => c);

  // draw the proportion on the right
  svg6.append("text")
    .attr("x", margin.left + maxLen * cellSize + 4)
    .attr("y", y0 + cellSize / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "start")
    .text(row.proportion.toFixed(2));
});

svg6  // so you can call svg6.node() in your layout cell
```




```js
const plotTitle = view(Inputs.text({
  label: "Plot title",
  placeholder: "e.g. HA • all genotypes",
  submit: true
}))
```


```js
/* ---------- overlay mini-plots ------------------------------------- */
const savedPlots = Mutable([]);                     // handle
const pushSavedPlot = plot  =>
  savedPlots.value = [...savedPlots.value, plot];    // append
const popSavedPlot  = ()     =>
  savedPlots.value = savedPlots.value.slice(0, -1);  // drop last

/* ---------- compareData snapshots ---------------------------------- */
const snapshots = Mutable([
  { plot: null, position: null, value: null, match: null }   // header row
]);
const pushSnapshotRows = rows =>
  snapshots.value = [...snapshots.value, ...rows];
```


```js
const controls = html`
  <div>
    <button id="add"> Add plot</button>
    <button id="rm"  style="margin-left:8px;"> Remove last</button>
  </div>
`;

function updatePlots(ev) {
  const btn = ev.target.closest("button");
  if (!btn) return;

  /* ---------- ADD --------------------------------------------------- */
  if (btn.id === "add") {
    /* overlay line */
    if (areaData?.length) {
      const colour = d3.schemeCategory10[savedPlots.length % 10];
      pushSavedPlot({
        plot_number : savedPlots.length + 1,
        title       : plotTitle || `Plot ${savedPlots.length + 1}`,
        data        : areaData.map(d => ({ ...d })),   // deep copy
        colour
      });
    }

    /* snapshot rows */
    if (compareData?.length) {
      const existing = snapshots.filter(r => r.plot !== null);
      const nextPlot = existing.length
                     ? Math.max(...existing.map(r => r.plot)) + 1
                     : 1;

      const newRows = compareData.map(d => ({
        plot    : nextPlot,
        position: d.position,
        value   : d.value,
        match   : d.match
      }));
      pushSnapshotRows(newRows);
    }
  }

  /* ---------- REMOVE (overlay + snapshot) --------------------------- */
  if (btn.id === "rm") {
    /* 1. remove the last overlay line */
    popSavedPlot();

    /* 2. remove all snapshot rows belonging to the highest plot index */
    const rows = snapshots;
    const plotIds = rows.filter(r => r.plot !== null).map(r => r.plot);
    if (plotIds.length) {
      const lastPlot = Math.max(...plotIds);
      snapshots.value = rows.filter(
        r => r.plot === null || r.plot !== lastPlot          // keep header & older plots
      );
    }
  }
}

/* attach exactly one listener */
controls.onclick = null;
controls.removeEventListener("click", updatePlots);
controls.addEventListener("click",   updatePlots);
```


```js
controls
```


```js
function makeSnapshotCharts(
  snapshotRows,
  {
    width: w  = width,
    hStd  = 120,
    margin = { t: 12, r: 20, b: 30, l: 40 }
  } = {}
) {
  const charts = [];

  const groups = d3.group(
    snapshotRows.filter(d => d.plot !== null),
    d => d.plot
  );

  for (const [plotIdx, rows] of groups) {
    if (!rows.length) continue;

    /* scales */
    const maxPos = d3.max(rows, d => d.position);
    const x = d3.scaleLinear([1, maxPos], [margin.l, w - margin.r]);

    const maxVal = d3.max(rows, d => d.value);
    const y = d3.scaleLinear([0, maxVal], [hStd - margin.b, margin.t]);

    const areaGen = d3.area()
      .x(d => x(d.position))
      .y0(y(0))
      .y1(d => y(d.value));

    /* SVG */
    const svg = d3.create("svg")
      .attr("width",  w)
      .attr("height", hStd)
      .attr("font-family", "sans-serif")
      .attr("font-size", 10);

    /* blue proportional area */
    svg.append("path")
      .datum(rows)
      .attr("fill", "#55a0fb")
      .attr("fill-opacity", 0.4)
      .attr("d", areaGen);

    /* ── NEW: consensus blue line (same as svg5) ─────────────────── */
    svg.append("path")
      .datum(rows)
      .attr("fill", "none")
      .attr("stroke", "#55a0fb")
      .attr("stroke-width", 2)
      .attr("d", d3.line()
        .x(d => x(d.position))
        .y(d => y(d.value))
      );

    /* clipPath for red mismatch bars */
    svg.append("defs")
      .append("clipPath")
        .attr("id", `clip-${plotIdx}`)
      .append("path")
        .datum(rows)          // bind rows so areaGen has data
        .attr("d", areaGen);

    /* red mismatch rectangles */
    svg.append("g")
      .attr("clip-path", `url(#clip-${plotIdx})`)
      .selectAll("rect")
      .data(rows.filter(d => !d.match))
      .enter().append("rect")
        .attr("x", d => x(d.position - 0.5))
        .attr("width", d => x(d.position + 0.5) - x(d.position - 0.5))
        .attr("y", margin.t)
        .attr("height", hStd - margin.t)
        .attr("fill", "red")
        .attr("fill-opacity", 0.4);

    /* x-axis */
    svg.append("g")
      .attr("transform", `translate(0,${hStd - margin.b})`)
      .call(d3.axisBottom(x));

    /* label */
    svg.append("text")
      .attr("x", margin.l)
      .attr("y", margin.t - 4)
      .attr("font-weight", "bold")
      .text(`Plot ${plotIdx}`);

    charts.push(svg.node());
  }

  return charts;
}
```





```js
// svg1Copy  — a *static* duplicate of the peptide viewer for the bottom section
const svg1Copy = svg1.node().cloneNode(true);

```




```js
html`
  <!-- duplicate peptide viewer -->
  ${svg1Copy}<br/>

  <!-- comparative conservation plots that were already here -->
  ${makeSnapshotCharts(snapshots).map(svg => html`${svg}<br/>`)}
`


```


```js
function downloadCombined() {
  /* 1) fresh copies of every piece we need */
  const peptideTop = svg1Copy.cloneNode(true);          // already cloned above
  const charts     = makeSnapshotCharts(snapshots);     // up-to-date snapshots
  const pieces     = [peptideTop, ...charts];

  /* 2) work out overall size */
  const widths  = pieces.map(p => +p.getAttribute("width"));
  const heights = pieces.map(p => +p.getAttribute("height"));
  const maxW    = Math.max(...widths);
  const totalH  = heights.reduce((a, b) => a + b, 0);

  /* 3) build one master <svg> */
  const composite = d3.create("svg")
    .attr("xmlns",  "http://www.w3.org/2000/svg")
    .attr("width",   maxW)
    .attr("height",  totalH);

  let yOffset = 0;
  pieces.forEach((p, i) => {
    const g = composite.append("g")
      .attr("transform", `translate(0,${yOffset})`);
    g.node().appendChild(p);            // append the cloned SVG
    yOffset += heights[i];
  });

  /* 4) save it */
  saveSvg(composite.node(), "combined-peptide-conservation.svg");
}

```

```js
html`
  <button style="margin-bottom:1em;"
          onclick=${downloadCombined}>
    ⬇️ Download Peptide + Conservation SVG
  </button>
`

```