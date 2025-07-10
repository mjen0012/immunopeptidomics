/*****************************************************************
 *  areaChart() → { update(scale), height }
 *  --------------------------------------------------------------
 *  A proportional area-chart with optional red-mismatch overlay.
 *  — Synchronises its X-scale with the dashboard zoom.
 *  — Emits a simple tooltip on hover.
 *****************************************************************/
import * as d3 from "npm:d3";

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

  /* ---- blue proportional area  ---------------------------------- */
  const areaGen = d3.area()
    .x(d => xScale(d.position))
    .y0(y(0))
    .y1(d => y(d.value));

  const bg = slotG.append("path")
    .datum(data)
    .attr("fill", colour)
    .attr("fill-opacity", 0.4)
    .attr("stroke", colour)
    .attr("stroke-width", 1.5)
    .attr("d", areaGen);

  /* ---- hover overlay + tooltip ---------------------------------- */
  const tooltip = d3.select(document.body).append("div")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "#fff")
      .style("border", "1px solid #ccc")
      .style("border-radius", "4px")
      .style("padding", "6px")
      .style("font", "12px sans-serif")
      .style("opacity", 0);

  slotG.append("g")
    .selectAll("rect")
    .data(data)
    .enter().append("rect")
      .attr("x", d => xScale(d.position - 0.5))
      .attr("width", d => xScale(d.position + 0.5) - xScale(d.position - 0.5))
      .attr("y", margin.top)
      .attr("height", height - margin.top - margin.bottom)
      .attr("fill", "transparent")
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
        tooltip
          .style("left", `${e.pageX + 10}px`)
          .style("top",  `${e.pageY + 10}px`)
      )
      .on("mouseout", () => tooltip.style("opacity", 0));

  /* ---- axis ------------------------------------------------------ */
  const axisG = slotG.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")))
    .attr("font-size", 10 * sizeFactor);

  /* ---- public update hook (for zoom) ----------------------------- */
  function update(newScale) {
    bg.attr("d", areaGen.x(d => newScale(d.position)));
    slotG.selectAll("rect")
      .attr("x", d => newScale(d.position - 0.5))
      .attr("width", d => newScale(d.position + 0.5) - newScale(d.position - 0.5));
    axisG.call(d3.axisBottom(newScale).tickFormat(d3.format("d")));
  }

  return { update, height };
}
