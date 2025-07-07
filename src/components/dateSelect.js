/* ────────────────────────────────────────────────────────────────
   src/components/dateSelect.js  •  v2
   ----------------------------------------------------------------
   • Each <input type=date> is 166×36, radius 6
   • Vertical layout:
        Collection date
        [from box]
        –          (en-dash)
        [to   box]
-----------------------------------------------------------------*/

export function dateSelect({
  label        = "Date range",
  fontFamily   = "'Roboto', sans-serif",
  fillColor    = "#fff",
  textColor    = "#000",
  radius       = 6
} = {}) {
  /* elements */
  const root  = document.createElement("div");
  const wrap  = document.createElement("div");     // vertical stack
  const inputFrom = document.createElement("input");
  const inputTo   = document.createElement("input");
  const dash      = document.createElement("span");
  const labelEl   = document.createElement("label");

  /* label */
  labelEl.className   = "date-label";
  labelEl.textContent = label;
  root.appendChild(labelEl);

  /* inputs */
  [inputFrom, inputTo].forEach(inp => {
    inp.type  = "date";
    inp.className = "date-input";
  });
  dash.className = "date-dash";
  dash.textContent = "–";

  /* assemble */
  wrap.className = "date-wrap";
  wrap.append(inputFrom, dash, inputTo);
  root.appendChild(wrap);

  /* reactive value */
  const update = () => {
    root.value = {
      from: inputFrom.value || null,
      to  : inputTo.value   || null
    };
    root.dispatchEvent(new CustomEvent("input"));
  };
  inputFrom.addEventListener("change", update);
  inputTo  .addEventListener("change", update);
  update();                       // initial

  /* scoped CSS */
  const style = document.createElement("style");
  style.textContent = `
.date-label { font-family:${fontFamily}; display:block; margin-bottom:4px; }
.date-wrap  { display:flex; flex-direction:column; align-items:flex-start; gap:4px; }
.date-input {
  width:240px; height:36px;
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

  return root;
}
