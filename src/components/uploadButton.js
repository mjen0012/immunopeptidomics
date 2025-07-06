/* ────────────────────────────────────────────────────────────────
   src/components/uploadButton.js  •  v2
   ----------------------------------------------------------------
   • Roboto Bold 14 px, #006DAE background, white text + icon
   • Padding 8 px × 16 px, 10 px gap, 6 px corner radius
-----------------------------------------------------------------*/

export function uploadButton({
  label       = "Upload",
  accept      = "",
  multiple    = false,
  required    = false,
  fontFamily  = "'Roboto', sans-serif",
  fillColor   = "#006DAE",
  textColor   = "#fff",
  radius      = 6               // corner radius in px
} = {}) {
  /* hidden <input type="file"> */
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

  /* root element returned to Observable */
  const root = document.createElement("div");
  root.append(fileInput, btn);

  /* value propagation */
  const updateValue = () => {
    root.value = multiple ? Array.from(fileInput.files)
                          : fileInput.files[0] ?? null;
    root.dispatchEvent(new CustomEvent("input"));
  };
  btn.onclick        = () => fileInput.click();
  fileInput.onchange = updateValue;

  /* scoped styles */
  const style = document.createElement("style");
  style.textContent = `
.ub-btn {
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
`;
  root.appendChild(style);

  return root;
}
