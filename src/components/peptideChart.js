/*****************************************************************
 *  Peptide track viewer  ·  v4 (allele/attribute simple rule)
 *  Rule: if `colourBy` is NOT "attribute_1/2/3" ⇒ allele mode.
 *****************************************************************/
import * as d3 from "npm:d3";

let _uid = 0;

export function peptideChart(
  slotG,
  {
    data        = [],
    xScale,
    rowHeight   = 18,
    gap         = 2,
    sizeFactor  = 1.2,
    margin      = { top: 20, right: 20, bottom: 30, left: 40 },

    // categorical scale for attribute_* chips (ignored in allele mode)
    colourScale,
    missingColor = "#f0f0f0",

    // colour selector (radio): "attribute_1/2/3" OR an allele string
    colourBy        = "attribute_1",

    // allele data + picks for percentile colouring (Class I)
    // rows should include:
    //   allele, peptide, netmhcpan_el_percentile, netmhcpan_ba_percentile
    alleleData      = [],
    alleles         = [],

    // "EL" | "BA" or an Observable input with .value
    percentileMode  = "EL",

    // click callback
    onClick         = () => {}
  } = {}
) {
  /* ---------- pack rows into non-overlapping levels ------------ */
  const rows = Array.isArray(data) ? [...data] : [];
  rows.sort((a, b) => d3.ascending(a.start, b.start));

  const levels = [];
  for (const p of rows) {
    let lvl = levels.findIndex(end => p.start >= end);
    if (lvl === -1) { lvl = levels.length; levels.push(0); }
    p.level = lvl;
    levels[lvl] = p.start + p.length;
  }
  const nLevels = Math.max(1, levels.length);
  const height  = margin.top + nLevels * rowHeight + margin.bottom;

  /* ---------- clip-path to x-axis range ------------------------ */
  const clipId = `clip-pep-${++_uid}`;
  const [x0, x1] = xScale.range();
  slotG.append("defs")
      .append("clipPath")
        .attr("id", clipId)
      .append("rect")
        .attr("x", x0)
        .attr("y", margin.top)
        .attr("width",  Math.max(0, x1 - x0))
        .attr("height", Math.max(0, height - margin.top - margin.bottom));

  /* ---------- allele lookups & colourer ------------------------ */

  // Simple rule for mode
  const usingAlleleColour = !/^attribute_[123]$/i.test(String(colourBy || ""));

  const normPep    = s => String(s || "").toUpperCase().replace(/-/g, "").trim();
  const normAllele = s => String(s || "").toUpperCase().trim();

  const resolveMode = () => {
    const m = (percentileMode && percentileMode.value !== undefined
      ? String(percentileMode.value) : String(percentileMode || "")).toUpperCase();
    return m.includes("BA") ? "BA" : "EL";
  };
  const modeNow = resolveMode();

  // Build EL/BA maps keyed by "ALLELE|PEPTIDEUNGAPPED"
  const elMap = new Map(), baMap = new Map();
  if (usingAlleleColour && Array.isArray(alleleData)) {
    for (const r of alleleData) {
      const a = normAllele(r?.allele);
      const p = normPep(r?.peptide);
      if (!a || !p) continue;
      if (r?.netmhcpan_el_percentile != null) elMap.set(`${a}|${p}`, +r.netmhcpan_el_percentile);
      if (r?.netmhcpan_ba_percentile != null) baMap.set(`${a}|${p}`, +r.netmhcpan_ba_percentile);
    }
  }

  // piecewise percentile → colour (0–2 blue→white, 2–50 white→red, 50–100 red)
  const blueWhite = d3.scaleLinear().domain([0, 2]).range(["#006DAE", "#ffffff"]).clamp(true);
  const whiteRed  = d3.scaleLinear().domain([2, 50]).range(["#ffffff", "#e60000"]).clamp(true);
  const piecewiseColour = v => {
    if (v == null || Number.isNaN(+v)) return missingColor; // neutral for missing
    const x = +v;
    if (x <= 2)  return blueWhite(x);
    if (x <= 50) return whiteRed(x);
    return "#e60000";
  };

  const colourByUC = normAllele(colourBy);
  const fillForBar = d => {
    if (!usingAlleleColour) {
      // Attribute path (categorical)
      const raw = (d[colourBy] ?? d.attribute_1 ?? d.attribute);
      const isMissing = raw == null || String(raw).trim() === "";
      if (isMissing) return missingColor;
      const key = String(raw);
      return colourScale ? colourScale(key) : "#A3A3A3";
    }
    // Allele path: look up percentile for (colourBy allele, ungapped peptide)
    const pepKey = normPep(d.peptide_aligned || d.peptide);
    const pair   = `${colourByUC}|${pepKey}`;
    const v = (modeNow === "BA" ? baMap.get(pair) : elMap.get(pair));
    return piecewiseColour(v);
  };

  /* ---------- bars --------------------------------------------- */
  const gBars = slotG.append("g").attr("clip-path", `url(#${clipId})`);
  const bars  = gBars.selectAll("rect")
    .data(rows)
    .enter().append("rect")
      .attr("fill",  fillForBar)
      .attr("stroke", "#444")
      .attr("stroke-width", 0.5 * sizeFactor)
      .on("click", (_, d) => onClick(d));

  /* ---------- x-axis ------------------------------------------- */
  const axisY     = height - margin.bottom;
  const tickLen   = Math.min(6 * sizeFactor, 8);
  const fontSize  = Math.min(12 * sizeFactor, 14);
  const strokeW   = Math.min(1.2 * sizeFactor, 2);
  const axis      = d3.axisBottom(xScale)
                      .tickFormat(d3.format("d"))
                      .tickSizeOuter(0)
                      .tickSize(tickLen);
  const axisG = slotG.append("g")
    .attr("class", "x-axis")
    .attr("font-size", fontSize)
    .attr("transform", `translate(0,${axisY})`)
    .call(axis);
  axisG.selectAll("path, line").attr("stroke-width", strokeW);

  /* ---------- layout helper ------------------------------------ */
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

  /* ---------- tooltip ------------------------------------------ */
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

    const fmtPct = d3.format(".1f");

    bars
      .on("mousemove", (e, d) => {
        // base fields
        const uploaded = d.peptide ?? "";          // ungapped (from CSV)
        const aligned  = d.peptide_aligned ?? "";  // gapped, profile-aligned

        // If colourBy is an allele (simple rule), include that allele's EL/BA
        let alleleHTML = "";
        if (usingAlleleColour) {
          const pepKey = normPep(d.peptide_aligned || d.peptide);
          const pair   = `${colourByUC}|${pepKey}`;
          const el = elMap.get(pair);
          const ba = baMap.get(pair);
          const elStr = (el != null && isFinite(el)) ? fmtPct(el) : "—";
          const baStr = (ba != null && isFinite(ba)) ? fmtPct(ba) : "—";
          alleleHTML =
            `<div style="margin:.35rem 0 .2rem; border-top:1px solid #eee;"></div>
             <div><strong>${colourByUC}</strong> percentiles</div>
             <div>EL: ${elStr}&nbsp;&nbsp;|&nbsp;&nbsp;BA: ${baStr}</div>`;
        }

        tooltip.html(
          `<div><strong>Peptide (input):</strong> ${uploaded}</div>
           <div><strong>Aligned (profile):</strong> ${aligned}</div>
           <div><strong>Protein:</strong> ${d.protein ?? ""}</div>
           <div><strong>Attribute&nbsp;1:</strong> ${d.attribute_1 ?? ""}</div>
           <div><strong>Attribute&nbsp;2:</strong> ${d.attribute_2 ?? ""}</div>
           <div><strong>Attribute&nbsp;3:</strong> ${d.attribute_3 ?? ""}</div>
           ${alleleHTML}`
        )
        .style("left", `${e.pageX + 10}px`)
        .style("top",  `${e.pageY + 10}px`)
        .style("opacity", 1);
      })
      .on("mouseout", () => tooltip.style("opacity", 0));
  }

  /* ---------- public update (for zoom rescale) ----------------- */
  function update(newScale) {
    posBars(newScale);
    const ax = d3.axisBottom(newScale)
      .tickFormat(d3.format("d"))
      .tickSizeOuter(0)
      .tickSize(tickLen);
    axisG.call(ax);
    axisG.selectAll("path, line").attr("stroke-width", strokeW);
  }

  return { update, height };
}
