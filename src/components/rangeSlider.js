// components/rangeSlider.js
// A11y-friendly dual-thumb range with "Single" / "Range" modes.
// API:
//   const el = rangeSlider({ label? });
//   el.value              -> [min, max]   (min===max means single)
//   el.setForClass(cls)   -> "I" | "II"   (updates allowed range + defaults)
//   el.mode               -> "single" | "range"
// Emits `input` on any change; style uses Roboto + #006DAE.

export function rangeSlider({
  label      = "Peptide length",
  color      = "#006DAE",
  fontFamily = "'Roboto', sans-serif"
} = {}) {
  // DOM
  const root = document.createElement("div");
  root.className = "rs-root";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", label);

  const title = document.createElement("label");
  title.className = "rs-title";
  title.textContent = label;

  const modeWrap = document.createElement("div");
  modeWrap.className = "rs-mode";
  modeWrap.innerHTML = `
    <label class="rs-radio"><input type="radio" name="rsmode" value="single" checked> Single</label>
    <label class="rs-radio"><input type="radio" name="rsmode" value="range"> Range</label>
  `;
  const modeRadios = [...modeWrap.querySelectorAll('input[type="radio"]')];

  const vis = document.createElement("div");
  vis.className = "rs-vis";
  vis.innerHTML = `
    <div class="rs-track">
      <div class="rs-fill"></div>
      <input class="rs-range rs-min" type="range" step="1" />
      <input class="rs-range rs-max" type="range" step="1" />
    </div>
    <div class="rs-nums">
      <label>Min <input class="rs-num rs-num-min" type="number" step="1"></label>
      <label>Max <input class="rs-num rs-num-max" type="number" step="1"></label>
    </div>
    <div class="rs-caption" aria-live="polite"></div>
  `;

  const rMin = vis.querySelector(".rs-min");
  const rMax = vis.querySelector(".rs-max");
  const nMin = vis.querySelector(".rs-num-min");
  const nMax = vis.querySelector(".rs-num-max");
  const fill = vis.querySelector(".rs-fill");
  const cap  = vis.querySelector(".rs-caption");

  // State
  let rangeMin = 8, rangeMax = 14; // allowed bounds
  let vMin = 9, vMax = 9;          // current selection
  let mode = "single";             // "single" | "range"

  function pct(val) {
    return ((val - rangeMin) * 100) / (rangeMax - rangeMin);
  }
  function clamp(val) {
    return Math.max(rangeMin, Math.min(rangeMax, Math.round(val)));
  }
  function setValue(min, max, {silent=false} = {}) {
    vMin = clamp(Math.min(min, max));
    vMax = clamp(Math.max(min, max));
    if (mode === "single") vMax = vMin;

    // reflect to inputs
    rMin.min = nMin.min = rangeMin;
    rMin.max = nMin.max = rangeMax;
    rMax.min = nMax.min = rangeMin;
    rMax.max = nMax.max = rangeMax;

    rMin.value = vMin;
    rMax.value = vMax;
    nMin.value = vMin;
    nMax.value = vMax;

    // update fill
    const left  = pct(Math.min(vMin, vMax));
    const right = 100 - pct(Math.max(vMin, vMax));
    fill.style.left  = `${left}%`;
    fill.style.right = `${right}%`;

    // caption
    cap.textContent = (vMin === vMax) ? `${vMin}` : `${vMin}–${vMax}`;

    // expose value + event
    root.value = [vMin, vMax];
    if (!silent) root.dispatchEvent(new CustomEvent("input"));
  }

  function setMode(next) {
    mode = (next === "range") ? "range" : "single";
    // Toggle visibility/disabled of max controls
    rMax.style.visibility = (mode === "range") ? "visible" : "hidden";
    nMax.parentElement.style.display = (mode === "range") ? "" : "none";
    // Keep min/max consistent
    if (mode === "single") setValue(vMin, vMin, {silent:true});
    setValue(vMin, vMax);
  }

  // Public: switch allowed range based on class
  function setForClass(cls) {
    const isII = String(cls).toUpperCase() === "II";
    rangeMin = isII ? 11 : 8;
    rangeMax = isII ? 30 : 14;
    const def = isII ? 15 : 9;

    // If current selection is out of new bounds, reset to default single
    const out = vMin < rangeMin || vMax > rangeMax;
    if (out) {
      setMode("single");
      setValue(def, def);
    } else {
      // just clamp to new bounds
      setValue(vMin, vMax);
    }
  }

  // Events
  rMin.addEventListener("input", () => {
    const x = clamp(+rMin.value);
    if (mode === "single") setValue(x, x);
    else setValue(Math.min(x, vMax), vMax);
  });
  rMax.addEventListener("input", () => {
    const x = clamp(+rMax.value);
    if (mode === "single") setValue(x, x);
    else setValue(vMin, Math.max(x, vMin));
  });
  nMin.addEventListener("input", () => {
    const x = clamp(+nMin.value);
    if (mode === "single") setValue(x, x);
    else setValue(Math.min(x, vMax), vMax);
  });
  nMax.addEventListener("input", () => {
    const x = clamp(+nMax.value);
    if (mode === "single") setValue(x, x);
    else setValue(vMin, Math.max(x, vMin));
  });
  modeRadios.forEach(r =>
    r.addEventListener("change", () => setMode(r.checked && r.value === "range" ? "range" : "single"))
  );

  // Init (Class I defaults)
  setMode("single");
  setForClass("I"); // 8–14, default 9

  // Styles (scoped)
  const style = document.createElement("style");
  style.textContent = `
.rs-root   { display:grid; gap:8px; font-family:${fontFamily}; }
.rs-title  { font:600 12px/1.2 ${fontFamily}; color:#111; letter-spacing:.2px; }
.rs-mode   { display:flex; gap:14px; }
.rs-radio  { font:500 12px/1 ${fontFamily}; color:#333; display:inline-flex; align-items:center; gap:6px; }
.rs-radio input { accent-color:${color}; }
.rs-vis    { display:grid; gap:8px; }
.rs-track  { position:relative; height:28px; }
.rs-track::before {
  content:""; position:absolute; left:0; right:0; top:50%; transform:translateY(-50%);
  height:6px; background:#e0e0e0; border-radius:999px;
}
.rs-fill {
  position:absolute; top:50%; transform:translateY(-50%);
  height:6px; background:${color}; border-radius:999px; left:0; right:100%;
}
.rs-range {
  position:absolute; left:0; right:0; top:0; bottom:0; width:100%; height:28px;
  -webkit-appearance:none; background:transparent; pointer-events:auto; margin:0;
}
.rs-range::-webkit-slider-thumb {
  -webkit-appearance:none; width:16px; height:16px; border-radius:50%;
  background:${color}; border:2px solid white; box-shadow:0 0 0 1px ${color};
  cursor:pointer; margin-top:-5px;
}
.rs-range::-moz-range-thumb {
  width:16px; height:16px; border-radius:50%;
  background:${color}; border:2px solid white; box-shadow:0 0 0 1px ${color};
  cursor:pointer;
}
.rs-range.rs-max { direction: rtl; } /* overlap trick for second thumb */
.rs-nums { display:flex; gap:10px; }
.rs-nums label { display:inline-flex; align-items:center; gap:6px; color:#333; font:500 12px/1 ${fontFamily}; }
.rs-num  {
  width:72px; padding:6px 8px; border:1px solid #c7c7c7; border-radius:6px;
  font:500 12px/1 ${fontFamily}; color:#111;
}
.rs-num:focus { outline:2px solid ${color}55; border-color:${color}; }
.rs-caption { font:600 12px/1.2 ${fontFamily}; color:${color}; }
`;
  root.append(style, title, modeWrap, vis);

  // Public API
  root.setForClass = setForClass;
  Object.defineProperty(root, "mode", { get: () => mode });

  return root;
}
