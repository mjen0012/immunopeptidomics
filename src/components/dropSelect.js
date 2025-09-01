/* ────────────────────────────────────────────────────────────
   src/components/dropSelect.js  ·  v3  (fluid width)
   ------------------------------------------------------------
   • <select> expands to 100 % of its parent (min-width 120 px).
   • No API changes.
──────────────────────────────────────────────────────────────*/
export function dropSelect(
  items = [],
  {
    label      = "",
    fontFamily = "'Roboto', sans-serif",
  } = {}
) {
  if (!items.length) throw new Error("dropSelect: items array is empty");

  /* elements */
  const root    = document.createElement("div");
  const select  = document.createElement("select");
  const labelEl = label ? document.createElement("label") : null;

  root.className   = "drop-root";
  select.className = "drop-select";

  /* label */
  if (labelEl) {
    labelEl.className   = "drop-label";
    labelEl.textContent = label;
    labelEl.htmlFor     = "__drop_" + Math.random().toString(36).slice(2);
    select.id           = labelEl.htmlFor;
    root.appendChild(labelEl);
  }

  /* populate */
  for (const {id, label: txt} of items) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = txt;
    select.appendChild(opt);
  }
  root.appendChild(select);

  /* initial value */
  select.value = items[0].id;
  root.value   = select.value;
  select.addEventListener("change", () => {
    root.value = select.value;
    root.dispatchEvent(new CustomEvent("input"));
  });

  /* styles */
  const style = document.createElement("style");
  style.textContent = `
.drop-root   { font-family:${fontFamily}; width:100%; min-width:120px; box-sizing:border-box; }
.drop-select {
  width:100%; height:36px;
  padding:0 .5em;
  font:inherit;
  border:1px solid #bbb;
  border-radius:6px;
  box-sizing:border-box;
  background:#fff;
}
.drop-label  { display:block; margin-bottom:4px; font:500 13px/1.3 ${fontFamily}; color:#111; }
`;
  root.appendChild(style);

  /* helper */
  root.clear = () => {
    select.value = items[0].id;
    root.value   = select.value;
    select.dispatchEvent(new Event("change", {bubbles:true}));
  };

  return root;
}
