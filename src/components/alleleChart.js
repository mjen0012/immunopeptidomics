import * as d3 from "npm:d3";

/**
 * alleleChart() → HTMLElement
 *
 * Props
 *   data        : array of result rows
 *   alleles     : string[] of alleles (x-axis)
 *   mode        : "EL" | "BA"
 *   classType   : "I"  | "II"
 *   baseCell    : preferred cell size (px)
 *   margin      : {top,right,bottom,left}
 */
export function alleleChart({
  data       = [],
  alleles    = [],
  mode       = "EL",
  classType  = "I",
  baseCell   = 28,
  margin     = { top: 40, right: 20, bottom: 20, left: 140 }
} = {}) {
  // 1. pick correct column
  const pctCol =
    classType === "I"
      ? (mode === "EL" ? "netmhcpan_el percentile" : "netmhcpan_ba percentile")
      : (mode === "EL"
          ? "netmhciipan_el percentile"
          : "netmhciipan_ba percentile");

  // 2. build lookup and peptide list
  const lookup = new Map();
  data.forEach(d => {
    if (alleles.includes(d.allele)) {
      lookup.set(`${d.allele}|${d.peptide}`, +d[pctCol]);
    }
  });
  const peptides = [...new Set(
    data.filter(d => alleles.includes(d.allele))
        .map(d => d.peptide)
  )].sort(d3.ascending);

  // 3. compute total width/height
  const cell = baseCell;
  const width  = margin.left + alleles.length * cell + margin.right;
  const height = margin.top  + peptides.length * cell + margin.bottom;

  // 4. create SVG of exactly that size
  const svg = d3.create("svg")
    .attr("width",  width)
    .attr("height", height)
    .style("font-family", "sans-serif")
    .style("font-size", 12);

  // 5. colour scale
  const colour = d3.scaleLinear()
    .domain([0, 50, 100])
    .range(["#0074D9", "#ffffff", "#e60000"]);

  // 6. draw cells
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  peptides.forEach((pep, yi) => {
    alleles.forEach((al, xi) => {
      const key = `${al}|${pep}`;
      const val = lookup.get(key);
      g.append("rect")
        .attr("x", xi * cell)
        .attr("y", yi * cell)
        .attr("width",  cell)
        .attr("height", cell)
        .attr("fill", val == null ? "#f0f0f0" : colour(val));

      if (val != null) {
        g.append("text")
          .attr("x", xi*cell + cell/2)
          .attr("y", yi*cell + cell/2 + 4)
          .attr("text-anchor", "middle")
          .attr("pointer-events", "none")
          .text(val.toFixed(2));
      }
    });
  });

  // 7. x–axis labels
  const xg = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top - 5})`);
  alleles.forEach((al, i) => {
    xg.append("text")
      .attr("x", i*cell + cell/2)
      .attr("y", 0)
      .attr("text-anchor", "end")
      .attr("transform", `rotate(-45, ${i*cell + cell/2}, 0)`)
      .text(al);
  });

  // 8. y–axis labels
  const yg = svg.append("g")
    .attr("transform", `translate(${margin.left - 6},${margin.top})`);
  peptides.forEach((pep, i) => {
    yg.append("text")
      .attr("x", 0)
      .attr("y", i*cell + cell/2 + 4)
      .attr("text-anchor", "end")
      .text(pep);
  });

  // 9. return the SVG element itself
  return svg.node();
}
