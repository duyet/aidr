// Grounds behind the stories (look axis "background"): #root carries `bg-<id>`.

export const BACKGROUNDS = [
  { id: "paper", auto: true, css: "" },
  {
    id: "soft",
    auto: true,
    css: `
.bg-soft .ground {
  background: var(--soft);
}
`,
  },
  {
    id: "grid",
    auto: true,
    css: `
.bg-grid .ground {
  background-color: var(--paper);
  background-image:
    linear-gradient(var(--hair) 1px, transparent 1px),
    linear-gradient(90deg, var(--hair) 1px, transparent 1px);
  background-size: 120px 120px;
}
`,
  },
];
