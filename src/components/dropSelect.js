/* ────────────────────────────────────────────────────────────────
   dropSelect.js  ·  single-choice dropdown (id/label pairs)
   ----------------------------------------------------------------
   Usage:
     import {dropSelect} from "./components/dropSelect.js"

     viewof tableName = dropSelect(datasets, {
       label: "Choose protein:",
       fontFamily: "'Roboto', sans-serif"
     })

   Parameters
     items   :  [{id, label}, …]      (id = value used in queries)
     options :  label, fontFamily, etc.
-----------------------------------------------------------------*/

export function dropSelect(
  items = [],
  {
    label      = "",
    fontFamily = "inherit",
    pillColor  = "#e0e0e0",
    pillText   = "#333"
  } = {}
) {
  if (!items.length) {
    throw new Error("dropSelect: items array is empty");
  }

  /* — elements — */
  const root  = document.createElement("div");
  const select = document.createElement("select");
  const labelEl = label ? document.createElement("label") : null;

  root.className   = "drop-root";
  select.className = "drop-select";

  if (labelEl) {
    labelEl.className = "drop-label";
    labelEl.textContent = label;
    labelEl.htmlFor = "__drop_" + Math.random().toString(36).slice(2);
    select.id = labelEl.htmlFor;
    root.appendChild(labelEl);
  }

  /* populate options */
  for (const {id, label: txt} of items) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = txt;
    select.appendChild(opt);
  }
  root.appendChild(select);

  /* initial selection = first item */
  select.value = items[0].id;
  root.value   = select.value;

  /* — event — */
  select.addEventListener("change", () => {
    root.value = select.value;           // expose the id
    root.dispatchEvent(new CustomEvent("input"));
  });

  /* — scoped style — */
  const style = document.createElement("style");
  style.textContent = `
.drop-root   { font-family:${fontFamily}; }
.drop-select {
  padding:.4em .6em; font:inherit; border:1px solid #bbb;
  border-radius:4px; background:#fff;
}
.drop-label  { margin-right:6px; }
`;
  root.appendChild(style);

  return root;
}
