const app = document.querySelector("[data-monitor-light-app]");

if (app) {
  const buttons = Array.from(document.querySelectorAll("[data-temperature-button]"));
  const preview = document.querySelector("[data-light-preview]");
  const overlay = document.querySelector("[data-light-overlay]");
  const closeButton = document.querySelector("[data-overlay-close]");
  const currentName = document.querySelector("[data-current-name]");
  const currentKelvin = document.querySelector("[data-current-kelvin]");

  const state = {
    lastFocusedElement: null,
  };

  function setText(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  function selectTemperature(button) {
    const color = button.dataset.color;
    const name = button.dataset.name;
    const kelvin = button.dataset.kelvin;

    if (!color || !name || !kelvin) {
      return;
    }

    app.style.setProperty("--current-light", color);
    setText(currentName, name);
    setText(currentKelvin, kelvin);

    buttons.forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function openOverlay() {
    if (!overlay) {
      return;
    }

    state.lastFocusedElement = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("overlay-open");

    if (closeButton) {
      closeButton.focus();
    }
  }

  function closeOverlay() {
    if (!overlay || overlay.hidden) {
      return;
    }

    overlay.hidden = true;
    document.body.classList.remove("overlay-open");

    if (
      state.lastFocusedElement &&
      typeof state.lastFocusedElement.focus === "function"
    ) {
      state.lastFocusedElement.focus();
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      selectTemperature(button);
    });
  });

  if (preview) {
    preview.addEventListener("click", openOverlay);
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeOverlay);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOverlay();
      return;
    }

    if (event.key === "Tab" && overlay && !overlay.hidden && closeButton) {
      event.preventDefault();
      closeButton.focus();
    }
  });
}
