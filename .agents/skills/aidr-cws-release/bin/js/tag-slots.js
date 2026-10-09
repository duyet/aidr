(() => {
  const names = ["icon", "localized", "global", "small", "marquee"];
  document.querySelectorAll("input[type=file]").forEach((i, k) => (i.dataset.slot = names[k]));
  return 1;
})()
