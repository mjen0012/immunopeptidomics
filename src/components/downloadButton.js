/* ────────────────────────────────────────────────────────────────
   src/components/downloadButton.js
   ----------------------------------------------------------------
   A “Download CSV” button styled like your other controls.
   • Pass an array of objects (rows) OR a function that returns the data.
   • Optional filename (default “data.csv”).
-----------------------------------------------------------------*/
export function downloadButton({
  label      = "Download",
  data       = [],                   // Array | () => Array
  filename   = "data.csv",
  color      = "#006DAE",
  textColor  = "#fff",
  radius     = 6,
  fontFamily = "'Roboto', sans-serif"
} = {}) {
  /* array → CSV text */
  const toCSV = (rows) => {
    if (!rows?.length) return "";
    const cols = Object.keys(rows[0]);
    const escape = (s) =>
      `"${String(s).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    return [
      cols.map(escape).join(","),                                // header
      ...rows.map((r) => cols.map((c) => escape(r[c] ?? "")).join(",")) // rows
    ].join("\r\n");
  };

  const btn = document.createElement("button");
  btn.className = "dl-btn";
  btn.type = "button";
  btn.textContent = label;

  /* inline per-instance colours */
  btn.style.background = color;
  btn.style.color      = textColor;

  btn.onclick = () => {
    const rows      = typeof data === "function" ? data() : data;
    const csv       = toCSV(rows);
    const blob      = new Blob([csv], {type: "text/csv"});
    const href      = URL.createObjectURL(blob);
    const a         = Object.assign(document.createElement("a"), {
      href,
      download: filename
    });
    document.body.appendChild(a);
    a.click();              // trigger download
    a.remove();
    URL.revokeObjectURL(href);
  };

  /* shared style */
  const style = document.createElement("style");
  style.textContent = `
.dl-btn{
  font:bold 14px/1.2 ${fontFamily};
  padding:8px 16px; border:none; border-radius:${radius}px;
  cursor:pointer; transition:filter .1s;
}
.dl-btn:hover  { filter:brightness(1.1); }
.dl-btn:active { filter:brightness(0.95); }
`;
  btn.appendChild(style);

  return btn;
}