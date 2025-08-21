// components/peptideScanChart.js
/*****************************************************************
 *  peptideScanChart() → { update(scale), setZoom(transform), height }
 *  - Standalone component for “all peptides for one allele”
 *  - Uses the SAME percentile → color mapping as heatmapChart.js:
 *      * 0–2   : interpolateBlues(1 - p/2)
 *      * 2–50  : interpolateReds((p-2)/(50-2))
 *      * >50   : interpolateReds(1)
 *  - No bar borders
 *  - Simplified tooltip: peptide, allele, EL, BA
 *  - Two-way zoom sync via onZoom + setZoom()
 *****************************************************************/
import * as d3 from "npm:d3@7";

let _uid = 0;

export function peptideScanChart(
  slotG,    // d3 selection of a <g> inside an <svg>
  {
    data        = [],              // [{start, length, peptide, peptide_aligned?}]
    alleleData  = [],              // [{allele, peptide, netmhcpan_el_percentile, netmhcpan_ba_percentile}]
    xScale,                        // shared base/current scale from heatmap
    rowHeight   = 18,
    gap         = 2,
    sizeFactor  = 1.2,
    margin      = { top: 20, right: 20, bottom: 30, left: 40 },
    mode        = "EL",            // "EL" | "BA" (optional)
    onZoom      = () => {}
  } = {}
){
  const rows = Array.isArray(data) ? [...data] : [];
  rows.sort((a,b)=> d3.ascending(a.start, b.start));

  // pack lanes
  const levels = [];
  for (const p of rows) {
    let lvl = levels.findIndex(end => p.start >= end);
    if (lvl === -1) { lvl = levels.length; levels.push(0); }
    p.level = lvl;
    levels[lvl] = p.start + p.length;
  }
  const nLevels = Math.max(1, levels.length);
  const height  = margin.top + nLevels * rowHeight + margin.bottom;

  // build percentile lookups by peptide
  const normPep = s => String(s||"").toUpperCase().replace(/-/g,"").trim();
  const elMap = new Map(), baMap = new Map();
  for (const r of alleleData) {
    const k = normPep(r?.peptide);
    if (!k) continue;
    if (r?.netmhcpan_el_percentile != null) elMap.set(k, +r.netmhcpan_el_percentile);
    if (r?.netmhcpan_ba_percentile != null) baMap.set(k, +r.netmhcpan_ba_percentile);
  }
  const modeNow = String(mode||"EL").toUpperCase().includes("BA") ? "BA" : "EL";

  // ---- SAME color mapping as heatmapChart.js --------------------
  const BLUE_MAX = 2, RED_MIN = 50;
  const pctToFill = (p) => {
    if (p == null || !isFinite(p)) return "#f0f0f0";        // neutral for missing
    const v = +p;
    if (v <= BLUE_MAX) return d3.interpolateBlues(1 - v / BLUE_MAX);
    if (v <= RED_MIN)  return d3.interpolateReds((v - BLUE_MAX) / (RED_MIN - BLUE_MAX));
    return d3.interpolateReds(1);
  };

  const fillFor = d => {
    const k = normPep(d.peptide_aligned || d.peptide);
    const v = (modeNow === "BA" ? baMap.get(k) : elMap.get(k));
    return pctToFill(v);
  };

  // clip-path to x-axis band
  const clipId = `clip-pep-${++_uid}`;
  const [x0, x1] = xScale.range();
  slotG.append("defs")
      .append("clipPath").attr("id", clipId)
      .append("rect")
        .attr("x", x0)
        .attr("y", margin.top)
        .attr("width",  Math.max(0, x1 - x0))
        .attr("height", Math.max(0, height - margin.top - margin.bottom));

  // bars (no borders)
  const gBars = slotG.append("g").attr("clip-path", `url(#${clipId})`);
  const bars  = gBars.selectAll("rect")
    .data(rows)
    .enter().append("rect")
      .attr("fill",  fillFor)
      .attr("stroke", "none");

  // axis
  const axisY = height - margin.bottom;
  const axisG = slotG.append("g")
    .attr("class", "x-axis")
    .attr("font-size", 10 * sizeFactor)
    .attr("transform", `translate(0,${axisY})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));

  // layout bars
  const posBars = scale => {
    bars
      .attr("x", d => scale(d.start - 0.5) + gap / 2)
      .attr("width", d => {
        const w = scale(d.start + d.length - 0.5) - scale(d.start - 0.5) - gap;
        return Math.max(0, w);
      })
      .attr("y", d => margin.top + (nLevels - 1 - d.level) * rowHeight + gap / 2)
      .attr("height", rowHeight - gap);
  };
  posBars(xScale);

  // tooltip (simplified)
  if (rows.length) {
    const tooltip = d3.select(document.body).append("div")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "#fff")
      .style("border", "1px solid #ccc")
      .style("border-radius", "4px")
      .style("padding", "6px 8px")
      .style("font", "12px sans-serif")
      .style("opacity", 0)
      .style("box-shadow", "0 4px 18px rgba(0,0,0,.15)");

    const fmt = d => (d==null||!isFinite(d)) ? "—" : (+d).toFixed(1);

    bars
      .on("mousemove", (e, d) => {
        const k  = normPep(d.peptide_aligned || d.peptide);
        const el = elMap.get(k), ba = baMap.get(k);
        tooltip.html(
          `<div><strong>Peptide:</strong> ${d.peptide}</div>
           <div><strong>Allele:</strong> ${(alleleData[0]?.allele) ?? ""}</div>
           <div>EL: ${fmt(el)}&nbsp;&nbsp;|&nbsp;&nbsp;BA: ${fmt(ba)}</div>`
        )
        .style("left", `${e.pageX + 10}px`)
        .style("top",  `${e.pageY + 10}px`)
        .style("opacity", 1);
      })
      .on("mouseout", () => tooltip.style("opacity", 0));
  }

  // public update hook (driven by heatmap zoom)
  function update(newScale) {
    posBars(newScale);
    axisG.call(d3.axisBottom(newScale).tickFormat(d3.format("d")));
  }

  // two-way zoom: attach to root <svg>
  const rootSvg = d3.select(slotG.node().ownerSVGElement);
  const totalW  = xScale.range()[1] + margin.right;

  const zoom = d3.zoom()
    .scaleExtent([1, 15])
    .on("zoom", ev => {
      const t  = ev.transform;
      const zx = t.rescaleX(xScale);
      update(zx);
      onZoom(zx, t);
    });

  rootSvg
    .call(zoom)
    .on("dblclick.zoom", null)
    .call(zoom.extent([[margin.left, 0], [totalW - margin.right, height]]))
    .call(zoom.translateExtent([[margin.left, 0], [totalW - margin.right, height]]));

  function setZoom(transform) {
    if (transform) rootSvg.call(zoom.transform, transform);
  }

  return { update, setZoom, height };
}
