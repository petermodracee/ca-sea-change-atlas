/**
 * Builds a row of `.scenario-btn` picker buttons inside `container` —
 * shared by BCDC's SLR/storm-surge scenario pickers, CoSMoS's
 * storm-frequency picker, and CFEM storm surge's hurricane-category
 * picker. Clicking a button gives it the `active` class (removing it
 * from its siblings) and calls `onPick`; the small behavioral
 * differences between the three original call sites (initial active
 * button, per-option disabling, per-option dataset attributes, whether
 * the container is rebuilt from scratch each call) are all parameters
 * rather than assumptions baked into this function.
 *
 * @param {HTMLElement} container
 * @param {Array} options
 * @param {object} [config]
 * @param {(opt: any) => string} [config.label] - button text, defaults to opt.label.
 * @param {(opt: any) => boolean} [config.isActive] - whether this option starts active.
 * @param {(opt: any) => boolean} [config.isDisabled] - whether this option starts disabled.
 * @param {(opt: any) => Record<string,string|number>} [config.dataset] - dataset attrs to set on the button.
 * @param {(opt: any, button: HTMLButtonElement) => void} config.onPick - click handler.
 * @param {boolean} [config.clear] - clear the container's existing children first (for pickers rebuilt on state change).
 */
export function buildButtonGrid(container, options, config){
  const {
    label = opt => opt.label,
    isActive = () => false,
    isDisabled = () => false,
    dataset = () => ({}),
    onPick,
    clear = false
  } = config;

  if(clear) container.innerHTML = "";

  options.forEach(opt => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "scenario-btn";
    b.textContent = label(opt);
    if(isActive(opt)) b.classList.add("active");
    if(isDisabled(opt)) b.disabled = true;
    Object.entries(dataset(opt)).forEach(([key, value]) => { b.dataset[key] = value; });
    b.addEventListener("click", () => {
      container.querySelectorAll(".scenario-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      onPick(opt, b);
    });
    container.appendChild(b);
  });
}
