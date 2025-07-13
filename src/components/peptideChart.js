/*****************************************************************
 *  Peptide track viewer  ·  v2
 *  --------------------------------------------------------------
 *  slotG      – <g> node already inside the master SVG
 *
 *  Exports: { update(scale), height }
 *****************************************************************/
import * as d3 from "npm:d3";

let _uid = 0;                               // uid for clipPath ids

export function peptideChart(
  slotG,
  {
    data        = [],
    xScale,
    rowHeight   = 18,
    gap         = 2,
    sizeFactor  = 1.2,
    margin      = {top:20, right:20, bottom:30, left:40},
    colourScale,
    /* ✨ NEW: callback when a bar is clicked ------------------- */
    onClick     = () => {}
  } = {}
) {
  /* ---------- track packing ---------------------------------- */
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

  /* ---------- clip-path to x-axis range ---------------------- */
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

  /* ---------- bars ------------------------------------------- */
  const gBars = slotG.append("g").attr("clip-path", `url(#${clipId})`);
  const bars  = gBars.selectAll("rect")
      .data(data)
      .enter().append("rect")
        .attr("fill", d => colourScale(d.attribute_1 ?? d.attribute))
        .attr("stroke", "#444")
        .attr("stroke-width", 0.5*sizeFactor)
        .on("click", (event, d) => {
          /* let the notebook know which bar was picked */
          onClick(d);                                     // mutate globals
          /* dev aid – identical to the old prototype   */
          console.log(
            `Clicked peptide: ${d.peptide_aligned} start= ${d.start} length= ${d.length}`
          );
        });

  /* ---------- x-axis ----------------------------------------- */
  const axisY = height - margin.bottom;
  const axisG = slotG.append("g")
      .attr("class","x-axis")
      .attr("font-size", 10*sizeFactor)
      .attr("transform",`translate(0,${axisY})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));

  /* ---------- layout helper ---------------------------------- */
  const posBars = scale => {
    bars
      .attr("x", d => scale(d.start - 0.5) + gap/2)
      .attr("width", d => Math.max(0,
        scale(d.start + d.length - 0.5) - scale(d.start - 0.5) - gap))
      .attr("y", d => margin.top + (nLevels-1-d.level)*rowHeight + gap/2)
      .attr("height", rowHeight - gap);
  };
  posBars(xScale);                      // initial draw

  /* ---------- tooltip ---------------------------------------- */
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

  /* ---------- public update ---------------------------------- */
  function update(newScale){
    posBars(newScale);
    axisG.call(d3.axisBottom(newScale).tickFormat(d3.format("d")));
  }

  return {update, height};
}
