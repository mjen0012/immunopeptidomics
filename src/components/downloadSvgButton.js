/******************************************************************
 * downloadSvgButton({ label, filename, getSvg })
 * - getSvg: () => SVGElement (called on click)
 * Optional hook on the source SVG:
 *   svg.__exportRefresh?.()   // lets charts reflow to current zoom
 ******************************************************************/
export function downloadSvgButton({ label = "Download SVG", filename = "chart.svg", getSvg }) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `
    display:inline-flex; align-items:center; gap:.5rem;
    padding:.4rem .7rem; border:1px solid #D4D4D4; border-radius:8px;
    background:#fff; cursor:pointer; font:13px/1.2 sans-serif;
  `;

  btn.addEventListener("click", async () => {
    const src = typeof getSvg === "function" ? getSvg() : getSvg;
    if (!src || src.tagName?.toLowerCase() !== "svg") {
      alert("SVG not found.");
      return;
    }

    // Let charts reflow to the *current* state (zoomed domain, etc.)
    try { src.__exportRefresh?.(); } catch {}

    // Wait a frame so the DOM reflects any reflow
    await new Promise(requestAnimationFrame);

    // Clone so we don’t mutate the live chart
    const clone = src.cloneNode(true);

    // ——— Inline computed styles (so ticks/labels/axes survive outside the page)
    inlineAllStyles(src, clone);

    // Size + namespaces
    const { width, height } = src.getBoundingClientRect();
    if (width && height) {
      clone.setAttribute("width",  Math.round(width));
      clone.setAttribute("height", Math.round(height));
    }
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    if (!clone.getAttribute("xmlns:xlink")) {
      clone.setAttributeNS("http://www.w3.org/2000/xmlns/","xmlns:xlink","http://www.w3.org/1999/xlink");
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return btn;
}

/* ---- utils ---------------------------------------------------- */
function inlineAllStyles(srcSvg, cloneSvg) {
  // Map source nodes to clone nodes by a synchronous tree walk
  const srcNodes   = [];
  const cloneNodes = [];
  walk(srcSvg, n => srcNodes.push(n));
  walk(cloneSvg, n => cloneNodes.push(n));

  const importantProps = [
    // shape/line
    "fill","fill-opacity","stroke","stroke-opacity","stroke-width",
    "stroke-linecap","stroke-linejoin","stroke-dasharray","stroke-dashoffset",
    "opacity","paint-order","shape-rendering","vector-effect",
    // text
    "font","font-family","font-size","font-weight","font-style",
    "letter-spacing","word-spacing","text-anchor","dominant-baseline"
  ];

  for (let i = 0; i < srcNodes.length; i++) {
    const s = srcNodes[i], c = cloneNodes[i];
    if (!(s instanceof Element) || !(c instanceof Element)) continue;

    const cs = getComputedStyle(s);
    // preserve existing inline style, then add computed
    const existing = c.getAttribute("style") || "";
    const add = importantProps
      .map(p => {
        const v = cs.getPropertyValue(p);
        return v ? `${p}:${v};` : "";
      })
      .join("");
    const final = (existing ? existing + ";" : "") + add;
    if (final) c.setAttribute("style", final);
  }

  // also copy any <style> blocks living in <defs>
  const srcStyles = srcSvg.querySelectorAll("style");
  if (srcStyles.length) {
    let defs = cloneSvg.querySelector("defs");
    if (!defs) defs = cloneSvg.insertBefore(cloneSvg.ownerDocument.createElementNS("http://www.w3.org/2000/svg","defs"), cloneSvg.firstChild);
    srcStyles.forEach(s => defs.appendChild(s.cloneNode(true)));
  }
}

function walk(node, visit) {
  visit(node);
  for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i], visit);
}
