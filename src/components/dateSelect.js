/* ────────────────────────────────────────────────────────────
   src/components/dateSelect.js  ·  v3  (fluid width)
   ------------------------------------------------------------
   • “From” and “To” <input type=date> are 100 % wide,
     min-width 120 px, radius 6 px.
   • Entire widget expands / shrinks with its grid cell.
──────────────────────────────────────────────────────────────*/
export function dateSelect({
  label        = "Date range",
  fontFamily   = "'Roboto', sans-serif",
  fillColor    = "#fff",
  textColor    = "#000",
  radius       = 6
} = {}) {

  /* elements */
  const root      = document.createElement("div");
  const wrap      = document.createElement("div");
  const inputFrom = document.createElement("input");
  const inputTo   = document.createElement("input");
  const dash      = document.createElement("span");
  const labelEl   = document.createElement("label");

  /* label */
  labelEl.className = "date-label";
  labelEl.textContent = label;
  root.appendChild(labelEl);

  /* inputs */
  [inputFrom, inputTo].forEach(inp => {
    inp.type = "date";
    inp.className = "date-input";
  });
  dash.className = "date-dash";
  dash.textContent = "–";

  /* assemble */
  wrap.className = "date-wrap";
  wrap.append(inputFrom, dash, inputTo);
  root.appendChild(wrap);

  /* reactive */
  const update = () => {
    root.value = {
      from: inputFrom.value || null,
      to  : inputTo.value   || null
    };
    root.dispatchEvent(new CustomEvent("input"));
  };
  inputFrom.addEventListener("change", update);
  inputTo  .addEventListener("change", update);
  update();

  /* styles */
  const style = document.createElement("style");
  style.textContent = `
.date-label { font-family:${fontFamily}; display:block; margin-bottom:4px; }
.date-wrap  { display:flex; flex-direction:column; align-items:flex-start; gap:4px; }
.date-input {
  width:100%; min-width:120px; height:36px;
  padding:0 .5em;
  font:inherit;
  border:1px solid #bbb;
  border-radius:${radius}px;
  box-sizing:border-box;
  background:${fillColor}; color:${textColor};
}
.date-dash  { font-family:${fontFamily}; }
`;
  root.appendChild(style);

  root.style.width    = "100%";
  root.style.boxSizing = "border-box";
  root.clear = () => { inputFrom.value = ""; inputTo.value = ""; update(); };

  return root;
}
