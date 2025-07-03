import {html, nothing, render} from "npm:lit-html";
import {repeat} from "npm:lit-html/directives/repeat.js";
// The 'Inputs' import was removed from here as it was unused and causing errors.
/**
 * Pill-style multi-select component.
 * Shows the option list only when the search box has ≥ MIN_CHARS characters.
 *
 * @param {Object}   opts
 * @param {string}     opts.label
 * @param {string}     opts.placeholder
 * @param {string[]}   opts.options       – array of strings
 * @param {number}   [opts.minChars=2]    – chars required before listing options
 */
export function multiSelect({
  label,
  placeholder = "",
  options = [],
  minChars = 2
}) {
  /* -------------------- constants & state ------------------------- */
  const MIN_CHARS = minChars;
  const el   = document.createElement("div");
  el.className = "relative font-sans";
  el.value = [];                       // current selection

  let optionsToShow = [];              // nothing visible at start

  /* -------------------- behaviours ------------------------------- */
  function toggle(item) {
    el.value = el.value.includes(item)
      ? el.value.filter(d => d !== item)
      : [...el.value, item];

    // Hide list again after a choice
    optionsToShow = [];
    render(view(), el);
  }

  function filter(txt) {
    const q = txt.trim().toLowerCase();
    optionsToShow =
      q.length >= MIN_CHARS
        ? options.filter(o => o.toLowerCase().includes(q))
        : [];

    render(view(), el);
  }

  /* -------------------- template ------------------------------- */
  const view = () => html`
    <label class="block text-sm font-medium mb-1">${label}</label>
    <input  type="text"
            placeholder=${placeholder}
            class="w-full border rounded px-2 py-1 mb-1"
            @input=${e => filter(e.target.value)} />

    <!-- suggestions (only populated when optionsToShow.length > 0) -->
    <div class="flex flex-wrap gap-1 mb-1">
      ${optionsToShow.map(o => html`
        <button class="px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300"
                @click=${() => toggle(o)}>
          ${o}
        </button>`
      )}
    </div>

    <!-- selected pills -->
    <div class="flex flex-wrap gap-1">
      ${el.value.map(v => html`
        <span class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs">
          ${v}
          <button class="hover:text-gray-200" @click=${() => toggle(v)}>×</button>
        </span>`
      )}
    </div>
  `;

  /* -------------------- first paint ----------------------------- */
  render(view(), el);
  return el;
}