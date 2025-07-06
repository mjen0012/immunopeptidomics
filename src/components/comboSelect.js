/* ────────────────────────────────────────────────────────────────
   src/components/comboSelect.js  •  v2
-----------------------------------------------------------------*/

export function comboSelect(
  items = [],
  {
    label        = "",
    placeholder  = "Search…",
    fontFamily   = "inherit",
    pillColor    = "#e0e0e0",
    pillText     = "#333",
    listHeight   = 180
  } = {}
) {
  /* ─ state ─ */
  const selected = new Set();
  let   filtered = items.slice();

  /* ─ elements ─ */
  const root   = document.createElement("div");
  const input  = document.createElement("input");
  const list   = document.createElement("ul");
  const pills  = document.createElement("div");
  const labelEl = label ? document.createElement("label") : null;

  root.className = "combo-root";
  root.style.position = "relative";          // for absolute dropdown

  /* label */
  if (labelEl) {
    labelEl.className = "combo-label";
    labelEl.textContent = label;
    labelEl.htmlFor = "__combo_" + Math.random().toString(36).slice(2);
    input.id = labelEl.htmlFor;
    root.appendChild(labelEl);
  }

  /* search box */
  input.className   = "combo-search";
  input.type        = "text";
  input.placeholder = placeholder;
  root.appendChild(input);

  /* dropdown list */
  list.className    = "combo-list";
  root.appendChild(list);

  /* pill row */
  pills.className   = "combo-pills";
  root.appendChild(pills);

  /* ─ helpers ─ */
  const refreshPills = () => {
    pills.innerHTML = "";
    selected.forEach(val => {
      const pill = Object.assign(document.createElement("span"), {
        className : "combo-pill",
        textContent: val
      });
      const btn = Object.assign(document.createElement("button"), {
        className : "combo-x",
        ariaLabel : `Remove ${val}`,
        textContent: "×",
        onclick    : e => { e.stopPropagation(); selected.delete(val); update(); }
      });
      pill.appendChild(btn);
      pills.appendChild(pill);
    });
  };

  const refreshList = () => {
    list.innerHTML = "";
    for (const val of filtered) {
      const li = Object.assign(document.createElement("li"), {
        className : "combo-item" + (selected.has(val) ? " is-selected" : ""),
        textContent: val,
        onclick    : () => { toggleSelect(val); }
      });
      list.appendChild(li);
    }
  };

  const showList = () => {
    if (filtered.length) list.style.display = "block";
  };
  const hideList = () => { list.style.display = "none"; };

  const toggleSelect = val => {
    selected.has(val) ? selected.delete(val) : selected.add(val);
    input.value = "";          // clear search box after choosing
    update();
    input.focus();
  };

  /* ─ update cycle ─ */
  function update() {
    const q = input.value.trim().toLowerCase();
    filtered = q
      ? items.filter(d => d.toLowerCase().includes(q))
      : items.slice();
    refreshPills();
    refreshList();
    root.value = Array.from(selected);
    root.dispatchEvent(new CustomEvent("input"));
  }

  /* ─ event wiring ─ */
  input.addEventListener("input", update);

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      if (filtered.length) {
        toggleSelect(filtered[0]);   // choose top option
      }
      e.preventDefault();
    }
  });

  input.addEventListener("focus", () => { list.style.display = "block"; });

  document.addEventListener("click", evt => {
    if (!root.contains(evt.target)) list.style.display = "none";
  });

  /* ─ initial paint ─ */
  update();

  /* ─ styles ─ */
  const style = document.createElement("style");
  style.textContent = `
.combo-root { font-family:${fontFamily}; }
.combo-search {
  width:100%; padding:.4em .5em; font:inherit;
  border:1px solid #bbb; border-radius:4px;
}
.combo-list {
  margin:0; padding:0; list-style:none;
  max-height:${listHeight}px; overflow-y:auto;
  border:1px solid #ccc; border-radius:4px; background:#fff;
  position:absolute; top:100%; left:0; width:100%; box-sizing:border-box;
  z-index:10; display:none;
}
.combo-item { padding:.3em .5em; cursor:pointer; }
.combo-item:hover { background:#f0f0f0; }
.combo-item.is-selected { background:#e8f4ff; }
.combo-pills { display:flex; gap:4px; flex-wrap:wrap; margin-top:6px;}
.combo-pill {
  background:${pillColor}; color:${pillText}; padding:.2em .4em; border-radius:12px;
  display:inline-flex; align-items:center; gap:4px; font-size:.85em;
}
.combo-x {
  background:none; border:none; cursor:pointer; font-size:1em; line-height:1;
}
.combo-label { display:block; margin-bottom:4px; }
`;
  root.appendChild(style);
    root.clear = () => {
    selected.clear();            // empty the Set
    input.value = "";
    update();                    // refresh UI and .value
  };

  update();

  return root;
}
