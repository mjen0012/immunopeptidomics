/******************************************************************
 * downloadSvgButton({ label, filename, getSvg })
 * - getSvg: () => SVGElement (called on click to grab the current node)
 ******************************************************************/
export function downloadSvgButton({ label = "Download SVG", filename = "chart.svg", getSvg }) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `
    display:inline-flex; align-items:center; gap:.5rem;
    padding:.4rem .7rem; border:1px solid #D4D4D4; border-radius:8px;
    background:#fff; cursor:pointer; font:13px/1.2 sans-serif;
  `;

  btn.addEventListener("click", () => {
    const svg = typeof getSvg === "function" ? getSvg() : getSvg;
    if (!svg || svg.tagName?.toLowerCase() !== "svg") {
      alert("SVG not found.");
      return;
    }

    // Clone so we don’t mutate the on-screen SVG
    const clone = svg.cloneNode(true);

    // Give explicit width/height (use on-screen pixels)
    const { width, height } = svg.getBoundingClientRect();
    if (width && height) {
      clone.setAttribute("width",  Math.round(width));
      clone.setAttribute("height", Math.round(height));
    }

    // Ensure namespace attributes exist
    if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!clone.getAttribute("xmlns:xlink")) clone.setAttributeNS(
      "http://www.w3.org/2000/xmlns/",
      "xmlns:xlink",
      "http://www.w3.org/1999/xlink"
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return btn;
}
