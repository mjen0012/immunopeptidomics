import * as d3 from "npm:d3";

/**
 * alleleChart() → HTMLElement with ResizeObserver
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
  margin     = {top: 80, right: 20, bottom: 20, left: 140}
} = {}) {
  // Pick the correct percentile column name
  const pctCol =
    classType === "I"
      ? (mode === "EL"
          ? "netmhcpan_el percentile"
          : "netmhcpan_ba percentile")
      : (mode === "EL"
          ? "netmhciipan_el percentile"
          : "netmhciipan_ba percentile");

  // Prepare lookup map
  const lookup = new Map();
  data.forEach(d => {
    if (alleles.includes(d.allele)) {
      lookup.set(`${d.allele}|${d.peptide}`, +d[pctCol]);
    }
  });

  // Unique peptides sorted alphabetically
  const peptides = [...new Set(
    data.filter(d => alleles.includes(d.allele))
        .map(d => d.peptide)
  )].sort(d3.ascending);

  // Wrapper div—fixed height, scroll if needed
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width : 100%;
    height: ${Math.max(peptides.length * baseCell + margin.top + margin.bottom, 200)}px;
    overflow: auto;
  `;

  // Draw function
  function draw(width) {
    const cell = baseCell;
    const w = margin.left + alleles.length * cell + margin.right;
    const h = margin.top  + peptides.length * cell + margin.bottom;

    // Colour scale: blue → white → red
    const colour = d3.scaleLinear()
      .domain([0, 50, 100])
      .range(["#0074D9", "#ffffff", "#e60000"]);

    // Create SVG
    const svg = d3.create("svg")
      .attr("width",  Math.max(w, width))
      .attr("height", h)
      .attr("viewBox", `0 0 ${Math.max(w, width)} ${h}`)
      .style("overflow", "visible")
      .style("font-family", "sans-serif")
      .style("font-size", 12);

    // Cells group
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

    // X-axis labels (alleles)
    const xg = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    alleles.forEach((al, i) => {
      xg.append("text")
        .attr("x", i*cell + cell/2)
        .attr("y", 0)
        .attr("text-anchor", "end")
        .attr("transform", `rotate(-45, ${i*cell + cell/2}, 0)`)
        .text(al);
    });

    // Y-axis labels (peptides)
    const yg = svg.append("g")
      .attr("transform", `translate(${margin.left - 6},${margin.top})`);
    peptides.forEach((pep, i) => {
      yg.append("text")
        .attr("x", 0)
        .attr("y", i*cell + cell/2 + 4)
        .attr("text-anchor", "end")
        .text(pep);
    });

    // Render
    wrapper.innerHTML = "";
    wrapper.appendChild(svg.node());
  }

  // Initial draw and observe
  const ro = new ResizeObserver(entries => {
    for (const e of entries) draw(e.contentRect.width);
  });
  ro.observe(wrapper);
  draw(wrapper.getBoundingClientRect().width);

  return wrapper;
}
