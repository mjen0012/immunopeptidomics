/* ────────────────────────────────────────────────────────────────
   components/peptideColourKey.js · v2
   “Peptide colour key” for the peptide chart
   • Two modes:
     - Allele mode: 3 percentile blocks + optional "No data"
     - Attribute mode: dynamic categories from visible data
   • Rule matched to chart: non-attribute radios imply allele mode.
────────────────────────────────────────────────────────────────*/
import * as d3 from "npm:d3";

/* Contrast-aware text for a given hex background */
function textFor(bgHex) {
  const hex = String(bgHex || "#bbb").replace("#", "").trim().padEnd(6, "0");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const toLin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return L > 0.6 ? "#111" : "#fff";
}

export function peptideColourKey({
  label        = "Peptide colour key",
  square       = 22,
  gap          = 6,
  fontFamily   = "'Roboto', sans-serif",

  // mode controls
  isAllele     = false,       // true → show percentile blocks
  mode         = "EL",        // "EL" | "BA" or an Observable input with .value
  categories   = [],          // attribute mode: strings, sorted & present
  colourScale  = null,        // d3.ordinal for categories (matches chart)
  includeNoData= false,       // show a "No data" chip/swatch
  missingColor = "#f0f0f0"    // neutral (also used by chart)
} = {}) {
  const resolveMode = () => {
    const m = (mode && mode.value !== undefined ? String(mode.value) : String(mode)).toUpperCase();
    return m.includes("BA") ? "BA" : "EL";
  };

  const root = document.createElement("div");
  root.className = "pep-key-root";
  root.style.fontFamily = fontFamily;

  const style = document.createElement("style");
  style.textContent = `
.pep-key-root { width:100%; box-sizing:border-box; }
.pep-key-label { display:block; font-weight:500; margin-bottom:8px; }
.pep-key-note  { font-size:12px; color:#555; margin:-4px 0 8px 0; }

.pep-key-row, .pep-cat-wrap {
  display:flex; flex-wrap:wrap; gap:${gap}px ${gap * 1.5}px; align-items:center;
}

/* simple square swatch with centered text (for allele ranges) */
.pep-swatch {
  width:${square}px; height:${square}px;
  border-radius:6px; border:1px solid rgba(0,0,0,.12);
  display:inline-flex; align-items:center; justify-content:center;
  font-weight:600; font-size:${Math.max(11, Math.round(square * 0.55))}px;
  line-height:1; user-select:none;
}

/* category chip: square + label to the right */
.pep-cat {
  display:inline-flex; align-items:center; gap:8px;
  padding:2px 4px;
}
.pep-chip {
  width:${square}px; height:${square}px;
  border-radius:6px; border:1px solid rgba(0,0,0,.12);
}
.pep-cat-label {
  font-size:13px; color:#222; white-space:nowrap;
}
`;
  root.appendChild(style);

  if (label) {
    const lbl = document.createElement("div");
    lbl.className = "pep-key-label";
    lbl.textContent = label;
    root.appendChild(lbl);
  }

  if (isAllele) {
    const note = document.createElement("div");
    note.className = "pep-key-note";
    note.textContent = `Percentile scale (${resolveMode()})`;
    root.appendChild(note);

    // same colours as chart’s piecewiseColour mid-points
    const blueWhite = d3.scaleLinear().domain([0, 2]).range(["#006DAE", "#ffffff"]).clamp(true);
    const whiteRed  = d3.scaleLinear().domain([2, 50]).range(["#ffffff", "#e60000"]).clamp(true);

    const blocks = [
      { label: "0–2",     color: blueWhite(1) },
      { label: "2–50",    color: whiteRed(26) },
      { label: "50–100",  color: "#e60000" },
      ...(includeNoData ? [{ label: "No data", color: missingColor }] : [])
    ];

    const row = document.createElement("div");
    row.className = "pep-key-row";
    for (const b of blocks) {
      const sw = document.createElement("div");
      sw.className = "pep-swatch";
      sw.style.background = b.color;
      sw.style.color = textFor(b.color);
      sw.textContent = b.label;
      row.appendChild(sw);
    }
    root.appendChild(row);
    return root;
  }

  // Attribute mode
  if (categories && categories.length) {
    const wrap = document.createElement("div");
    wrap.className = "pep-cat-wrap";

    for (const key of categories) {
      const c = (colourScale ? colourScale(key) : "#A3A3A3") || "#A3A3A3";
      const item = document.createElement("div");
      item.className = "pep-cat";

      const chip = document.createElement("div");
      chip.className = "pep-chip";
      chip.style.background = c;

      const lab = document.createElement("span");
      lab.className = "pep-cat-label";
      lab.textContent = String(key);

      item.appendChild(chip);
      item.appendChild(lab);
      wrap.appendChild(item);
    }

    if (includeNoData) {
      const item = document.createElement("div");
      item.className = "pep-cat";
      const chip = document.createElement("div");
      chip.className = "pep-chip";
      chip.style.background = missingColor;
      const lab = document.createElement("span");
      lab.className = "pep-cat-label";
      lab.textContent = "No data";
      item.appendChild(chip);
      item.appendChild(lab);
      wrap.appendChild(item);
    }

    root.appendChild(wrap);
  } else {
    // If no categories but attribute mode, optionally show only “No data”
    if (includeNoData) {
      const row = document.createElement("div");
      row.className = "pep-key-row";
      const sw = document.createElement("div");
      sw.className = "pep-swatch";
      sw.style.background = missingColor;
      sw.style.color = textFor(missingColor);
      sw.textContent = "No data";
      row.appendChild(sw);
      root.appendChild(row);
    }
  }

  return root;
}
