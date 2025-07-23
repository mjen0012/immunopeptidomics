/*****************************************************************
 *  heatmapChart()  →  HTMLElement      ·  v3  (tooltip + click‑drag)
 *  --------------------------------------------------------------
 *  Responsive heat‑map (position × allele) with:
 *    • 0–2 % blue gradient · 2–50 % white→red · ≥50 % solid red
 *    • hover tooltip (AA + peptide)
 *    • scroll‑wheel zoom
 *    • click‑drag pan, clamped to data bounds
 *      (drag only fires when the mouse is pressed, so hover is unaffected)
 *****************************************************************/
import * as d3 from "npm:d3@7";

export function heatmapChart({
  data,
  posExtent,
  cellHeight = 20,
  sizeFactor = 1.2,
  margin     = { top:16, right:20, bottom:60, left:90 },
  legendOpts = {
    title     : "Percentile (strong bind → blue)",
    width     : 220,
    height    : 8,
    tickFormat: d3.format(".0%")
  }
} = {}) {

  /* ── guard ───────────────────────────────────────────── */
  if (!data?.length) {
    const span = document.createElement("span");
    span.textContent = "No heat‑map data.";
    span.style.fontStyle = "italic";
    return span;
  }

  /* ── axis domains ───────────────────────────────────── */
  const alleles = [...new Set(data.map(d => d.allele))].sort();
  const [posMin, posMax] = posExtent ?? [
    d3.min(data, d => d.pos),
    d3.max(data, d => d.pos)
  ];

  /* ── colour scale (0–100) ───────────────────────────── */
  const BLUE_MAX = 2;
  const RED_MIN  = 50;

  function colourScale(p) {
    p = +p;
    if (p <= BLUE_MAX) {
      return d3.interpolateBlues(1 - p / BLUE_MAX);
    }
    if (p <= RED_MIN) {
      return d3.interpolateReds((p - BLUE_MAX) / (RED_MIN - BLUE_MAX));
    }
    return d3.interpolateReds(1);
  }

  /* y‑band */
  const y = d3.scaleBand()
    .domain(alleles)
    .range([margin.top,
            margin.top + cellHeight * alleles.length])
    .paddingInner(0.05);

  /* ── svg scaffold ───────────────────────────────────── */
  const innerH = y.range()[1] - margin.top;
  const height0 = innerH + margin.top + margin.bottom;

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 1 ${height0}`)   // width set in layout()
    .attr("font-family", "sans-serif")
    .attr("font-size", 10 * sizeFactor)
    .style("width", "100%");

  const cellG  = svg.append("g");          // heat‑map rects
  const xAxisG = svg.append("g");
  const yAxisG = svg.append("g")
    .attr("transform", `translate(${margin.left - 4},0)`);

  /* ── tooltip ────────────────────────────────────────── */
  const tip = d3.select(document.body).append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "#fff")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("padding", "6px")
    .style("font", "12px sans-serif")
    .style("opacity", 0);

  /* ── persistent layout vars ─────────────────────────── */
  let xBase = null;   // un‑zoomed scale
  let viewW = null;   // latest pixel width

  /* ── layout (initial + resize) ──────────────────────── */
  function layout(wPx) {
    viewW = wPx;
    svg.attr("viewBox", `0 0 ${wPx} ${height0}`);

    /* base x‑scale */
    xBase = d3.scaleLinear(
      [posMin - 0.5, posMax + 0.5],
      [margin.left, wPx - margin.right]
    );

    /* rects */
    const rects = cellG.selectAll("rect")
      .data(data, d => `${d.allele}|${d.pos}`);

    rects.exit().remove();

    rects.enter().append("rect")
        .attr("stroke", "none")
      .merge(rects)
        .attr("y", d => y(d.allele))
        .attr("height", y.bandwidth())
        .attr("fill", d => colourScale(d.pct))
        .attr("x", d => xBase(d.pos - 0.5))
        .attr("width", d => Math.max(1,
          xBase(d.pos + 0.5) - xBase(d.pos - 0.5)))
        .on("mouseover", (e, d) => {
          tip.html(`
            <strong>Allele:</strong> ${d.allele}<br/>
            <strong>Position:</strong> ${d.pos}<br/>
            <strong>Percentile:</strong> ${(+d.pct).toFixed(2)} %<br/>
            <strong>Amino&nbsp;acid:</strong> ${d.aa}<br/>
            <strong>Peptide:</strong> ${d.peptide}
          `)
          .style("left", `${e.pageX + 10}px`)
          .style("top",  `${e.pageY + 10}px`)
          .style("opacity", 1);
        })
        .on("mousemove", e =>
          tip.style("left", `${e.pageX + 10}px`)
             .style("top",  `${e.pageY + 10}px`))
        .on("mouseout", () => tip.style("opacity", 0));

    /* axes */
    xAxisG
      .attr("transform", `translate(0,${y.range()[1]})`)
      .call(
        d3.axisBottom(xBase)
          .tickFormat(d3.format("d"))
          .ticks(Math.min(15, wPx / 60))
      )
      .call(axisStyling);

    yAxisG
      .call(d3.axisLeft(y).tickSize(0))
      .call(axisStyling);

    /* legend */
    drawLegendOnce();
    legendG.attr(
      "transform",
      `translate(${(wPx - legendOpts.width) / 2},
                 ${height0 - legendOpts.height - 22})`
    );
  }

  /* ── zoom behaviour (wheel + click‑drag) ───────────────── */
  const zoom = d3.zoom()
    .scaleExtent([1, (posMax - posMin) / 10])
    .on("zoom", zoomed);

  svg.call(zoom);                    // attaches to root; hover intact
  svg.on("dblclick.zoom", null);     // keep double‑click default pan

  function zoomed(event) {
    if (!xBase) return;              // safety

    let t = event.transform;
    t = clampTransform(t);           // keep range inside bounds

    const zx = t.rescaleX(xBase);

    cellG.selectAll("rect")
      .attr("x", d => zx(d.pos - 0.5))
      .attr("width",
        d => Math.max(1, zx(d.pos + 0.5) - zx(d.pos - 0.5)));

    xAxisG.call(
      d3.axisBottom(zx)
        .tickFormat(d3.format("d"))
        .ticks(Math.min(15, viewW / 60))
    ).call(axisStyling);

    if (t !== event.transform) svg.call(zoom.transform, t);
  }

  /* keep viewport inside [posMin … posMax] ----------------- */
  function clampTransform(t) {
    const apply = x => x * t.k + t.x;            // px after transform
    const leftEdge  = apply(xBase(posMin - 0.5));
    const rightEdge = apply(xBase(posMax + 0.5));
    const minPx     = margin.left;
    const maxPx     = viewW - margin.right;

    let tx = t.x;
    if (leftEdge  > minPx) tx -= (leftEdge  - minPx);
    if (rightEdge < maxPx) tx += (maxPx    - rightEdge);

    return (tx === t.x) ? t
      : d3.zoomIdentity.translate(tx, 0).scale(t.k);
  }


  /* ── one‑time legend generator ─────────────────────────────── */
  const legendG = svg.append("g");
  let legendDrawn = false;
  function drawLegendOnce(){
    if (legendDrawn) return;
    legendDrawn = true;

    const {width, height, title} = legendOpts;   // ignore tickFormat

    /* layout: three equal‑width blocks ---------------------------- */
    const segW = width / 3;

    /* title ------------------------------------------------------- */
    legendG.append("text")
      .attr("x", width / 2)
      .attr("y", -6)
      .attr("text-anchor", "middle")
      .attr("font-family", "sans-serif")
      .attr("font-size", 11 * sizeFactor)
      .attr("fill", "#424242")
      .text(title);

    /* helper to add one segment + label -------------------------- */
    function addSegment(x, fill, label){
      legendG.append("rect")
        .attr("x", x)
        .attr("y", 0)
        .attr("width", segW)
        .attr("height", height)
        .attr("fill", fill);

      legendG.append("text")
        .attr("x", x + segW / 2)
        .attr("y", height + 12)
        .attr("text-anchor", "middle")
        .attr("font-family", "'Roboto Mono', sans-serif")
        .attr("font-size", 9 * sizeFactor)
        .attr("fill", "#424242")
        .text(label);
    }

    /* segment 1 — 0‑2 % : blue → white --------------------------- */
    {
      const gid = `lg‑bluewhite-${Math.random().toString(36).slice(2)}`;
      const g   = svg.append("defs").append("linearGradient").attr("id", gid);
      g.append("stop").attr("offset","0%").attr("stop-color", colourScale(0));
      g.append("stop").attr("offset","100%").attr("stop-color", colourScale(2));
      addSegment(0, `url(#${gid})`, "0 – 2 %");
    }

    /* segment 2 — 2‑50 % : white → red --------------------------- */
    {
      const gid = `lg‑whitered-${Math.random().toString(36).slice(2)}`;
      const g   = svg.append("defs").append("linearGradient").attr("id", gid);
      g.append("stop").attr("offset","0%").attr("stop-color", colourScale(2));
      g.append("stop").attr("offset","100%").attr("stop-color", colourScale(50));
      addSegment(segW, `url(#${gid})`, "2 – 50 %");
    }

    /* segment 3 — 50‑100 % : solid red --------------------------- */
    addSegment(segW * 2, colourScale(100), "50 – 100 %");
  }



  /* shared axis styling */
  function axisStyling(g) {
    g.selectAll("path,line")
      .attr("stroke", "#424242")
      .attr("stroke-width", 1.5);
    g.selectAll("text")
      .attr("fill", "#424242")
      .attr("font-family", "'Roboto Mono', sans-serif")
      .attr("font-size", 9 * sizeFactor);
  }

  /* ── mount + observe ─────────────────────────────────── */
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.appendChild(svg.node());

  const ro = new ResizeObserver(e => layout(e[0].contentRect.width));
  ro.observe(wrapper);                // triggers initial layout

  return wrapper;
}
