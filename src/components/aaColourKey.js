/* ───────────────────────────────────────────────────────────────
   components/aaColourKey.js · v3 (self-contained)
   7-group amino-acid colour key
   • Groups flow in one continuous row; wrap as needed on narrow panels
   • Group label above; swatches below
   • No tooltips / interactivity
   • Font: 'Roboto', sans-serif
────────────────────────────────────────────────────────────────*/

/* Fixed AA → colour palette (hex) */
const AMINOACID_PALETTE = Object.freeze({
  P:"#89d1c0", G:"#7bcbb8", A:"#6cc5b0", L:"#61b19e", V:"#569e8d",
  I:"#4c8a7b", Y:"#63ba74", W:"#3ca951", F:"#308741",
  D:"#ff8e7d", E:"#ff725c",
  H:"#6887d9", K:"#4269d0", R:"#3554a6",
  S:"#ffa1c5", T:"#ff8ab7",
  M:"#ffe666", C:"#ffd500",
  N:"#b682f5", Q:"#a463f2",
  X:"#757171", "-":"#d9d9d9"       // fallbacks (rare)
});

/* Group→letters (order preserved) */
const GROUPS = [
  { key:"aliphatic",         label:"Aliphatic",         aas:["P","G","A","L","V","I"] },
  { key:"aromatic",          label:"Aromatic",          aas:["Y","W","F"] },
  { key:"sulfur-containing", label:"Sulfur-containing", aas:["M","C"] },
  { key:"hydroxylic",        label:"Hydroxylic",        aas:["S","T"] },
  { key:"basic",             label:"Basic",             aas:["H","K","R"] },
  { key:"acidic",            label:"Acidic",            aas:["D","E"] },
  { key:"amidic",            label:"Amidic",            aas:["N","Q"] }
];

/* Contrast-aware text (white on dark, near-black on light) */
function textFor(bgHex) {
  const hex = bgHex.replace("#","").trim();
  const r = parseInt(hex.substring(0,2),16) / 255;
  const g = parseInt(hex.substring(2,4),16) / 255;
  const b = parseInt(hex.substring(4,6),16) / 255;
  const toLin = c => (c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
  const L = 0.2126*toLin(r) + 0.7152*toLin(g) + 0.0722*toLin(b);
  return L > 0.6 ? "#111" : "#fff";
}

/**
 * Build a 7-group AA colour legend DOM element
 * @param {Object} opts
 * @param {string}  [opts.label="Amino-acid colour key"]
 * @param {number}  [opts.square=22]    – size of each colour square (px)
 * @param {number}  [opts.gap=6]        – gap between squares (px)
 * @param {string}  [opts.fontFamily="'Roboto', sans-serif"]
 * @returns {HTMLElement}
 */
export function aaColourKey({
  label = "Amino-acid colour key",
  square = 22,
  gap = 6,
  fontFamily = "'Roboto', sans-serif"
} = {}) {
  const root = document.createElement("div");
  root.className = "aa-key-root";
  root.style.fontFamily = fontFamily;

  const style = document.createElement("style");
  style.textContent = `
.aa-key-root { width:100%; box-sizing:border-box; }
.aa-key-label { display:block; font-weight:500; margin-bottom:8px; }

.aa-groups {
  display:flex;
  flex-wrap:wrap;                 /* allow groups to wrap when narrow */
  gap: 14px 18px;                 /* whitespace *between* groups */
  align-items:flex-start;
}

/* Each group is a vertical mini-block (label above, swatches below) */
.aa-group  {
  display:flex;
  flex-direction:column;
  gap:4px;
  padding: 0px 4px;               /* subtle internal breathing room */
}

.aa-group-title {
  font-size:12px;
  color:#444;
  line-height:1.2;
}

/* Swatches in a single row per group */
.aa-swatch-row {
  display:flex;
  flex-wrap:nowrap;               /* keep each group's swatches on one line */
  gap:${gap}px;
}

/* Square swatch with letter */
.aa-swatch {
  width:${square}px; height:${square}px;
  border-radius:6px;
  border:1px solid rgba(0,0,0,.12);
  display:inline-flex; align-items:center; justify-content:center;
  font-weight:600; font-size:${Math.max(11, Math.round(square*0.55))}px;
  line-height:1; user-select:none;
}
  `;
  root.appendChild(style);

  if (label) {
    const lbl = document.createElement("div");
    lbl.className = "aa-key-label";
    lbl.textContent = label;
    root.appendChild(lbl);
  }

  const groupsWrap = document.createElement("div");
  groupsWrap.className = "aa-groups";
  root.appendChild(groupsWrap);

  for (const g of GROUPS) {
    const section = document.createElement("div");
    section.className = "aa-group";

    const title = document.createElement("div");
    title.className = "aa-group-title";
    title.textContent = g.label;
    section.appendChild(title);

    const row = document.createElement("div");
    row.className = "aa-swatch-row";

    for (const aa of g.aas) {
      const hex = AMINOACID_PALETTE[aa] || "#bbb";
      const sw = document.createElement("div");
      sw.className = "aa-swatch";
      sw.style.background = hex;
      sw.style.color = textFor(hex);
      sw.textContent = aa;        // no tooltip / no interactivity
      row.appendChild(sw);
    }

    section.appendChild(row);
    groupsWrap.appendChild(section);
  }

  return root;
}
