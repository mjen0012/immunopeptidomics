/* ───────────────────────────────────────────────────────────────
   src/components/comboSelect.js  ·  v8  (responsive + bug-fixes)
   ----------------------------------------------------------------
   • Accepts either ["A","B"]  or  [{id:"A",label:"…"}] arrays.
   • Dropdown position recalculated on *every* update so it
     never sticks at top:0 when first rendered.
   • Pointer events fixed (clicks no longer immediately hide list).
   • Fully fluid width with 120-px floor, like v7.
────────────────────────────────────────────────────────────────*/

export function comboSelect(
  items = [],
  {
    label        = "",
    placeholder  = "Search…",
    fontFamily   = "inherit",
    pillColor    = "#006DAE",
    pillText     = "#fff",
    listHeight   = 180
  } = {}
) {
  /* ─── allow both string & object inputs ─────────────────── */
  const asLabel = d => (typeof d === "string" ? d : d.label ?? d.id);
  const asId    = d => (typeof d === "string" ? d      : d.id    );
  const allIds  = items.map(asId);

  /* ─ state ─ */
  const selected = new Set();
  let   filtered = items.slice();

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

  // **NEW** force it to span 100% of the parent
  input.style.width      = "100%";
  input.style.boxSizing  = "border-box";

  /* dropdown list */
  list.className  = "combo-list";
  list.style.display = "none";
  root.appendChild(list);

  /* pill container */
  pills.className = "combo-pills";
  root.appendChild(pills);

  /* ─ helper: keep dropdown anchored ─ */
  const positionList = () => {
    const { top, height } = input.getBoundingClientRect();
    const parentTop      = root.getBoundingClientRect().top;
    list.style.top = `${top - parentTop + height}px`;
  };

  /* ─ show / hide ─ */
  const showList = () => {
    if (filtered.length) {
      list.style.display = "block";
      positionList();
    }
  };
  const hideList = () => { list.style.display = "none"; };

  /* ─ refresh pills & list ─ */
  const refreshPills = () => {
    pills.innerHTML = "";
    selected.forEach(id => {
      const pill = Object.assign(document.createElement("span"), {
        className : "combo-pill",
        textContent: asLabel(items[allIds.indexOf(id)])
      });
      const btn  = Object.assign(document.createElement("button"), {
        className : "combo-x",
        ariaLabel : `Remove ${id}`,
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

  const refreshList = () => {
    list.innerHTML = "";
    for (const d of filtered) {
      const id  = asId(d);
      const txt = asLabel(d);
      const li = Object.assign(document.createElement("li"), {
        className : "combo-item" + (selected.has(id) ? " is-selected" : ""),
        textContent: txt
      });
      li.onclick = e => { e.stopPropagation(); toggleSelect(id); };
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

  /* ─ update cycle ─ */
  function update() {
    const q = input.value.trim().toLowerCase();
    filtered = q
      ? items.filter(d => asLabel(d).toLowerCase().includes(q))
      : items.slice();

    refreshPills();
    refreshList();
    if (document.activeElement === input) showList();

    root.value = Array.from(selected);
    root.dispatchEvent(new CustomEvent("input"));
  }

  /* ─ events ─ */
  input.addEventListener("input", update);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && filtered.length) {
      toggleSelect(asId(filtered[0]));
      e.preventDefault();
    }
  });
  input.addEventListener("focus", showList);

  /* keep list visible on click inside; hide otherwise */
  root.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", hideList);

  /* first paint */
  update();

  /* ─ styles ─ */
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

  return root;
}
