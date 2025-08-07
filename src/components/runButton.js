/* ───────────────────────────────────────────────────────────────
   src/components/runButton.js  ·  v1
   Aesthetic parity with filterButton.js, plus a busy/spinner state.
   Behaves like Inputs.button:
     • Click => increments .value and dispatches "input" (bubbling)
     • Exposes .value getter/setter
     • .setBusy(boolean, labelWhileBusy?) to toggle spinner/disable
────────────────────────────────────────────────────────────────*/
export function runButton(
  label = "Run",
  {
    color      = "#006DAE",                // fill
    textColor  = "#fff",                   // label / icon
    fontFamily = "'Roboto', sans-serif",
    icon       = "▶"                       // optional leading icon (string or null)
  } = {}
) {
  let value = 0;
  let busy  = false;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ff-btn run-btn";
  btn.style.background = color;
  btn.style.color = textColor;

  // Inner structure: [icon] [label] [spinner]
  const ico = document.createElement("span");
  ico.className = "run-ico";
  ico.textContent = icon || "";

  const lab = document.createElement("span");
  lab.className = "run-lab";
  lab.textContent = label;

  const spin = document.createElement("span");
  spin.className = "run-spin";
  // Spinner is purely decorative; hidden unless busy
  spin.setAttribute("aria-hidden", "true");

  btn.append(ico, lab, spin);

  // Expose .value like Inputs.button
  Object.defineProperty(btn, "value", {
    get: () => value,
    set: (v) => (value = Number(v) || 0)
  });

  // Click => increment value + emit "input" (bubbling)
  btn.addEventListener("click", () => {
    if (busy) return;
    value += 1;
    btn.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // Busy API: disable + show spinner + optional temporary label
  btn.setBusy = (isBusy = true, busyLabel) => {
    busy = !!isBusy;
    btn.disabled = busy;
    btn.classList.toggle("is-busy", busy);
    if (busy && busyLabel) {
      lab.dataset._orig = lab.textContent;
      lab.textContent = busyLabel;
    } else if (!busy && lab.dataset._orig) {
      lab.textContent = lab.dataset._orig;
      delete lab.dataset._orig;
    }
  };

  // Visuals (shares geometry with filterButton)
  const style = document.createElement("style");
  style.textContent = `
.ff-btn {
  font-family:${fontFamily}; font-weight:700; font-size:14px;
  padding:8px 16px; border:none; border-radius:6px; cursor:pointer;
  transition:filter .1s;
  display:inline-flex; align-items:center; gap:10px;
}
.ff-btn:hover  { filter:brightness(1.1); }
.ff-btn:active { filter:brightness(0.95); }
.ff-btn:disabled { opacity:.6; cursor:not-allowed; }

.run-ico { font-size:14px; line-height:1; }
.run-lab { line-height:1; }

/* Spinner */
.run-spin {
  width: 16px; height: 16px;
  border-radius: 999px;
  border: 2px solid rgba(255,255,255,0.6);
  border-top-color: rgba(255,255,255,1);
  display:none;
}
@keyframes runspin { to { transform: rotate(360deg); } }
.is-busy .run-spin { display:inline-block; animation: runspin .8s linear infinite; }
.is-busy .run-ico  { opacity:0; width:0; }
`;
  btn.appendChild(style);

  return btn;
}
