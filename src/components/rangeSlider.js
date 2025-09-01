// components/rangeSlider.js
/*****************************************************************
 *  rangeSlider() → HTMLElement
 *  - Roboto font, accent #006DAE
 *  - Dynamic range by class:
 *      Class I  → 8–14 (default 9)
 *      Class II → 11–30 (default 15)
 *  - Single vs Range selection:
 *      * Starts single at default (one handle visible).
 *      * Clicking another tick/position adds the 2nd handle.
 *      * Clicking an existing endpoint again collapses to single
 *        at that endpoint.
 *      * Drag either handle; values snap to integer ticks.
 *  - Emits "input" events when the selection changes.
 *  - Public API on returned element:
 *      * elem.value           // [min,max] (getter/setter)
 *      * elem.setForClass("I"|"II")
 *      * elem.setRange(min,max[,defaultVal])
 *****************************************************************/

export function rangeSlider({
  label      = "Peptide length",
  fontFamily = "'Roboto', sans-serif",
  accent     = "#006DAE"
} = {}) {
  /* ---------- DOM ---------- */
  const root = document.createElement("div");
  root.className = "rs-root";
  root.style.fontFamily = fontFamily;

  const style = document.createElement("style");
  style.textContent = `
.rs-root{ width:100%; }
/* Align with other inputs (select/text: 4px label gap, 36px control) */
.rs-label{ display:block; margin:0 0 4px 0; font:500 13px/1.3 ${fontFamily}; color:#111; }
/* Trim top padding to visually match 36px field height rhythm */
.rs-wrap{ position:relative; padding:12px 0 12px 0; }
.rs-track{
  position:relative; height:6px; background:#e5e5e5; border-radius:4px;
}
.rs-fill{
  position:absolute; height:100%; left:0; right:100%;
  background:${accent}; border-radius:4px;
}
.rs-handle{
  position:absolute; top:50%; transform:translate(-50%, -50%);
  width:16px; height:16px; border-radius:50%;
  background:${accent}; box-shadow:0 0 0 2px #fff, 0 0 0 4px rgba(0,0,0,.08);
  cursor:pointer; touch-action:none;
}
.rs-cap{
  margin-top:8px; font:500 13px/1 ${fontFamily}; color:#111;
}
.rs-ticks{ position:relative; height:16px; margin-top:8px; }
.rs-tick{
  position:absolute; top:0; width:1px; height:8px; background:#bdbdbd;
}
.rs-tick-label{
  position:absolute; top:10px; transform:translateX(-50%);
  font:12px/1 ${fontFamily}; color:#424242; user-select:none;
}
.rs-tick-hit{
  position:absolute; top:-12px; width:20px; height:30px; transform:translateX(-50%);
  cursor:pointer; background:transparent;
}
  `;
  root.appendChild(style);

  const labelEl = document.createElement("label");
  labelEl.className = "rs-label";
  labelEl.textContent = label;
  root.appendChild(labelEl);

  const wrap  = document.createElement("div");
  wrap.className = "rs-wrap";
  const track = document.createElement("div");
  track.className = "rs-track";
  const fill  = document.createElement("div");
  fill.className  = "rs-fill";
  track.appendChild(fill);

  const h1 = document.createElement("div"); // left/primary (min)
  h1.className = "rs-handle";
  const h2 = document.createElement("div"); // right/secondary (max)
  h2.className = "rs-handle";

  // ARIA
  h1.setAttribute("role", "slider");
  h1.setAttribute("aria-label", "Peptide length minimum");
  h2.setAttribute("role", "slider");
  h2.setAttribute("aria-label", "Peptide length maximum");

  track.append(h1, h2);

  const ticksG = document.createElement("div");
  ticksG.className = "rs-ticks";

  const cap  = document.createElement("div");
  cap.className = "rs-cap";

  wrap.append(track, ticksG, cap);
  root.appendChild(wrap);

  /* ---------- State & helpers ---------- */
  let rangeMin = 8;
  let rangeMax = 14;
  let vMin     = 9;     // selected min (or single)
  let vMax     = 9;     // selected max (or =vMin when single)

  const clamp = v => Math.max(rangeMin, Math.min(rangeMax, Math.round(v)));
  const pct   = v => ( (v - rangeMin) / (rangeMax - rangeMin) ) * 100;

  function setRange(min, max, defVal = null, { silent=false } = {}) {
    rangeMin = Math.floor(min);
    rangeMax = Math.floor(max);
    // pick a sensible default inside range
    let d = defVal == null ? Math.round((min + max) / 2) : defVal;
    d = clamp(d);

    rebuildTicks();
    setValue(d, d, { silent });
  }

  function hasTwo() { return vMin !== vMax; }

  function setValue(min, max, { silent=false } = {}) {
    vMin = clamp(Math.min(min, max));
    vMax = clamp(Math.max(min, max));

    const left  = pct(vMin);
    const right = pct(vMax);

    // handles
    h1.style.left = `${left}%`;
    h2.style.left = `${right}%`;

    // only show second handle if range
    const rangeNow = vMin !== vMax;
    h2.style.opacity = rangeNow ? "1" : "0";
    h2.style.pointerEvents = rangeNow ? "auto" : "none";

    // fill
    fill.style.left  = `${Math.min(left, right)}%`;
    fill.style.right = `${100 - Math.max(left, right)}%`;

    // caption
    cap.textContent = (vMin === vMax) ? `${vMin}` : `${vMin}–${vMax}`;

    // ARIA
    for (const h of [h1,h2]) {
      h.setAttribute("aria-valuemin", rangeMin);
      h.setAttribute("aria-valuemax", rangeMax);
    }
    h1.setAttribute("aria-valuenow", vMin);
    h2.setAttribute("aria-valuenow", vMax);

    if (!silent) root.dispatchEvent(new CustomEvent("input"));
  }

  function valueFromClientX(clientX) {
    const r = track.getBoundingClientRect();
    const t = (clientX - r.left) / Math.max(1, r.width);
    const val = rangeMin + t * (rangeMax - rangeMin);
    return clamp(val);
  }

  /* ---------- Ticks ---------- */
  function rebuildTicks() {
    ticksG.innerHTML = "";
    const n = rangeMax - rangeMin + 1;
    for (let i = 0; i < n; i++) {
      const val  = rangeMin + i;
      const x    = pct(val);

      const tick = document.createElement("div");
      tick.className = "rs-tick";
      tick.style.left = `${x}%`;

      const label = document.createElement("div");
      label.className = "rs-tick-label";
      label.textContent = `${val}`;
      label.style.left = `${x}%`;

      const hit = document.createElement("div");
      hit.className = "rs-tick-hit";
      hit.style.left = `${x}%`;
      hit.title = `Select ${val}`;
      hit.addEventListener("click", () => onTickClick(val));

      ticksG.append(tick, label, hit);
    }
  }

  function onTickClick(val) {
    val = clamp(val);
    if (!hasTwo()) {
      // single → clicking a different tick creates a range (min..clicked)
      if (val === vMin) return;             // clicking same does nothing
      setValue(Math.min(vMin, val), Math.max(vMin, val));
      return;
    }
    // range is active
    if (val === vMin || val === vMax) {
      // clicking an endpoint collapses to single at that value
      setValue(val, val);
      return;
    }
    // otherwise, move the *nearest* endpoint to the clicked value
    const distMin = Math.abs(val - vMin);
    const distMax = Math.abs(val - vMax);
    if (distMin <= distMax) setValue(val, vMax);
    else                    setValue(vMin, val);
  }

  /* ---------- Dragging ---------- */
  function makeDraggable(handle, which) {
    let active = false;

    const onPointerDown = (e) => {
      e.preventDefault();
      handle.setPointerCapture?.(e.pointerId);
      active = true;
    };
    const onPointerMove = (e) => {
      if (!active) return;
      const val = valueFromClientX(e.clientX);
      if (which === "min") {
        // when in range mode, prevent crossing unless we switch roles
        if (hasTwo() && val > vMax) {
          // swap roles to preserve ordering
          setValue(vMax, val);
        } else {
          setValue(val, hasTwo() ? vMax : val);
        }
      } else {
        if (hasTwo() && val < vMin) {
          setValue(val, vMin);
        } else {
          setValue(hasTwo() ? vMin : val, val);
        }
      }
    };
    const onPointerUp = () => { active = false; };

    handle.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // keyboard support
    handle.tabIndex = 0;
    handle.addEventListener("keydown", (e) => {
      let step = 1;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") step = -1;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") step = +1;
      else if (e.key === "Home") { step = -Infinity; }
      else if (e.key === "End")  { step = +Infinity; }
      else return;

      e.preventDefault();
      if (which === "min") {
        let next = (step === -Infinity) ? rangeMin
               : (step === +Infinity) ? (hasTwo() ? vMax : rangeMax)
               : clamp(vMin + step);
        if (hasTwo() && next > vMax) next = vMax;
        setValue(next, hasTwo() ? vMax : next);
      } else {
        let next = (step === -Infinity) ? (hasTwo() ? vMin : rangeMin)
               : (step === +Infinity) ? rangeMax
               : clamp(vMax + step);
        if (hasTwo() && next < vMin) next = vMin;
        setValue(hasTwo() ? vMin : next, next);
      }
    });
  }

  makeDraggable(h1, "min");
  makeDraggable(h2, "max");

  // clicking on the track behaves like clicking a tick at nearest value
  track.addEventListener("click", (e) => {
    // ignore clicks that start on a handle (so drags don't also click)
    if (e.target === h1 || e.target === h2) return;
    const val = valueFromClientX(e.clientX);
    onTickClick(val);
  });

  /* ---------- Public API ---------- */
  function setForClass(cls) {
    const klass = String(cls || "").toUpperCase();
    if (klass === "II") {
      // 11–30, default 15
      setRange(11, 30, 15);
    } else {
      // default to Class I: 8–14, default 9
      setRange(8, 14, 9);
    }
  }

  function getValue() { return [vMin, vMax]; }

  Object.defineProperty(root, "value", {
    get: getValue,
    set: (arr) => {
      if (arr == null) return;
      const a = Array.isArray(arr) ? arr : [arr, arr];
      const a0 = a[0];
      const a1 = a.length > 1 ? a[1] : a[0];
      setValue(a0, a1);
    }
  });

  root.setForClass = setForClass;
  root.setRange    = (min, max, defVal) => setRange(min, max, defVal);
  root.setValue    = (min, max) => setValue(min, max);

  /* ---------- Init ---------- */
  setForClass("I"); // default to Class I until caller sets otherwise
  return root;
}
