/* ───────────────────────────────────────────────────────────────
   components/comboSelectLazy.js  ·  v1.2
   Lazy multi-select with paged fetch + infinite scroll.
────────────────────────────────────────────────────────────────*/
export function comboSelectLazy({
  label        = "",
  placeholder  = "Search…",
  fontFamily   = "'Roboto', sans-serif",
  pillColor    = "#006DAE",
  pillText     = "#fff",
  listHeight   = 180,
  fetch,                   // REQUIRED: ({ q, offset, limit }) => Promise<string[]>
  initialLimit = 20,       // shown on focus when q === ""
  pageLimit    = 50        // used when q.length >= 2
} = {}) {
  if (typeof fetch !== "function") {
    throw new Error("comboSelectLazy: expected a fetch({q,offset,limit}) function.");
  }

  /* state */
  const selected   = new Set();
  let items        = [];             // currently rendered slice
  let q            = "";             // current query
  let offset       = 0;              // paging offset
  let canLoadMore  = false;          // infinite scroll guard
  let inflight     = 0;              // request token to dedupe late responses
  let connected    = true;           // detached guard
  let lastFetchFor = "";             // dedupe when query changes
  let everMounted  = false;          // becomes true after first attach

  /* elements */
  const root    = document.createElement("div");
  const input   = document.createElement("input");
  const list    = document.createElement("ul");
  const pills   = document.createElement("div");
  const labelEl = label ? document.createElement("label") : null;
  const footer  = document.createElement("div");

  root.className      = "combo-root";
  root.style.position = "relative";
  root.style.minWidth = "120px";
  root.style.width    = "100%";

  if (labelEl) {
    labelEl.className = "combo-label";
    labelEl.textContent = label;
    labelEl.htmlFor = "__csl_" + Math.random().toString(36).slice(2);
    input.id = labelEl.htmlFor;
    root.appendChild(labelEl);
  }

  input.className   = "combo-search";
  input.type        = "text";
  input.placeholder = placeholder;
  input.style.width = "100%";
  input.style.boxSizing = "border-box";
  root.appendChild(input);

  list.className = "combo-list";
  list.style.display = "none";
  list.style.overflowY = "auto";
  list.style.maxHeight = `${listHeight}px`;
  list.style.zIndex = "10000";            // keep above surrounding cards
  root.appendChild(list);

  pills.className = "combo-pills";
  root.appendChild(pills);

  footer.className = "combo-footer";
  footer.style.cssText = "font-size:12px;color:#666;padding:4px 6px;border-top:1px solid #eee;display:none;";
  footer.textContent = "Type ≥ 2 characters to load more…";
  root.appendChild(footer);

  /* styles */
  const style = document.createElement("style");
  style.textContent = `
.combo-root   { font-family:${fontFamily}; width:100%; box-sizing:border-box; }
.combo-label  { display:block; margin-bottom:4px; font:500 13px/1.3 ${fontFamily}; color:#111; }
.combo-search {
  width:100%; height:36px; padding:0 .5em; font:inherit;
  border:1px solid #bbb; border-radius:6px; box-sizing:border-box;
}
.combo-list {
  margin:0; padding:0; list-style:none;
  width:100%; overflow-y:auto;
  border:1px solid #ccc; border-radius:6px; background:#fff;
  position:absolute; left:0; right:0; display:none; box-sizing:border-box;
}
.combo-item { padding:.3em .5em; cursor:pointer; }
.combo-item:hover       { background:#f0f0f0; }
.combo-item.is-selected { background:#e8f4ff; }
.combo-pills {
  width:100%; display:flex; gap:4px; flex-wrap:wrap; margin-top:6px;
}
.combo-pill {
  background:${pillColor}; color:${pillText};
  padding:.2em .4em; border-radius:12px; display:inline-flex; align-items:center; gap:4px; font-size:.85em;
}
.combo-x {
  background:none; border:none; cursor:pointer; font-size:1em; line-height:1; color:#fff;
}
  `;
  root.appendChild(style);

  /* helpers */
  const asId = d => d;  // alleles are simple strings

  const positionList = () => {
    const { top, height } = input.getBoundingClientRect();
    const parentTop = root.getBoundingClientRect().top;
    list.style.top = `${top - parentTop + height}px`;
  };
  const showList = () => { list.style.display = "block"; positionList(); };
  const hideList = () => { list.style.display = "none"; };

  const renderPills = () => {
    pills.innerHTML = "";
    selected.forEach(id => {
      const pill = document.createElement("span");
      pill.className = "combo-pill";
      pill.textContent = id;
      const btn = document.createElement("button");
      btn.className = "combo-x";
      btn.ariaLabel = `Remove ${id}`;
      btn.textContent = "×";
      btn.onclick = e => { e.stopPropagation(); selected.delete(id); commit(); };
      pill.appendChild(btn);
      pills.appendChild(pill);
    });
  };

  const renderList = () => {
    list.innerHTML = "";
    for (const txt of items) {
      const id = asId(txt);
      const li = document.createElement("li");
      li.className = "combo-item" + (selected.has(id) ? " is-selected" : "");
      li.textContent = txt;
      li.onclick = e => { e.stopPropagation(); toggle(id); };
      list.appendChild(li);
    }
    if (q.length < 2) {
      footer.style.display = "block";
      list.appendChild(footer);
    } else {
      footer.style.display = "none";
    }
    positionList();
  };

  const toggle = (id) => {
    selected.has(id) ? selected.delete(id) : selected.add(id);
    commit();
  };

  const commit = () => {
    renderPills();
    list.querySelectorAll(".combo-item").forEach(li => {
      if (selected.has(li.textContent)) li.classList.add("is-selected");
      else li.classList.remove("is-selected");
    });
    root.value = Array.from(selected);
    root.dispatchEvent(new CustomEvent("input"));
  };

  /* paging / fetching */
  const fetchPage = async ({ offset: off = 0, limit } = {}) => {
    const token = ++inflight;
    const wantQ = q;
    const lim   = limit ?? (q.length === 0 ? initialLimit : pageLimit);

    let next = [];
    try { next = await fetch({ q: wantQ, offset: off, limit: lim }) || []; }
    catch { /* noop */ }

    // Ignore stale responses or if we've been detached
    if (token !== inflight || !connected) return;

    // Reset when query changed
    if (lastFetchFor !== wantQ) {
      items = [];
      lastFetchFor = wantQ;
    }

    // Append/replace
    if (off === 0) items = next;
    else           items = items.concat(next);

    canLoadMore = next.length === lim && q.length >= 2;
    offset = off + next.length;

    renderList();
    if (document.activeElement === input) showList();
  };

  /* events (single definitions) */
  const onInput = async () => {
    q = input.value.trim();
    offset = 0;
    canLoadMore = false;
    await fetchPage({ offset: 0 });
  };

  const onFocus = async () => {
    // Load first page lazily on first focus
    if (!items.length) await fetchPage({ offset: 0, limit: initialLimit });
    showList();
  };

  const onScroll = async () => {
    if (!canLoadMore) return;
    const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    if (nearBottom) await fetchPage({ offset });  // next page
  };

  const onDocClick = () => hideList();

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && items.length) {
      toggle(asId(items[0]));
      e.preventDefault();
    }
  });
  input.addEventListener("focus", onFocus);
  list.addEventListener("scroll", onScroll);
  root.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", onDocClick);

  // Observable friendliness: provide an initial value immediately
  root.value = [];

  // Defer any eager prefetch until we're actually mounted
  requestAnimationFrame(() => {
    if (document.body.contains(root)) everMounted = true;
  });

  // Cleanup only after we've been mounted at least once
  const mo = new MutationObserver(() => {
    const nowMounted = document.body.contains(root);
    if (nowMounted) { everMounted = true; return; }
    if (!nowMounted && everMounted) {
      connected = false;
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", () => {});
      input.removeEventListener("focus", onFocus);
      list.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onDocClick);
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /* public API */
  root.clear = () => { selected.clear(); commit(); };
  root.setValue = (arr = []) => {
    selected.clear();
    for (const id of arr) selected.add(String(id));
    commit();
  };
  root.destroy = () => {
    connected = false;
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", () => {});
    input.removeEventListener("focus", onFocus);
    list.removeEventListener("scroll", onScroll);
    document.removeEventListener("click", onDocClick);
    mo.disconnect();
  };

  return root;
}
