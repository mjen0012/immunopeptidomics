/*****************************************************************
 *  areaChart() → { update(scale), height }        ·  clip-safe
 *  --------------------------------------------------------------
 *  Proportional area chart with hover tooltip.
 *  • Keeps every visual element strictly inside the x-axis band.
 *****************************************************************/
import * as d3 from "npm:d3";

let _id = 0;                               // uid for <clipPath>

export function areaChart(
  slotG,
  {
    data,
    xScale,
    sizeFactor = 1.2,
    margin     = { top: 12, right: 20, bottom: 30, left: 40 },
    height     = 90 * sizeFactor,
    colour     = "#55a0fb"
  } = {}
) {
  if (!data?.length) {
    slotG.append("text")
         .attr("x", margin.left)
         .attr("y", margin.top)
         .attr("font-style", "italic")
         .text("No conservation data");
    return { update: () => {}, height };
  }

  /* ---- Y-scale --------------------------------------------------- */
  const y = d3.scaleLinear(
    [0, d3.max(data, d => d.value)],
    [height - margin.bottom, margin.top]
  );

  /* ---- clip-path (same pattern as stackedChart.js) -------------- */
  const clipId = `clip-area-${++_id}`;
  const [x0, x1] = xScale.range();
  const clip = slotG.append("defs")
    .append("clipPath")
      .attr("id", clipId)
      .attr("clipPathUnits", "userSpaceOnUse") // PPT is happier when explicit
    .append("rect")
      .attr("x", x0)
      .attr("y", margin.top)
      .attr("width",  x1 - x0)
      .attr("height", height - margin.top - margin.bottom);

  /* ---- area + tooltip group – clipped --------------------------- */
  const gClipped = slotG.append("g")
      .attr("clip-path", `url(#${clipId})`);

  /* ---- blue proportional area ----------------------------------- */
  const areaGen = d3.area()
    .x(d => xScale(d.position))
    .y0(y(0))
    .y1(d => y(d.value));

  const bg = gClipped.append("path")
      .datum(data)
      .attr("fill", colour)
      .attr("fill-opacity", 0.4)
      .attr("stroke", colour)
      .attr("stroke-width", 1.5)
      .attr("d", areaGen);

  /* ---- hover rectangles + tooltip ------------------------------- */
  const tooltip = d3.select(document.body).append("div")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "#fff")
      .style("border", "1px solid #ccc")
      .style("border-radius", "4px")
      .style("padding", "6px")
      .style("font", "12px sans-serif")
      .style("opacity", 0);

  const hRects = gClipped.append("g").attr("class", "hover-rects")
    .selectAll("rect")
    .data(data)
    .enter().append("rect")
      .attr("y", margin.top)
      .attr("height", height - margin.top - margin.bottom)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("mouseover", (e, d) => {
        tooltip
          .style("opacity", 1)
          .html(`
            <strong>Position:</strong> ${d.position}<br/>
            <strong>Proportion:</strong> ${(d.value * 100).toFixed(1)}%<br/>
            <strong>Amino&nbsp;acid:</strong> ${d.aminoacid}
          `);
      })
      .on("mousemove", e =>
        tooltip.style("left", `${e.pageX + 10}px`)
               .style("top",  `${e.pageY + 10}px`)
      )
      .on("mouseout", () => tooltip.style("opacity", 0));

  positionRects(xScale);                    // initial layout

  function positionRects(scale) {
    hRects
      .attr("x",      d => scale(d.position - 0.5))
      .attr("width",  d => Math.max(0,
        scale(d.position + 0.5) - scale(d.position - 0.5)));
  }

  /* ---- x-axis ---------------------------------------------------- */
  const tickLen  = Math.min(6 * sizeFactor, 8);
  const fontSize = Math.min(12 * sizeFactor, 14);
  const strokeW  = Math.min(1.2 * sizeFactor, 2);
  const ax = d3.axisBottom(xScale)
    .tickFormat(d3.format("d"))
    .tickSizeOuter(0)
    .tickSize(tickLen);
  const axisG = slotG.append("g")
    .attr("class", "x-axis")
    .attr("font-size", fontSize)
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(ax);
  axisG.selectAll("path, line").attr("stroke-width", strokeW);

  /* ---- public update hook (called by dashboard zoom) ------------ */
  function update(newScale) {
    /* 1. rescale area */
    bg.attr("d", areaGen.x(d => newScale(d.position)));

    /* 2. move hover rectangles */
    positionRects(newScale);

    /* 3. resize the clip-path rect */
    const [n0, n1] = newScale.range();
    clip
      .attr("x", n0)
      .attr("width", n1 - n0);

    /* 4. refresh axis */
    const ax2 = d3.axisBottom(newScale)
      .tickFormat(d3.format("d"))
      .tickSizeOuter(0)
      .tickSize(tickLen);
    axisG.call(ax2);
    axisG.selectAll("path, line").attr("stroke-width", strokeW);
  }

  return { update, height };
}
