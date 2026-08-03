(function enhanceSelectControls() {
  "use strict";

  const controls = [...document.querySelectorAll(".select-control")];

  function closeControl(control) {
    control.classList.remove("is-select-open");
  }

  function closeOtherControls(currentControl) {
    for (const control of controls) {
      if (control !== currentControl) closeControl(control);
    }
  }

  for (const control of controls) {
    const select = control.querySelector("select");
    if (!select) continue;

    select.addEventListener("pointerdown", () => {
      closeOtherControls(control);
      control.classList.add("is-select-open");
    });

    select.addEventListener("change", () => closeControl(control));
    select.addEventListener("blur", () => closeControl(control));
    select.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "Tab") closeControl(control);
      if (event.key === "Enter" || event.key === " ") {
        closeOtherControls(control);
        control.classList.add("is-select-open");
      }
    });
  }
})();
