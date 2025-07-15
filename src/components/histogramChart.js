/*****************************************************************
 *  histogramChart()  →  HTMLElement        ·  v8
 *  --------------------------------------------------------------
 *  Fixes
 *    1. White horizontal stripe removed by setting stroke = none.
 *    2. Label x-position now uses the same left-offset used for
 *       the bar, so the first bar is centred correctly.
 *****************************************************************/
import * as d3 from "npm:d3";

export function histogramChart({
  data,
  useUnique  = false,
  binStep    = 0.05,
  sizeFactor = 1.2,
  margin     = { top:20, right:20, bottom:40, left:50 },
  colour     = "#006DAE",
  height0    = 300,
  barGap     = 2,
  firstGap   = 3
} = {}) {

  /* ── guard ─────────────────────────────────────────────── */
  if (!data?.length) {
    const span = document.createElement("span");
    span.textContent = "No peptide proportion data.";
    span.style.fontStyle = "italic";
    return span;
  }

  const propKey = useUnique ? "proportion_unique" : "proportion_all";
  const rows = data
    .map(d => ({ value:+d[propKey], protein:d.protein ?? "Unknown" }))
    .filter(r => Number.isFinite(r.value) && r.value >= 0 && r.value <= 1);

  /* ── bins (max edge = 1.00) ────────────────────────────── */
  const thresholds = d3.range(0, 1, binStep);
  const bins = d3.bin()
    .value(d => d.value)
    .domain([0,1])
    .thresholds(thresholds)
    (rows);

  const x = d3.scaleLinear([0,1]);
  const y = d3.scaleLinear(
              [0, d3.max(bins, b => b.length)],
              [height0 - margin.bottom, margin.top]
            ).nice();

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 600 ${height0}`)
    .attr("font-family", "sans-serif")
    .attr("font-size", 10*sizeFactor);

  const barG = svg.append("g");
  const txtG = svg.append("g");
  const xAxisG = svg.append("g");
  const yAxisG = svg.append("g")
      .attr("transform", `translate(${margin.left},0)`);

  const tip = d3.select(document.body).append("div")
    .style("position","absolute")
    .style("pointer-events","none")
    .style("background","#fff")
    .style("border","1px solid #ccc")
    .style("border-radius","4px")
    .style("padding","6px")
    .style("font","12px sans-serif")
    .style("opacity",0);

  /* rounded-top rectangle helper */
  const barPath = (w,h)=>
    `M0,0h${w}v${h}h-${w}Z
     M0,0a6,6 0 0 1 6,-6h${Math.max(0,w-12)}
     a6,6 0 0 1 6,6`;

  /* ═════════════  responsive layout  ═════════════ */
  function layout(wPx){
    x.range([margin.left, wPx - margin.right]);
    svg.attr("viewBox", `0 0 ${wPx} ${height0}`);

    const binsVis = bins.filter(b => b.length);   // non-empty

    /* ——— bars ——— */
    const bars = barG.selectAll("path")
      .data(binsVis, d => d.x0);

    bars.exit().remove();

    bars.enter().append("path")
        .attr("fill", colour)
        .attr("stroke","none")                  // ← no white stripe
        .merge(bars)
        .each(function(bin){
          const first  = bin.x0 === 0;
          const left   = x(bin.x0) + (first ? firstGap : barGap/2);
          const width  = Math.max(1,
                          x(bin.x1)-x(bin.x0)-(first?firstGap:barGap));
          const height = y(0) - y(bin.length);
          d3.select(this)
            .attr("d", barPath(width,height))
            .attr("transform", `translate(${left},${y(bin.length)})`);
        })
        /* tooltip handlers */
        .on("mouseover", (e, bin) => {
          const pct = v => (v*100).toFixed(1)+"%";
          let html =
            `<strong>Range:</strong> ${pct(bin.x0)} – ${pct(bin.x1)}<br/>`+
            `<strong>Total:</strong> ${bin.length}<br/><br/>`;
          d3.rollups(bin, v=>v.length, d=>d.protein)
            .sort((a,b)=>d3.descending(a[1],b[1]))
            .forEach(([p,c])=> html+=`${p}: <strong>${c}</strong><br/>`);
          tip.html(html)
             .style("left", `${e.pageX+10}px`)
             .style("top",  `${e.pageY+10}px`)
             .style("opacity",1);
        })
        .on("mousemove", e =>
          tip.style("left",`${e.pageX+10}px`)
             .style("top", `${e.pageY+10}px`))
        .on("mouseout", ()=> tip.style("opacity",0));

    /* ——— count labels ——— */
    const lbl = txtG.selectAll("text")
      .data(binsVis, d => d.x0);

    lbl.exit().remove();

    lbl.enter().append("text")
        .attr("fill","#424242")
        .attr("font-family","'Roboto Mono', monospace")
        .attr("font-size",11*sizeFactor)
        .attr("text-anchor","middle")
      .merge(lbl)
        .attr("x", bin=>{
          const first = bin.x0===0;
          const left  = x(bin.x0)+(first?firstGap:barGap/2);
          const width = Math.max(1,
                         x(bin.x1)-x(bin.x0)-(first?firstGap:barGap));
          return left + width/2;
        })
        .attr("y", bin=> y(bin.length)-8)
        .text(bin=>bin.length);

    /* ——— axes ——— */
    xAxisG.attr("transform",`translate(0,${height0-margin.bottom})`)
      .call(
        d3.axisBottom(x)
           .tickFormat(d3.format(".0%"))
           .ticks(Math.min(10,wPx/60))
      )
      .call(g=>{
        g.selectAll("path,line")
            .attr("stroke","#424242")
            .attr("stroke-width",1.5);
        g.selectAll("text")
            .attr("fill","#424242")
            .attr("font-family","'Roboto Mono', sans-serif")
            .attr("font-size",9*sizeFactor);
      });

    yAxisG.call(d3.axisLeft(y).ticks(5))
      .call(g=>{
        g.selectAll("path,line")
            .attr("stroke","#424242")
            .attr("stroke-width",1.5);
        g.selectAll("text")
            .attr("fill","#424242")
            .attr("font-family","'Roboto Mono', sans-serif")
            .attr("font-size",9*sizeFactor);
      });
  }

  /* ── wrapper + ResizeObserver ───────────────────────────── */
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.appendChild(svg.node());

  const ro = new ResizeObserver(e=> layout(e[0].contentRect.width));
  ro.observe(wrapper);

  /* first draw */
  layout(wrapper.getBoundingClientRect().width);
  return wrapper;
}
