/* ────────────────────────────────────────────────────────────────
   dateSelect.js  ·  from–to date picker for Observable
   ----------------------------------------------------------------
   Usage:
     import {dateSelect} from "./components/dateSelect.js"

     viewof selectedDates = dateSelect({
       label: "Collection date",
       fontFamily: "'Roboto', sans-serif"
     })

   root.value ➜ { from: "YYYY-MM-DD" | null, to: "YYYY-MM-DD" | null }
-----------------------------------------------------------------*/

export function dateSelect({
  label        = "",
  fontFamily   = "inherit",
  pillColor    = "#e0e0e0",
  pillText     = "#333"
} = {}) {
  /* — elements — */
  const root   = document.createElement("div");
  const wrap   = document.createElement("div");   // flex row
  const inputFrom = document.createElement("input");
  const inputTo   = document.createElement("input");
  const labelEl   = label ? document.createElement("label") : null;

  root.className = "date-root";
  wrap.className = "date-wrap";
  inputFrom.className = inputTo.className = "date-input";

  if (labelEl) {
    labelEl.className = "date-label";
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
  }

  inputFrom.type = inputTo.type = "date";
  inputFrom.placeholder = "Start";
  inputTo.placeholder   = "End";

  wrap.appendChild(inputFrom);
  wrap.appendChild(document.createTextNode(" – "));
  wrap.appendChild(inputTo);
  root.appendChild(wrap);

  /* — update helper — */
  const update = () => {
    root.value = {
      from: inputFrom.value || null,
      to  : inputTo.value   || null
    };
    root.dispatchEvent(new CustomEvent("input"));
  };

  inputFrom.addEventListener("change", update);
  inputTo  .addEventListener("change", update);

  /* — scoped CSS — */
  const style = document.createElement("style");
  style.textContent = `
.date-root { font-family:${fontFamily}; }
.date-wrap { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.date-input {
  padding:.3em .4em; border:1px solid #bbb; border-radius:4px;
  font:inherit; background:#fff; color:#333;
}
.date-label { margin-right:4px; }
`;
  root.appendChild(style);

  /* initial state */
  update();

  return root;
}
