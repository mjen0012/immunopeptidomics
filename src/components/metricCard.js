import {html} from "htl";

/**
 * Metric card component for Observable Framework dashboards.
 *
 * Props
 * ────────────────────────────────────────────────────────────────
 * title      — string (card heading)
 * current    — number (required)
 * previous   — number? (optional; omit/null/NaN if unknown)
 * format     — Intl.NumberFormat options for delta (optional)
 * hideDelta  — boolean (optional; if true, omit arrow & ±∆, show only pill)
 */
export function metricCard({title, current, previous, format = {}, hideDelta = false}) {
  const hasPrev = Number.isFinite(previous);
  const delta   = hasPrev ? current - previous : NaN;
  const dir     = Math.sign(delta); // 1 ↑  -1 ↓  0 →  NaN no‑prev

  /* theme colours with graceful fall‑backs */
  const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v) || fb;
  const colour = dir > 0
    ? css("--theme-foreground-positive", "#16a34a")
    : dir < 0
      ? css("--theme-foreground-negative", "#dc2626")
      : css("--theme-foreground-muted",    "#6b7280");

  /* bold 2.5‑px stroke trend icons */
  const arrowUp   = html`<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:-3px; stroke:${colour}; fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round;"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="21 13 21 7 15 7"/></svg>`;
  const arrowDown = html`<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:-3px; stroke:${colour}; fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round;"><polyline points="3 7 9 13 13 9 21 17"/><polyline points="21 11 21 17 15 17"/></svg>`;

  const deltaText = hasPrev
    ? `${dir > 0 ? "+" : dir < 0 ? "−" : ""}${new Intl.NumberFormat("en-US", format).format(Math.abs(delta))}`
    : "—";

  /* pill HTML helper */
  const pill = hasPrev
    ? html`<span style="background:#F2F2F7; border-radius:1rem; padding:2px 10px; font-size:0.75rem; color:#4b5563;">${previous.toLocaleString("en-US")}</span>`
    : null;

  /* ---------------------------------------------------------------- */
  return html`<div class="card metric-card" style="margin:0; font-family:Roboto, sans-serif; display:flex; flex-direction:column; gap:0.6rem;">
    <h2 style="margin:0; font-weight:500;">${title}</h2>

    <!-- single row: big number + (optional) delta/arrow/pill aligned at baseline -->
    <div style="display:flex; align-items:baseline; gap:8px;">
      <span class="big" style="font-family:Roboto, sans-serif; font-weight:700;">${current.toLocaleString("en-US")}</span>

      ${hasPrev && !hideDelta ? (dir !== 0
        ? html`${dir > 0 ? arrowUp : arrowDown}<span style="color:${colour}; font-family:Roboto, sans-serif;">${deltaText}</span>`
        : html`<span style="color:${colour}; font-family:Roboto, sans-serif;">${deltaText}</span>`) : ""}

      ${pill}
    </div>
  </div>`;
}