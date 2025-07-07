/* ────────────────────────────────────────────────────────────────
   src/components/dropSelect.js  •  v2
   ----------------------------------------------------------------
   Tweaks
   1. Rounded corners 6 px
   2. Fixed size 166 px × 36 px
   3. Label stacked above the box, left-aligned
-----------------------------------------------------------------*/

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

  if (labelEl) {
    labelEl.className = "drop-label";
    labelEl.textContent = label;
    labelEl.htmlFor = "__drop_" + Math.random().toString(36).slice(2);
    select.id = labelEl.htmlFor;
    root.appendChild(labelEl);   // label above
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

  /* scoped CSS */
  const style = document.createElement("style");
  style.textContent = `
.drop-root   { font-family:${fontFamily}; width:166px; }
.drop-select {
  width:240px; height:36px;
  padding:0 .5em;   
  font:inherit;
  border:1px solid #bbb;
  border-radius:6px;
  box-sizing:border-box;
  background:#fff;
}
.drop-label  { display:block; margin-bottom:4px; }
`;
  root.appendChild(style);

  return root;
}
