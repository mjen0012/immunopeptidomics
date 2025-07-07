/* ────────────────────────────────────────────────────────────────
   src/components/checkboxSelect.js
   ----------------------------------------------------------------
   A minimal vertical checkbox group styled to match the other
   custom controls (Roboto 14 px, 166 px column).
   • No outer label
   • Exposes root.value → Array of selected strings
-----------------------------------------------------------------*/

export function checkboxSelect(
  items = [],                        // array of strings (labels & values)
  {
    fontFamily = "'Roboto', sans-serif",
    width      = 166                 // keep column width consistent
  } = {}
) {
  if (!items.length) throw new Error("checkboxSelect: items array empty");

  /* container */
  const root = document.createElement("div");
  root.className = "cb-root";

  /* build checkboxes */
  items.forEach(txt => {
    const id = "__cb_" + Math.random().toString(36).slice(2);
    const wrap = document.createElement("label");
    wrap.className = "cb-line";

    const inp = Object.assign(document.createElement("input"), {
      type : "checkbox",
      id   : id,
      value: txt
    });

    const span = document.createElement("span");
    span.textContent = txt;

    wrap.append(inp, span);
    root.appendChild(wrap);
  });

  /* propagate value */
  const update = () => {
    root.value = Array.from(root.querySelectorAll("input:checked"))
                      .map(c => c.value);
    root.dispatchEvent(new CustomEvent("input"));
  };
  root.addEventListener("change", update);
  update();                   // initialise .value

  /* scoped style */
  const style = document.createElement("style");
  style.textContent = `
.cb-root { font-family:${fontFamily}; width:${width}px; }
.cb-line {
  display:flex; align-items:center; gap:6px;
  font-size:14px; color:#000; user-select:none; cursor:pointer;
}
.cb-line + .cb-line { margin-top:4px; }   /* vertical spacing */
.cb-line input {
  accent-color:#006DAE; width:14px; height:14px; cursor:pointer;
}
.cb-line span { line-height:1.2; }
`;
  root.appendChild(style);

  return root;
}
