// components/multiSelect.js
import {html} from "htl";   // ⬅️ bring the template-tag into scope

export function multiSelect(
  data,
  {label = "Select items", placeholder = "Type to search..."} = {}
) {
  let selectedItems = [];          // internal state

  /* ---------- helper: render the selected “pills” ------------------ */
  function renderPills() {
    pillsContainer.replaceChildren();                 // clear
    for (const item of selectedItems) {
      pillsContainer.append(
        html`<div class="multi-select-pill">
          ${item}
          <button type="button"
                  class="remove-btn"
                  data-item=${item}>&times;</button>
        </div>`
      );
    }
  }

  /* ---------- helper: render the dropdown suggestions -------------- */
  function renderSuggestions(text) {
    suggestionsContainer.style.display = "block";
    suggestionsContainer.replaceChildren();

    if (text.length < 2) {
      suggestionsContainer.style.display = "none";
      return;
    }

    const lc = text.toLowerCase();
    const matches = data.filter(
      d => !selectedItems.includes(d) && d.toLowerCase().includes(lc)
    );

    if (matches.length === 0) {
      suggestionsContainer.append(
        html`<div class="suggestion-item disabled">No results found</div>`
      );
    } else {
      for (const option of matches) {
        suggestionsContainer.append(
          html`<div class="suggestion-item" data-item=${option}>
            ${option}
          </div>`
        );
      }
    }
  }

  /* ---------- static markup ---------------------------------------- */
  const form = html`<div class="multi-select-container">
    <label class="label">${label}</label>
    <div class="multi-select-pills"></div>
    <input type="text"
           placeholder=${placeholder}
           autocomplete="off"
           class="text-input">
    <div class="multi-select-suggestions" style="display:none;"></div>
  </div>`;

  const input               = form.querySelector("input");
  const pillsContainer      = form.querySelector(".multi-select-pills");
  const suggestionsContainer= form.querySelector(".multi-select-suggestions");

  /* ---------- event wiring ----------------------------------------- */
  input.oninput = () => renderSuggestions(input.value);

  suggestionsContainer.onclick = e => {
    const itemEl = e.target.closest(".suggestion-item");
    if (itemEl && !itemEl.classList.contains("disabled")) {
      selectedItems.push(itemEl.dataset.item);
      selectedItems.sort();
      input.value = "";
      suggestionsContainer.style.display = "none";
      renderPills();
      form.dispatchEvent(new Event("input", {bubbles: true}));
    }
  };

  pillsContainer.onclick = e => {
    if (e.target.classList.contains("remove-btn")) {
      selectedItems = selectedItems.filter(d => d !== e.target.dataset.item);
      renderPills();
      renderSuggestions(input.value);
      form.dispatchEvent(new Event("input", {bubbles: true}));
    }
  };

  document.addEventListener("click", e => {
    if (!form.contains(e.target)) suggestionsContainer.style.display = "none";
  });

  /* ---------- expose value to Observable --------------------------- */
  form.value = selectedItems;
  return form;
}
