/* ────────────────────────────────────────────────────────────────
   src/components/uploadButton.js  •  v4 (adds tooltip)
   ----------------------------------------------------------------
   • Styled file-upload control
   • NEW: tooltipTitle / tooltipBody (hover/focus)
-----------------------------------------------------------------*/

export function uploadButton({
  label       = "Upload",
  accept      = "",
  multiple    = false,
  required    = false,
  fontFamily  = "'Roboto', sans-serif",
  fillColor   = "#006DAE",
  textColor   = "#fff",
  radius      = 6,
  tooltipTitle = "Upload",
  tooltipBody  = ""
} = {}) {
  /* hidden <input type=file> */
  const fileInput = Object.assign(document.createElement("input"), {
    type     : "file",
    accept,
    multiple,
    required,
    style    : "display:none"
  });

  const root  = document.createElement("div");
  const scope = "ub_" + Math.random().toString(36).slice(2);
  root.className = "ub-root";
  root.dataset.scope = scope;

  // small wrapper that positions the tooltip relative to the button (not the whole control)
  const btnWrap = document.createElement("span");
  btnWrap.className = "ub-btn-wrap";
  btnWrap.style.position = "relative";
  btnWrap.style.display  = "inline-block";

  /* visible button */
  const btn = document.createElement("button");
  btn.type  = "button";
  btn.className = "ub-btn";
  btn.setAttribute("aria-label", label || tooltipTitle || "Upload");
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

  /* tooltip (matches downloadButton behavior) */
  const tipId = "ub_tip_" + Math.random().toString(36).slice(2);
  const tip = document.createElement("div");
  tip.id = tipId;
  tip.className = "ub-tip";
  tip.setAttribute("role", "tooltip");
  tip.innerHTML = `
    <div class="ub-tip-title">${tooltipTitle || "Upload"}</div>
    ${tooltipBody ? `<div class="ub-tip-body">${tooltipBody}</div>` : ""}
  `;
  Object.assign(tip.style, {
    position: "absolute",
    top: "50%",
    left: "100%",
    transform: "translate(10px,-50%)",
    minWidth: "220px",
    maxWidth: "320px",
    background: "#111",
    color: "#fff",
    borderRadius: "8px",
    padding: "10px 12px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
    zIndex: "9999",
    transition: "opacity .12s ease"
  });
  btn.setAttribute("aria-describedby", tipId);

  /* file-name display */
  const nameSpan = document.createElement("span");
  nameSpan.className = "ub-filename";
  nameSpan.textContent = "";   // empty until a file is chosen

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
  max-width:240px;
}

/* tooltip base (hidden) */
.ub-root[data-scope="${scope}"] .ub-btn-wrap .ub-tip {
  opacity: 0;
  pointer-events: none;
}

/* show on hover or keyboard focus */
.ub-root[data-scope="${scope}"] .ub-btn-wrap .ub-btn:hover + .ub-tip,
.ub-root[data-scope="${scope}"] .ub-btn-wrap .ub-btn:focus-visible + .ub-tip,
.ub-root[data-scope="${scope}"] .ub-btn-wrap .ub-btn:focus + .ub-tip {
  opacity: 1;
}

/* tooltip typography */
.ub-root[data-scope="${scope}"] .ub-tip-title{ font:600 13px/1.2 ${fontFamily}; margin:0 0 4px 0; }
.ub-root[data-scope="${scope}"] .ub-tip-body { font:400 12px/1.4 ${fontFamily}; opacity:.95; }
`;
  root.appendChild(style);
  // Order matters: tip must be the next sibling of the button inside btnWrap.
  btnWrap.append(btn, tip);
  root.append(fileInput, btnWrap, nameSpan);
  return root;
}
