/**
 * "Embed" button on the full map: a dialog with the `<iframe>` snippet for the current view.
 * The src is `<site url>/map/embed/` plus the current hash (view, basemap, layers), so the embed
 * opens as the map looks now; "Let viewers change layers" off adds `?panel=locked`.
 * Uses a native modal `<dialog>`, which traps focus and closes on Esc.
 */

const IFRAME_TITLE = "CA Sea Change Atlas map";
const COPIED_RESET_MS = 2000;

/** Escapes a value for use inside a double-quoted HTML attribute (the hash contains `&`). */
function escapeAttribute(value){
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * @param {{flush: () => void}} permalink - from `initPermalink`; flushed so the hash is current.
 */
export function initEmbedDialog(permalink){
  const button = document.getElementById("embedBtn");
  const dialog = document.getElementById("embedDialog");
  if(!button || !dialog) return;
  const codeBox = document.getElementById("embedCode");
  const interactive = document.getElementById("embedInteractive");
  const copyBtn = document.getElementById("embedCopyBtn");
  const closeBtn = document.getElementById("embedCloseBtn");
  const embedUrl = dialog.dataset.embedUrl;
  let hash = "";

  const render = () => {
    const src = `${embedUrl}${interactive.checked ? "" : "?panel=locked"}${hash}`;
    codeBox.value = `<iframe src="${escapeAttribute(src)}" width="100%" height="500" title="${IFRAME_TITLE}" loading="lazy"></iframe>`;
  };

  button.addEventListener("click", () => {
    permalink.flush();
    hash = location.hash;
    render();
    dialog.showModal();
    codeBox.focus();
    codeBox.select();
  });

  interactive.addEventListener("change", render);
  closeBtn.addEventListener("click", () => dialog.close());
  // A click on the backdrop (the dialog element itself, outside its content box) closes it.
  dialog.addEventListener("click", e => { if(e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => button.focus());

  copyBtn.addEventListener("click", async () => {
    codeBox.focus();
    codeBox.select();
    try {
      await navigator.clipboard.writeText(codeBox.value);
      copyBtn.textContent = "Code copied";
    } catch(err){
      window.prompt("Copy this embed code:", codeBox.value); // clipboard blocked (e.g. non-secure context)
    }
    setTimeout(() => { copyBtn.textContent = "Copy code"; }, COPIED_RESET_MS);
  });
}
