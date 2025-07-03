import {htl} from "observablehq/htl";

// The main component function. It's exported so it can be imported in other files.
export function multiSelect(data, {label = "Select items", placeholder = "Type to search..."} = {}) {
  let selectedItems = []; // Internal state for selected items

  // --- Helper function to render the "pills" for selected items ---
  function renderPills() {
    // Clear existing pills
    while (pillsContainer.firstChild) {
      pillsContainer.removeChild(pillsContainer.firstChild);
    }
    // Create a pill for each selected item
    for (const item of selectedItems) {
      const pill = htl.html`<div class="multi-select-pill">
        ${item}
        <button type="button" class="remove-btn" data-item="${item}">&times;</button>
      </div>`;
      pillsContainer.append(pill);
    }
  }

  // --- Helper function to render the suggestions dropdown ---
  function renderSuggestions(text) {
    suggestionsContainer.style.display = 'block'; // Show the container
    while (suggestionsContainer.firstChild) {
      suggestionsContainer.removeChild(suggestionsContainer.firstChild);
    }

    if (text.length < 2) {
      suggestionsContainer.style.display = 'none'; // Hide if not enough input
      return;
    }

    const lowerCaseText = text.toLowerCase();
    const availableOptions = data.filter(d =>
      !selectedItems.includes(d) && d.toLowerCase().includes(lowerCaseText)
    );

    if (availableOptions.length === 0) {
      suggestionsContainer.append(htl.html`<div class="suggestion-item disabled">No results found</div>`);
    } else {
      for (const option of availableOptions) {
        const suggestion = htl.html`<div class="suggestion-item" data-item="${option}">${option}</div>`;
        suggestionsContainer.append(suggestion);
      }
    }
  }

  // --- Create the component's HTML structure ---
  const form = htl.html`<div class="multi-select-container">
    <label class="label">${label}</label>
    <div class="multi-select-pills"></div>
    <input type="text" placeholder=${placeholder} autocomplete="off" class="text-input">
    <div class="multi-select-suggestions" style="display: none;"></div>
  </div>`;

  // --- Get references to the dynamic parts of the component ---
  const input = form.querySelector("input");
  const pillsContainer = form.querySelector(".multi-select-pills");
  const suggestionsContainer = form.querySelector(".multi-select-suggestions");

  // --- Event Handling ---

  // When user types in the input box
  input.oninput = () => {
    renderSuggestions(input.value);
  };

  // Handle clicks on the suggestions dropdown (using event delegation)
  suggestionsContainer.onclick = (event) => {
    const target = event.target.closest('.suggestion-item');
    if (target && !target.classList.contains('disabled')) {
      const item = target.dataset.item;
      selectedItems.push(item);
      selectedItems.sort(); // Keep the list sorted
      input.value = ''; // Clear input
      suggestionsContainer.style.display = 'none'; // Hide suggestions
      renderPills();
      // Dispatch event to notify Observable Framework of the value change
      form.dispatchEvent(new Event("input", {bubbles: true}));
    }
  };

  // Handle clicks on the 'x' button of a pill (using event delegation)
  pillsContainer.onclick = (event) => {
    if (event.target.classList.contains('remove-btn')) {
      const itemToRemove = event.target.dataset.item;
      selectedItems = selectedItems.filter(i => i !== itemToRemove);
      renderPills();
      renderSuggestions(input.value); // Re-render suggestions as an item is now available
      // Dispatch event to notify of the value change
      form.dispatchEvent(new Event("input", {bubbles: true}));
    }
  };
  
  // Hide suggestions if user clicks elsewhere
  document.addEventListener("click", (event) => {
    if (!form.contains(event.target)) {
      suggestionsContainer.style.display = "none";
    }
  });


  // --- Set the initial value and return the component ---
  form.value = selectedItems;
  return form;
}