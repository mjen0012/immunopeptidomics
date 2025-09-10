export function downloadButton({
  label        = "",
  tooltipTitle = "Download",
  tooltipBody  = "",
  data         = [],
  filename     = "data.csv",
  color        = "#006DAE",
  textColor    = "#fff",
  radius       = 8,
  fontFamily   = "'Roboto', sans-serif",
  /* NEW */
  format       = "csv",            // "csv" | "fasta" | (rows)=>({content,mime})
  fasta        = {}                // { header: fn|key, sequence: fn|key, lineWidth: 60 }
} = {}) {
  const toCSV = (rows) => {
    const arr = typeof rows === "function" ? rows() : rows;
    if (!arr?.length) return "";
    const cols = Object.keys(arr[0]);
    const esc  = (s) => `"${String(s ?? "").replace(/"/g,'""').replace(/\r?\n/g," ")}"`;
    return [
      cols.map(esc).join(","),
      ...arr.map(r => cols.map(c => esc(r[c])).join(","))
    ].join("\r\n");
  };

  /* NEW: FASTA serializer */
  const toFASTA = (rows, opts = {}) => {
    const arr = typeof rows === "function" ? rows() : rows;
    if (!arr?.length && typeof arr !== "string") return "";
    if (typeof arr === "string") return arr; // already a FASTA string

    const { header, sequence, lineWidth = 60 } = opts;
    const pick = (k, fallbacks=[]) => (r) =>
      (typeof k === "function" ? k(r)
       : k ? r?.[k]
       : undefined) ??
      fallbacks.reduce((v, key) => v ?? r?.[key], undefined);

    const getHeader = pick(header, ["header","protein","id","name"]);
    const getSeq    = pick(sequence, ["aligned","aligned_sequence","sequence","seq","peptide_aligned"]);

    const wrap = (s="") => String(s).replace(/\s+/g,"")
      .match(new RegExp(`.{1,${lineWidth}}`,"g"))?.join("\n") ?? "";

    return arr.map((r,i) => {
      const h = String(getHeader(r) ?? `seq_${i+1}`).replace(/^>/,"");
      const s = wrap(getSeq(r) ?? "");
      return `> ${h}\n${s}`;
    }).join("\n");
  };

  // scoped wrapper + unique scope token
  const wrap = document.createElement("div");
  const scope = "dl_" + Math.random().toString(36).slice(2);
  wrap.className = "dl-wrap";
  wrap.dataset.scope = scope;
  wrap.style.display = "inline-block";
  wrap.style.position = "relative";
  wrap.style.fontFamily = fontFamily;

  // button
  const btn = document.createElement("button");
  btn.className = "dl-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", label || tooltipTitle || "Download");
  Object.assign(btn.style, {
    background: color,
    color: textColor,
    border: "none",
    cursor: "pointer",
    borderRadius: `${radius}px`,
    padding: label ? "8px 12px" : "8px",
    display: "inline-flex",
    alignItems: "center",
    gap: label ? "8px" : "0px",
    font: `bold 14px/1.2 ${fontFamily}`
  });

  // icon
  const icon = document.createElementNS("http://www.w3.org/2000/svg","svg");
  icon.setAttribute("viewBox","0 0 24 24");
  icon.setAttribute("width","18");
  icon.setAttribute("height","18");
  icon.setAttribute("aria-hidden","true");
  icon.style.flex = "0 0 auto";
  icon.innerHTML = `
    <path fill="currentColor"
      d="M5 20h14a1 1 0 0 0 1-1v-3h-2v2H6v-2H4v3a1 1 0 0 0 1 1zm7-3l5-6h-3V4h-4v7H7l5 6z"/>
  `;
  btn.appendChild(icon);

  if (label) {
    const txt = document.createElement("span");
    txt.textContent = label;
    txt.style.whiteSpace = "nowrap";
    btn.appendChild(txt);
  }

  // tooltip
  const tipId = "dl_tip_" + Math.random().toString(36).slice(2);
  const tip = document.createElement("div");
  tip.id = tipId;
  tip.className = "dl-tip";
  tip.setAttribute("role", "tooltip");
  tip.innerHTML = `
    <div class="dl-tip-title">${tooltipTitle || "Download"}</div>
    ${tooltipBody ? `<div class="dl-tip-body">${tooltipBody}</div>` : ""}
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
    // NOTE: no inline opacity/pointer-events here anymore
    // visibility is controlled purely by CSS below
    transition: "opacity .12s ease"
  });
  btn.setAttribute("aria-describedby", tipId);

  // Scoped CSS so multiple buttons don’t clash
  const style = document.createElement("style");
  style.textContent = `
/* base button effects */
.dl-wrap[data-scope="${scope}"] .dl-btn:hover  { filter:brightness(1.08); }
.dl-wrap[data-scope="${scope}"] .dl-btn:active { filter:brightness(0.96); }

/* tooltip base (hidden) */
.dl-wrap[data-scope="${scope}"] .dl-tip {
  opacity: 0;
  pointer-events: none;
}

/* show on hover or keyboard focus */
.dl-wrap[data-scope="${scope}"] .dl-btn:hover + .dl-tip,
.dl-wrap[data-scope="${scope}"] .dl-btn:focus-visible + .dl-tip,
.dl-wrap[data-scope="${scope}"] .dl-btn:focus + .dl-tip {
  opacity: 1;
}

/* tooltip typography */
.dl-wrap[data-scope="${scope}"] .dl-tip-title{ font:600 13px/1.2 ${fontFamily}; margin:0 0 4px 0; }
.dl-wrap[data-scope="${scope}"] .dl-tip-body { font:400 12px/1.4 ${fontFamily}; opacity:.95; }
  `;

  // download handler (supports CSV or FASTA)
  btn.onclick = () => {
    const rows = typeof data === "function" ? data() : data;

    let content = "";
    let mime    = "text/csv";

    if (typeof format === "function") {
      const out = format(rows) || {};
      content = out.content ?? "";
      mime    = out.mime ?? "text/plain";
    } else if (format === "fasta") {
      content = toFASTA(rows, fasta);
      mime    = "text/x-fasta";
    } else {
      content = toCSV(rows);
      mime    = "text/csv";
    }

    if (!content || content.length === 0) {
      btn.animate([{transform:"scale(1)"},{transform:"scale(0.98)"},{transform:"scale(1)"}],
                  {duration:120, easing:"ease-out"});
      return;
    }
    const blob = new Blob([content], { type: mime });
    const href = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  wrap.appendChild(style);
  wrap.appendChild(btn);
  wrap.appendChild(tip);
  return wrap;
}
