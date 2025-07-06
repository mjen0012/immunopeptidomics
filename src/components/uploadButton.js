/* ────────────────────────────────────────────────────────────────
   src/components/uploadButton.js  •  v3
   ----------------------------------------------------------------
   • Styled file-upload control
   • Roboto Bold 14 for button (white on #006DAE, radius 6)
   • SVG stroke-width 3 for a “bold” icon
   • Selected file-name shown to the right (Roboto 14, black)
-----------------------------------------------------------------*/

export function uploadButton({
  label       = "Upload",
  accept      = "",
  multiple    = false,
  required    = false,
  fontFamily  = "'Roboto', sans-serif",
  fillColor   = "#006DAE",
  textColor   = "#fff",
  radius      = 6
} = {}) {
  /* hidden <input type=file> */
  const fileInput = Object.assign(document.createElement("input"), {
    type     : "file",
    accept,
    multiple,
    required,
    style    : "display:none"
  });

  /* visible button */
  const btn = document.createElement("button");
  btn.type  = "button";
  btn.className = "ub-btn";
  btn.innerHTML = `
    <span class="ub-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="3" stroke-linecap="round"
           stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    </span>
    <span class="ub-label">${label}</span>
  `;

  /* file-name display */
  const nameSpan = document.createElement("span");
  nameSpan.className = "ub-filename";
  nameSpan.textContent = "";   // empty until a file is chosen

  /* wrapper returned to Observable */
  const root = document.createElement("div");
  root.className = "ub-root";
  root.append(fileInput, btn, nameSpan);

  /* propagate value + update file-name */
  const updateValue = () => {
    const files = multiple ? Array.from(fileInput.files)
                           : fileInput.files[0] ? [fileInput.files[0]] : [];
    root.value = multiple ? files : files[0] ?? null;

    nameSpan.textContent = files.length
      ? (multiple ? `${files[0].name} …(+${files.length - 1})` : files[0].name)
      : "";
    root.dispatchEvent(new CustomEvent("input"));
  };

  btn.onclick        = () => fileInput.click();
  fileInput.onchange = updateValue;

  /* scoped styles */
  const style = document.createElement("style");
  style.textContent = `
.ub-root   { display:inline-flex; align-items:center; gap:12px; }
.ub-btn    {
  display:inline-flex; align-items:center; gap:10px;
  padding:8px 16px;
  font:bold 14px/1.2 ${fontFamily};
  background:${fillColor}; color:${textColor};
  border:none; border-radius:${radius}px;
  cursor:pointer;
}
.ub-btn:hover  { filter:brightness(1.1); }
.ub-btn:active { filter:brightness(0.95); }
.ub-icon       { display:inline-flex; }
.ub-filename   {
  font:14px/1.2 ${fontFamily};
  color:#000;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width:240px;           /* adjust if needed */
}
`;
  root.appendChild(style);

  return root;
}
