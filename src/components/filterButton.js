/* ────────────────────────────────────────────────────────────────
   src/components/filterButton.js  •  v3
-----------------------------------------------------------------*/
export function filterButton(
  label = "Button",
  {
    color      = "#006DAE",           // fill
    textColor  = "#fff",              // label / icon
    fontFamily = "'Roboto', sans-serif"
  } = {}
) {
  let value = 0;

  const btn = document.createElement("button");
  btn.className   = "ff-btn";
  btn.textContent = label;
  btn.type        = "button";

  /* per-instance colours (inline so they don’t clash) */
  btn.style.background = color;
  btn.style.color      = textColor;

  /* expose .value like Inputs.button */
  Object.defineProperty(btn, "value", {
    get: () => value,
    set: (v) => (value = v)
  });

  btn.addEventListener("click", () => {
    value += 1;
    btn.dispatchEvent(new Event("input", {bubbles: true}));
  });

  /* shared geometry / hover behaviour */
  const style = document.createElement("style");
  style.textContent = `
.ff-btn {
  font-family:${fontFamily}; font-weight:700; font-size:14px;
  padding:8px 16px; border:none; border-radius:6px; cursor:pointer;
  transition:filter .1s;
}
.ff-btn:hover  { filter:brightness(1.1); }
.ff-btn:active { filter:brightness(0.95); }
.ff-btn:disabled { opacity:.6; cursor:not-allowed; }
`;
  btn.appendChild(style);

  return btn;
}
