(() => {
  const dlg = [...document.querySelectorAll("[role=dialog],[role=alertdialog]")].filter(
    (d) => d.offsetParent !== null && /remove this image/i.test(d.innerText)
  );
  if (dlg.length !== 1) return "dialogs: " + dlg.length;
  [...dlg[0].querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove").setAttribute("data-x", "ok");
  return "ok";
})()
