/*****************************************************************
 *  Peptide track viewer  ·  v3 (allele-aware colouring)
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
    margin      = {top:20, right:20, bottom:30, left:40},
    colourScale,                         // categorical for attribute_* ONLY

    /* NEW: allele-aware colouring */
    colourBy        = "attribute_1",     // radio selection (attribute_* or an allele string)
    alleleData      = [],                // rows with {allele, peptide, netmhcpan_el_percentile, netmhcpan_ba_percentile}
    alleles         = [],                // currently selected Class-I alleles
    percentileMode  = "EL",              // "EL" | "BA" or reactive with .value

    /* callback */
    onClick     = () => {}
  } = {}
) {
  /* ---------- pack rows into levels --------------------------- */
  const levels = [];
  if (data.length) {
    data.sort((a,b)=>d3.ascending(a.start,b.start)).forEach(p => {
      let lvl = levels.findIndex(end => p.start >= end);
      if (lvl === -1){ lvl = levels.length; levels.push(0); }
      p.level = lvl;
      levels[lvl] = p.start + p.length;
    });
  }
  const nLevels = Math.max(1, levels.length);
  const height  = margin.top + nLevels*rowHeight + margin.bottom;

  /* ---------- clip-path to x-axis range ----------------------- */
  const clipId = `clip-pep-${++_uid}`;
  const [x0,x1] = xScale.range();
  slotG.append("defs")
       .append("clipPath")
        .attr("id", clipId)
       .append("rect")
        .attr("x", x0)
        .attr("y", margin.top)
        .attr("width",  x1 - x0)
        .attr("height", height - margin.top - margin.bottom);

  /* ---------- allele lookups & colourer (NEW) ----------------- */
  const normPep    = s => String(s || "").toUpperCase().replace(/-/g,"").trim();
  const normAllele = s => String(s || "").toUpperCase().trim();
  const resolveMode = () => {
    const m = (percentileMode && percentileMode.value !== undefined
                ? String(percentileMode.value) : String(percentileMode)).toUpperCase();
    return m.includes("BA") ? "BA" : "EL";
  };
  const modeNow = resolveMode();

  // Build EL/BA maps keyed by "ALLELE|PEPTIDEUNGAPPED"
  const elMap = new Map(), baMap = new Map();
  for (const r of alleleData || []) {
    const a = normAllele(r?.allele);
    const p = normPep(r?.peptide);
    if (!a || !p) continue;
    if (r?.netmhcpan_el_percentile != null) elMap.set(`${a}|${p}`, +r.netmhcpan_el_percentile);
    if (r?.netmhcpan_ba_percentile != null) baMap.set(`${a}|${p}`, +r.netmhcpan_ba_percentile);
  }

  // piecewise colour: 0–2 blue→white, 2–50 white→red, 50–100 red
  const blueWhite = d3.scaleLinear().domain([0, 2]).range(["#006DAE", "#ffffff"]).clamp(true);
  const whiteRed  = d3.scaleLinear().domain([2,50]).range(["#ffffff", "#e60000"]).clamp(true);
  const piecewiseColour = v => {
    if (v == null || Number.isNaN(+v)) return "#f0f0f0";   // neutral for missing
    const x = +v;
    if (x <= 2)  return blueWhite(x);
    if (x <= 50) return whiteRed(x);
    return "#e60000";
  };

  const alleleSetUC = new Set((alleles || []).map(normAllele));
  const colourByUC  = normAllele(colourBy);
  const usingAlleleColour = alleleSetUC.has(colourByUC);

  const fillForBar = d => {
    if (!usingAlleleColour) {
      // attribute_* path (unchanged)
      const key = (d[colourBy] ?? d.attribute_1 ?? d.attribute);
      return colourScale ? colourScale(key) : "#A3A3A3";
    }
    // allele path: look up percentile for (allele, ungapped peptide)
    const pepKey = normPep(d.peptide_aligned || d.peptide);
    const pair   = `${colourByUC}|${pepKey}`;
    const v = (modeNow === "BA" ? baMap.get(pair) : elMap.get(pair));
    return piecewiseColour(v);
  };

  /* ---------- bars -------------------------------------------- */
  const gBars = slotG.append("g").attr("clip-path", `url(#${clipId})`);
  const bars  = gBars.selectAll("rect")
      .data(data)
      .enter().append("rect")
        .attr("fill", fillForBar)                 // <— NEW logic used here
        .attr("stroke", "#444")
        .attr("stroke-width", 0.5*sizeFactor)
        .on("click", (event, d) => {
          onClick(d);
          console.log(`Clicked peptide: ${d.peptide_aligned} start=${d.start} length=${d.length}`);
        });

  /* ---------- x-axis ------------------------------------------ */
  const axisY = height - margin.bottom;
  const axisG = slotG.append("g")
      .attr("class","x-axis")
      .attr("font-size", 10*sizeFactor)
      .attr("transform",`translate(0,${axisY})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));

  /* ---------- layout helper ----------------------------------- */
  const posBars = scale => {
    bars
      .attr("x", d => scale(d.start - 0.5) + gap/2)
      .attr("width", d => Math.max(0,
        scale(d.start + d.length - 0.5) - scale(d.start - 0.5) - gap))
      .attr("y", d => margin.top + (nLevels-1-d.level)*rowHeight + gap/2)
      .attr("height", rowHeight - gap);
  };
  posBars(xScale);

  /* ---------- tooltip (unchanged) ------------------------------ */
  if (data.length){
    const tooltip = d3.select(document.body).append("div")
        .style("position","absolute")
        .style("pointer-events","none")
        .style("background","#fff")
        .style("border","1px solid #ccc")
        .style("border-radius","4px")
        .style("padding","6px")
        .style("font","12px sans-serif")
        .style("opacity",0);

    bars
      .on("mousemove",(e,d)=>{
        tooltip.html(`
          <strong>Peptide:</strong> ${d.peptide_aligned}<br/>
          <strong>Aligned Peptide:</strong> ${d.peptide}<br/>
          <strong>Protein:</strong> ${d.protein}<br/>
          <strong>Attribute&nbsp;1:</strong> ${d.attribute_1??""}<br/>
          <strong>Attribute&nbsp;2:</strong> ${d.attribute_2??""}<br/>
          <strong>Attribute&nbsp;3:</strong> ${d.attribute_3??""}
        `)
        .style("left",`${e.pageX+10}px`)
        .style("top", `${e.pageY+10}px`)
        .style("opacity",1);
      })
      .on("mouseout",()=>tooltip.style("opacity",0));
  }

  /* ---------- public update ----------------------------------- */
  function update(newScale){
    posBars(newScale);
    axisG.call(d3.axisBottom(newScale).tickFormat(d3.format("d")));
  }

  return {update, height};
}
