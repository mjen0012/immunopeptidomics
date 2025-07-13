/*****************************************************************
 *  histogramChart()  →  SVGElement        ·  v2
 *  --------------------------------------------------------------
 *  Improvements
 *    • bins now keep the original row objects, so the tooltip
 *      can accurately tally counts *per protein*.
 *    • tooltip lists every protein present in the bin, ordered
 *      high → low.
 *****************************************************************/
import * as d3 from "npm:d3";

export function histogramChart({
  data,
  useUnique  = false,
  binStep    = 0.05,                       // 5-percentage-point bins
  sizeFactor = 1.2,
  margin     = { top:20, right:20, bottom:40, left:50 },
  colour     = "#006DAE",
  width      = 600,
  height     = 300
} = {}) {

  /* ── guard ─────────────────────────────────────────────── */
  if (!data?.length) {
    const span = document.createElement("span");
    span.textContent = "No peptide proportion data.";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── pick the right proportion column ──────────────────── */
  const propKey = useUnique ? "proportion_unique" : "proportion_all";

  /* keep objects with value + protein so bins know the source */
  const rows = data
    .map(d => ({
      value  : +d[propKey],
      protein: d.protein ?? "Unknown"
    }))
    .filter(r => Number.isFinite(r.value));

  /* ── histogram bins (0…1) ──────────────────────────────── */
  const bins = d3.bin()
    .value(r => r.value)                   // ← accessor
    .domain([0,1])
    .thresholds(d3.range(0, 1 + 1e-9, binStep))
    (rows);

  /* ── scales ─────────────────────────────────────────────── */
  const x = d3.scaleLinear([0,1],
            [margin.left, width - margin.right]);

  const y = d3.scaleLinear(
              [0, d3.max(bins, b => b.length)],
              [height - margin.bottom, margin.top])
              .nice();

  /* ── SVG shell ──────────────────────────────────────────── */
  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("font-family", "sans-serif")
    .attr("font-size", 10*sizeFactor);

  /* ── bars ──────────────────────────────────────────────── */
  const barG = svg.append("g");

  barG.selectAll("rect")
    .data(bins)
    .enter().append("rect")
      .attr("x", d => x(d.x0) + 1)
      .attr("y", d => y(d.length))
      .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2))
      .attr("height", d => y(0) - y(d.length))
      .attr("fill", colour)
      .attr("stroke", "#fff");

  /* ── axes ──────────────────────────────────────────────── */
  svg.append("g")
     .attr("transform", `translate(0,${height - margin.bottom})`)
     .call(
       d3.axisBottom(x)
         .tickFormat(d3.format(".0%"))
         .ticks(10)
     );

  svg.append("g")
     .attr("transform", `translate(${margin.left},0)`)
     .call(d3.axisLeft(y).ticks(5));

  /* ── tooltip ───────────────────────────────────────────── */
  const tip = d3.select(document.body).append("div")
    .style("position","absolute")
    .style("pointer-events","none")
    .style("background","#fff")
    .style("border","1px solid #ccc")
    .style("border-radius","4px")
    .style("padding","6px")
    .style("font","12px sans-serif")
    .style("opacity",0);

  barG.selectAll("rect")
    .on("mouseover", (e, bin) => {
      /* header */
      const pct = v => (v*100).toFixed(1) + "%";
      let html  =
        `<strong>Range:</strong> ${pct(bin.x0)} – ${pct(bin.x1)}<br/>` +
        `<strong>Total:</strong> ${bin.length}<br/><br/>`;

      /* per-protein breakdown (desc) */
      d3.rollups(
          bin,                             // rows in this bin
          v => v.length,                   // count per protein
          r => r.protein                   // key accessor
        )
        .sort((a,b)=>d3.descending(a[1], b[1]))     // high → low
        .forEach(([prot,cnt])=>{
          html += `${prot}: <strong>${cnt}</strong><br/>`;
        });

      tip.html(html)
         .style("left", `${e.pageX+10}px`)
         .style("top",  `${e.pageY+10}px`)
         .style("opacity",1);
    })
    .on("mousemove", e =>
       tip.style("left", `${e.pageX+10}px`)
          .style("top",  `${e.pageY+10}px`)
    )
    .on("mouseout", () => tip.style("opacity",0));

  return svg.node();
}
