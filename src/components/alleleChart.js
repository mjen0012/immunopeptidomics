/* ────────────────────────────────────────────────────────────────
 *  alleleChart.js   ·  heat-map of percentile per (allele, peptide)
 *  --------------------------------------------------------------
 *  Props
 *  ────────────────────────────────────────────────────────────────
 *  data        : array of result rows (Class-I or Class-II)
 *  alleles     : string[] of alleles to show (X-axis order)
 *  mode        : "EL" | "BA"          → which percentile column
 *  classType   : "I" | "II"           → which MHC class
 *  cell        : pixel size of each cell (default 24)
 *  margin      : {top,right,bottom,left}  (defaults inside)
 *
 *  Returns an <svg> node wrapped in a scrolling <div>.
 *  Colour scale:  0 (blue) → 50 (white) → 100 (red)
 * ────────────────────────────────────────────────────────────────*/
import * as d3 from "npm:d3";

export function alleleChart({
  data,
  alleles,
  mode      = "EL",
  classType = "I",
  cell      = 24,
  margin    = {top: 40, right: 20, bottom: 20, left: 140}
} = {}) {

  /* ---- graceful fall-backs for initial empty render ----------- */
  data    = Array.isArray(data)    ? data    : [];
  alleles = Array.isArray(alleles) ? alleles : [];

  /* 1 ▸ column resolver ----------------------------------------- */
  const pctCol =
    classType === "I"
      ? (mode === "EL"
          ? "netmhcpan_el percentile"
          : "netmhcpan_ba percentile")
      : (mode === "EL"
          ? "netmhciipan_el percentile"
          : "netmhciipan_ba percentile");

  /* 2 ▸ tidy rows / unique peptide list -------------------------- */
  const rowsFiltered = data.filter(d => alleles.includes(d.allele));
  const peptides = [...new Set(rowsFiltered.map(r => r.peptide))].sort(d3.ascending);

  /* 3 ▸ build lookup  ------------------------------------------- */
  const lookup = new Map();
  for (const r of rowsFiltered) {
    lookup.set(`${r.allele}|${r.peptide}`, +r[pctCol]); // + casts to Number
  }

  /* 4 ▸ dims ----------------------------------------------------- */
  const width  = margin.left + alleles.length  * cell + margin.right;
  const height = margin.top  + peptides.length * cell + margin.bottom;

  const svg = d3.create("svg")
    .attr("width",  width)
    .attr("height", height)
    .attr("viewBox", [0,0,width,height])
    .style("font-family", "sans-serif")
    .style("font-size", 12);

  /* 5 ▸ colour scale 0-100 → blue-white-red ---------------------- */
  const colour = d3.scaleLinear()
    .domain([0, 50, 100])
    .range(["#0074D9", "#ffffff", "#e60000"]);

  /* 6 ▸ cells ---------------------------------------------------- */
  const gCells = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  peptides.forEach((pep, yi) => {
    alleles.forEach((al, xi) => {
      const val = lookup.get(`${al}|${pep}`);
      gCells.append("rect")
        .attr("x", xi*cell)
        .attr("y", yi*cell)
        .attr("width",  cell)
        .attr("height", cell)
        .attr("fill", val==null ? "#f0f0f0" : colour(val));

      if (val != null) {
        gCells.append("text")
          .attr("x", xi*cell + cell/2)
          .attr("y", yi*cell + cell/2 + 4)   /* 4 px baseline tweak */
          .attr("text-anchor", "middle")
          .attr("pointer-events", "none")
          .attr("fill", val < 25 || val > 75 ? "#000" : "#000") // always black
          .text(val.toFixed(2));
      }
    });
  });

  /* 7 ▸ axes labels --------------------------------------------- */
  /* x – alleles */
  const xLab = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top-5})`)
    .selectAll("text")
    .data(alleles)
    .join("text")
      .attr("x", (_,i)=> i*cell + cell/2)
      .attr("y", 0)
      .attr("text-anchor", "end")
      .attr("transform", (_,i)=>`rotate(-45, ${i*cell + cell/2}, 0)`)
      .text(d=>d);

  /* y – peptides */
  svg.append("g")
    .attr("transform", `translate(${margin.left-6},${margin.top})`)
    .selectAll("text")
    .data(peptides)
    .join("text")
      .attr("x", 0)
      .attr("y", (_,i)=> i*cell + cell/2 + 4)
      .attr("text-anchor", "end")
      .text(d=>d);

  /* 8 ▸ wrap in scrolling div ------------------------------------ */
  const wrapper = document.createElement("div");
  wrapper.style.overflow = "auto";
  wrapper.appendChild(svg.node());
  return wrapper;
}
