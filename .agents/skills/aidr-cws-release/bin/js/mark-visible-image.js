// Marks the first visible image in window.__slot (data-x2=img) and its
// remove control (data-x=rm). Returns how many images the slot still has.
// Hidden templates (display:none, empty src) are skipped.
(() => {
  document.querySelectorAll("[data-x],[data-x2]").forEach((e) => {
    e.removeAttribute("data-x");
    e.removeAttribute("data-x2");
  });
  const inputs = [...document.querySelectorAll("input[type=file]")];
  const mine = [...document.querySelectorAll("img")].filter((i) => {
    if (i.getBoundingClientRect().width <= 50) return false;
    if (!i.parentElement.querySelector("[aria-label^='Remove image']")) return false;
    const next = inputs.find((x) => i.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
    return next && next.dataset.slot === window.__slot;
  });
  if (!mine.length) return "0";
  mine[0].setAttribute("data-x2", "img");
  mine[0].parentElement.querySelector("[aria-label^='Remove image']").setAttribute("data-x", "rm");
  return String(mine.length);
})()
