import {html} from "htl";

/**
 * Metric card component for Observable Framework dashboards.
 * Now supports placeholders and runtime updates via root.set(...).
 *
 * Props
 *  - title        string
 *  - current      number | string ("--" placeholder etc.)
 *  - previous?    number
 *  - format?      Intl.NumberFormat options
 *  - hideDelta?   boolean
 */
export function metricCard({title, current, previous, format = {}, hideDelta = false}) {
  // elements
  const titleEl = html`<h2 style="margin:0; font-weight:500;"></h2>`;
  const bigEl   = html`<span class="big" style="font-family:Roboto, sans-serif; font-weight:700; white-space:nowrap;"></span>`;
  const pillEl  = html`<span style="background:#F2F2F7; border-radius:1rem; padding:2px 10px; font-size:0.75rem; color:#4b5563; white-space:nowrap; display:none;"></span>`;
  const deltaWrap = html`<span style="display:none; align-items:baseline; gap:6px; white-space:nowrap;"></span>`;

  const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v) || fb;

  const arrowSvg = (colour, up) => html`<svg viewBox="0 0 24 24" width="16" height="16"
    style="vertical-align:-3px; stroke:${colour}; fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round;">
      ${up
        ? html`<polyline points="3 17 9 11 13 15 21 7"/><polyline points="21 13 21 7 15 7"/>`
        : html`<polyline points="3 7 9 13 13 9 21 17"/><polyline points="21 11 21 17 15 17"/>`}
    </svg>`;

  const root = html`<div class="card metric-card" style="margin:0; font-family:Roboto, sans-serif; display:flex; flex-direction:column; gap:0.6rem;">
    ${titleEl}
    <div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; max-width:100%;">
      ${bigEl}${deltaWrap}${pillEl}
    </div>
  </div>`;

  function render({title, current, previous, format = {}, hideDelta = false}) {
    // title
    titleEl.textContent = title ?? "";

    // big value (number or string placeholder/message)
    if (typeof current === "string") {
      bigEl.textContent = current;
    } else if (Number.isFinite(current)) {
      bigEl.textContent = current.toLocaleString("en-US");
    } else {
      bigEl.textContent = "--";
    }

    // pill (previous)
    if (Number.isFinite(previous)) {
      pillEl.textContent = previous.toLocaleString("en-US");
      pillEl.style.display = "inline-flex";
    } else {
      pillEl.style.display = "none";
    }

    // delta (only if both numeric and not hidden)
    const hasPrev = Number.isFinite(previous);
    const hasCurr = Number.isFinite(current);
    const showDelta = hasPrev && hasCurr && !hideDelta;
    if (showDelta) {
      const delta = current - previous;
      const dir   = Math.sign(delta);
      const colour = dir > 0
        ? css("--theme-foreground-positive", "#16a34a")
        : dir < 0
          ? css("--theme-foreground-negative", "#dc2626")
          : css("--theme-foreground-muted",    "#6b7280");

      const deltaText = `${dir > 0 ? "+" : dir < 0 ? "−" : ""}${new Intl.NumberFormat("en-US", format).format(Math.abs(delta))}`;
      deltaWrap.innerHTML = ""; // clear
      if (dir !== 0) deltaWrap.appendChild(arrowSvg(colour, dir > 0));
      deltaWrap.appendChild(html`<span style="color:${colour}; font-family:Roboto, sans-serif;">${deltaText}</span>`);
      deltaWrap.style.display = "inline-flex";
    } else {
      deltaWrap.style.display = "none";
    }
  }

  // public API for reactive updates
  root.set = (next = {}) => render({ title, current, previous, format, hideDelta, ...next });

  // initial paint
  render({title, current, previous, format, hideDelta});
  return root;
}
