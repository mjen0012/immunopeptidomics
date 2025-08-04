/* ───────────────────────────────────────────────────────────────
   src/components/comboSelect.js  ·  v9  (lazy + delegated events)
   ----------------------------------------------------------------
   • Accepts either ["A","B"] or [{id,label}] arrays
   • NEW: minChars gate (no list until user types N chars)
   • NEW: maxResults cap per render (prevents huge DOM)
   • Uses event delegation (one click handler on <ul>)
   • Keeps v8 API; adds setItems() + clear()
────────────────────────────────────────────────────────────────*/

export function comboSelect(
  items = [],
  {
    label        = "",
    placeholder  = "Search…",
    fontFamily   = "inherit",
    pillColor    = "#006DAE",
    pillText     = "#fff",
    listHeight   = 180,
    minChars     = 2,     // ← NEW: require N chars before showing results
    maxResults   = 200    // ← NEW: cap rendered rows per update
  } = {}
) {
  /* ─ allow both string & object inputs ─ */
  const asLabel = d => (typeof d === "string" ? d : d.label ?? d.id);
  const asId    = d => (typeof d === "string" ? d      : d.id    );
  let   allIds  = items.map(asId);

  /* ─ state ─ */
  const selected = new Set();
  let   filtered = [];                 // ← start empty; render nothing at idle

  /* ─ elements ─ */
  const root    = document.createElement("div");
  const input   = document.createElement("input");
  const list    = document.createElement("ul");
  const pills   = document.createElement("div");
  const labelEl = label ? document.createElement("label") : null;

  root.className      = "combo-root";
  root.style.position = "relative";
  root.style.minWidth = "120px";
  root.style.width    = "100%";

  if (labelEl) {
    labelEl.className = "combo-label";
    labelEl.textContent = label;
    labelEl.htmlFor = "__combo_" + Math.random().toString(36).slice(2);
    input.id = labelEl.htmlFor;
    root.appendChild(labelEl);
  }

  input.className   = "combo-search";
  input.type        = "text";
  input.placeholder = minChars > 0 ? `Type ${minChars}+ chars…` : placeholder;
  root.appendChild(input);

  input.style.width     = "100%";
  input.style.boxSizing = "border-box";

  list.className   = "combo-list";
  list.style.display = "none";
  root.appendChild(list);

  pills.className = "combo-pills";
  root.appendChild(pills);

  /* keep dropdown anchored to input */
  const positionList = () => {
    const { top, height } = input.getBoundingClientRect();
    const parentTop       = root.getBoundingClientRect().top;
    list.style.top = `${top - parentTop + height}px`;
  };

  const showList = () => {
    if (filtered.length) {
      list.style.display = "block";
      positionList();
    } else {
      list.style.display = "none";
    }
  };
  const hideList = () => { list.style.display = "none"; };

  const refreshPills = () => {
    pills.innerHTML = "";
    selected.forEach(id => {
      const idx  = allIds.indexOf(id);
      const text = idx >= 0 ? asLabel(items[idx]) : id;
      const pill = Object.assign(document.createElement("span"), {
        className  : "combo-pill",
        textContent: text
      });
      const btn  = Object.assign(document.createElement("button"), {
        className  : "combo-x",
        ariaLabel  : `Remove ${id}`,
        textContent: "×"
      });
      btn.onclick = e => {
        e.stopPropagation();
        selected.delete(id);
        update();
      };
      pill.appendChild(btn);
      pills.appendChild(pill);
    });
  };

  /* event delegation (one listener) */
  list.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    e.stopPropagation();
    toggleSelect(li.dataset.id);
  });

  const renderList = () => {
    list.innerHTML = "";
    const toRender = filtered.slice(0, maxResults);     // cap
    for (const d of toRender) {
      const id  = asId(d);
      const txt = asLabel(d);
      const li  = document.createElement("li");
      li.className   = "combo-item" + (selected.has(id) ? " is-selected" : "");
      li.dataset.id  = id;                               // used by delegated click
      li.textContent = txt;
      list.appendChild(li);
    }
    positionList();
  };

  const toggleSelect = id => {
    selected.has(id) ? selected.delete(id) : selected.add(id);
    input.value = "";
    update();
    input.focus();
  };

  function update() {
    const q = input.value.trim().toLowerCase();
    if (q.length >= minChars) {
      filtered = items.filter(d => asLabel(d).toLowerCase().includes(q));
    } else {
      filtered = [];                                     // ← nothing rendered at idle
    }
    refreshPills();
    renderList();
    if (document.activeElement === input) showList();

    root.value = Array.from(selected);
    root.dispatchEvent(new CustomEvent("input"));
  }

  /* events */
  input.addEventListener("input", update);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && filtered.length) {
      toggleSelect(asId(filtered[0]));
      e.preventDefault();
    }
  });
  input.addEventListener("focus", showList);

  root.addEventListener("click", e => e.stopPropagation());
  const onDocClick = () => hideList();
  document.addEventListener("click", onDocClick);

  /* first paint — does NOT render 10k rows anymore */
  update();

  /* styles */
  const style = document.createElement("style");
  style.textContent = `
.combo-root   { font-family:${fontFamily}; width:100%; box-sizing:border-box; }
.combo-search {
  width:100%; height:36px;
  padding:0 .5em;
  font:inherit;
  border:1px solid #bbb; border-radius:6px;
  box-sizing:border-box;
}
.combo-list {
  margin:0; padding:0; list-style:none;
  width:100%; max-height:${listHeight}px; overflow-y:auto;
  border:1px solid #ccc; border-radius:6px; background:#fff;
  position:absolute; left:0; right:0;
  z-index:10; display:none; box-sizing:border-box;
}
.combo-item { padding:.3em .5em; cursor:pointer; }
.combo-item:hover       { background:#f0f0f0; }
.combo-item.is-selected { background:#e8f4ff; }
.combo-pills {
  width:100%;
  display:flex; gap:4px; flex-wrap:wrap;
  margin-top:6px;
}
.combo-pill {
  background:${pillColor}; color:${pillText};
  padding:.2em .4em; border-radius:12px;
  display:inline-flex; align-items:center; gap:4px; font-size:.85em;
}
.combo-x {
  background:none; border:none; cursor:pointer; font-size:1em; line-height:1;
  color:#fff;
}
.combo-label { display:block; margin-bottom:4px; }
`;
  root.appendChild(style);

  /* public helpers */
  root.clear = () => { selected.clear(); input.value=""; update(); };
  root.setItems = (nextItems = []) => {                 // ← NEW
    items = nextItems;
    allIds = items.map(asId);
    update();
  };

  return root;
}
