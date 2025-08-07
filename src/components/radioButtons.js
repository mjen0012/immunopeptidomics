/* ───────────────────────────────────────────────────────────────
   components/radioButtons.js · v1
   A11y-friendly radio group for Observable:
   • Same dev pattern as Inputs.radio → emits "input" & exposes .value
   • Works with Generators.input(radioEl)
   • Label on top, radios below (wrap into multiple lines as needed)
   • Font: 'Roboto', sans-serif
   • Selected color: #006DAE
────────────────────────────────────────────────────────────────*/
export function radioButtons(
  items = [],  // ["A","B"] or [{ id:"A", label:"Alpha"}]
  {
    label = "",
    value = undefined,    // initial selection; defaults to first item if omitted
    fontFamily = "'Roboto', sans-serif",
    selectedColor = "#006DAE",
    pill = false          // set true for pill style (optional)
  } = {}
) {
  // normalize items
  const asId    = d => (typeof d === "string" ? d : d?.id ?? d?.value ?? "");
  const asLabel = d => (typeof d === "string" ? d : d?.label ?? d?.id ?? d?.value ?? "");
  const ids     = items.map(asId);
  const labels  = items.map(asLabel);

  // elements
  const root   = document.createElement("div");
  const topLbl = label ? document.createElement("label") : null;
  const group  = document.createElement("div");
  const style  = document.createElement("style");

  root.className = "rb-root";
  root.style.fontFamily = fontFamily;
  root.style.width = "100%";

  if (topLbl) {
    topLbl.className = "rb-label";
    topLbl.textContent = label;
    topLbl.id = "__rb_" + Math.random().toString(36).slice(2);
    root.appendChild(topLbl);
  }

  group.className = "rb-group";
  group.setAttribute("role", "radiogroup");
  if (topLbl) group.setAttribute("aria-labelledby", topLbl.id);
  root.appendChild(group);

  // CSS (scoped by insertion order under root)
  style.textContent = `
.rb-root { width:100%; box-sizing:border-box; }
.rb-label { display:block; margin-bottom:6px; font-weight:500; }
.rb-group {
  display:flex; flex-wrap:wrap; gap:8px;
  align-items:center; width:100%;
}
.rb-opt {
  appearance:none; border:1px solid #bbb; border-radius:${pill ? "9999px" : "8px"};
  padding:${pill ? ".35em .8em" : ".35em .6em"}; background:#fff; cursor:pointer;
  font:inherit; line-height:1.2; user-select:none;
  white-space:nowrap; box-sizing:border-box;
}
.rb-opt:hover { background:#f8f8f8; }
.rb-opt:focus { outline:2px solid rgba(0,0,0,.2); outline-offset:2px; }
.rb-opt[aria-checked="true"] {
  background:${selectedColor}; color:#fff; border-color:${selectedColor};
}
  `;
  root.appendChild(style);

  // build options
  const btns = ids.map((id, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rb-opt";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.dataset.id = id;
    btn.textContent = labels[i];
    group.appendChild(btn);
    return btn;
  });

  // selection helpers
  let selected = (() => {
    if (value == null || value === "" ) return ids[0] ?? null;
    return ids.includes(value) ? value : ids[0] ?? null;
  })();

  function updateDOMFocus() {
    // roving tabindex: only the selected has tabIndex=0, others -1
    btns.forEach(b => b.tabIndex = -1);
    const idx = ids.indexOf(selected);
    if (idx >= 0) btns[idx].tabIndex = 0;
  }

  function paint() {
    btns.forEach(btn => {
      const is = btn.dataset.id === String(selected);
      btn.setAttribute("aria-checked", is ? "true" : "false");
    });
    updateDOMFocus();
  }

  function commit(newId, triggerEvent = true) {
    if (!ids.length) return;
    if (!ids.includes(newId)) return;
    if (selected === newId) return;
    selected = newId;
    paint();
    // Observable compatibility
    root.value = selected;
    if (triggerEvent) root.dispatchEvent(new CustomEvent("input"));
  }

  // initial paint & value exposure
  paint();
  root.value = selected;

  // events
  btns.forEach((btn, i) => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      commit(btn.dataset.id, true);
      btn.focus();
    });
    btn.addEventListener("keydown", e => {
      // Arrow navigation
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = (ids.indexOf(selected) + 1) % ids.length;
        commit(ids[idx], true);
        btns[idx].focus();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = (ids.indexOf(selected) - 1 + ids.length) % ids.length;
        commit(ids[idx], true);
        btns[idx].focus();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        commit(btn.dataset.id, true);
      }
    });
  });

  // public API
  root.setValue = (v) => commit(String(v), false);
  root.clear    = () => commit(ids[0] ?? null, true);
  root.destroy  = () => {
    btns.forEach(btn => {
      btn.replaceWith(btn.cloneNode(true)); // simplest detach listeners
    });
  };

  // focus management: focus the selected on group focus
  group.addEventListener("focus", () => {
    const idx = Math.max(0, ids.indexOf(selected));
    btns[idx]?.focus();
  }, true);

  return root;
}
