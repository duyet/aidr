import { t } from "./i18n.js";
import { withExtRef } from "./ref.js";
import {
  allowCustomApiBase,
  ensureHostPermission,
  isDarkAppearance,
  saveSettings,
} from "./settings.js";

const DENSITIES = ["compact", "comfortable", "spacious"];
const TLDR_COUNTS = [8, 12, 16];
const FONTS = ["sans", "serif"];
const BG_SWATCHES = [
  { key: "default", color: "var(--background)" },
  { key: "cream", color: "#faf6ec" },
  { key: "gray", color: "#d9d9d6" },
  { key: "dark", color: "#2a2a28" },
  { key: "black", color: "#000000" },
];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null)
      node.setAttribute(key, String(value));
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

function choiceButton(label, pressed, onClick, extraClass = "") {
  return el(
    "button",
    {
      type: "button",
      className: `prefs-choice${pressed ? " is-active" : ""}${extraClass ? ` ${extraClass}` : ""}`,
      "aria-pressed": pressed ? "true" : "false",
      onClick,
    },
    [label]
  );
}

/**
 * Tabbed prefs UI matching aidr.today PrefsPanel (Aa dialog).
 * Used by the new-tab popover and chrome://extensions options page.
 */
export function mountSettingsPanel(root, settings, onSaved) {
  root.replaceChildren();

  const state = { ...settings, sections: { ...settings.sections } };
  let activeTab = "theme";

  const persist = async ({ repaint = true } = {}) => {
    const allowed = await ensureHostPermission(state.apiBase);
    if (!allowed) return;
    const saved = await saveSettings(state);
    Object.assign(state, saved, { sections: { ...saved.sections } });
    onSaved?.(saved);
    if (repaint) paint();
  };

  const paint = () => {
    root.replaceChildren(buildShell());
  };

  const setDarkMode = async (dark) => {
    if (dark) {
      state.theme = "dark";
      state.bg = state.bg === "black" ? "black" : "dark";
    } else {
      state.theme = "light";
      state.bg =
        state.bg === "cream" || state.bg === "gray" ? state.bg : "default";
    }
    await persist();
  };

  const buildThemeTab = () => {
    const dark = isDarkAppearance(state);

    const appearanceRow = el("div", { className: "prefs-grid-2" }, [
      choiceButton(t(state, "light"), !dark, async () => {
        await setDarkMode(false);
      }),
      choiceButton(t(state, "dark"), dark, async () => {
        await setDarkMode(true);
      }),
    ]);

    const fontRow = el("div", { className: "prefs-font-grid" });
    for (const font of FONTS) {
      const btn = el(
        "button",
        {
          type: "button",
          className: `prefs-font-card${state.font === font ? " is-active" : ""}`,
          "aria-pressed": state.font === font ? "true" : "false",
          onClick: async () => {
            state.font = font;
            await persist();
          },
        },
        [
          el("span", {
            className:
              font === "serif" ? "prefs-font-sample prefs-font-serif" : "prefs-font-sample",
          }, ["Aa"]),
          el("span", { className: "prefs-font-name" }, [
            font === "sans" ? t(state, "sans") : t(state, "serif"),
          ]),
        ]
      );
      fontRow.append(btn);
    }

    const sizePct = Math.round(state.fontSize * 100);
    const sizeValue = el("span", {}, [`${sizePct}%`]);
    const sizeSlider = el("input", {
      type: "range",
      className: "prefs-slider",
      min: "0.85",
      max: "1.25",
      step: "0.05",
      value: String(state.fontSize),
      "aria-label": t(state, "size"),
      onInput: async (event) => {
        state.fontSize = Number(event.target.value);
        sizeValue.textContent = `${Math.round(state.fontSize * 100)}%`;
        await persist({ repaint: false });
      },
    });

    const densityIdx = Math.max(0, DENSITIES.indexOf(state.density));
    const densitySlider = el("input", {
      type: "range",
      className: "prefs-slider",
      min: "0",
      max: "2",
      step: "1",
      value: String(densityIdx),
      "aria-label": t(state, "density"),
      onInput: async (event) => {
        state.density = DENSITIES[Number(event.target.value)] || "compact";
        await persist({ repaint: false });
      },
    });

    const swatches = el("div", { className: "prefs-swatches" });
    for (const swatch of BG_SWATCHES) {
      swatches.append(
        el("button", {
          type: "button",
          className: `prefs-swatch${state.bg === swatch.key ? " is-active" : ""}`,
          style: `background:${swatch.color}`,
          "aria-label": swatch.key,
          "aria-pressed": state.bg === swatch.key ? "true" : "false",
          onClick: async () => {
            state.bg = swatch.key;
            if (swatch.key === "dark" || swatch.key === "black") {
              state.theme = "dark";
            } else if (state.theme === "dark") {
              state.theme = "light";
            }
            await persist();
          },
        })
      );
    }

    return el("div", { className: "prefs-tab-body" }, [
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label" }, [t(state, "appearance")]),
        appearanceRow,
      ]),
      el("div", { className: "prefs-field" }, [fontRow]),
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label prefs-label-row" }, [
          el("span", {}, [t(state, "size")]),
          sizeValue,
        ]),
        sizeSlider,
      ]),
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label" }, [t(state, "density")]),
        densitySlider,
      ]),
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label" }, [t(state, "background")]),
        swatches,
      ]),
    ]);
  };

  const buildSettingsTab = () => {
    const countValue = el("span", {}, [String(state.storyCount)]);
    const countSlider = el("input", {
      type: "range",
      className: "prefs-slider",
      min: "1",
      max: "8",
      step: "1",
      value: String(state.storyCount),
      "aria-label": t(state, "storyCount"),
      onInput: async (event) => {
        state.storyCount = Number(event.target.value);
        countValue.textContent = String(state.storyCount);
        await persist({ repaint: false });
      },
    });

    const tldrRow = el("div", { className: "prefs-grid-3" });
    for (const n of TLDR_COUNTS) {
      tldrRow.append(
        choiceButton(String(n), state.tldrCount === n, async () => {
          state.tldrCount = n;
          await persist();
        })
      );
    }

    const langRow = el("div", { className: "prefs-grid-3" }, [
      choiceButton(t(state, "vi"), state.language === "vi", async () => {
        state.language = "vi";
        await persist();
      }),
      choiceButton(t(state, "en"), state.language === "en", async () => {
        state.language = "en";
        await persist();
      }),
      choiceButton(t(state, "both"), state.language === "both", async () => {
        state.language = "both";
        await persist();
      }),
    ]);

    const sectionTiles = [
      { key: "trending", labelKey: "trendingPreview" },
      { key: "tldr", labelKey: "tldrPreview" },
      { key: "stories", labelKey: "dailyFeedPreview" },
      { key: "categories", labelKey: "categoriesPreview" },
    ];
    const grid = el("div", { className: "prefs-tiles" });
    for (const { key, labelKey } of sectionTiles) {
      const on = state.sections[key] !== false;
      const tile = choiceButton(t(state, labelKey), on, async () => {
        state.sections[key] = !on;
        await persist({ repaint: false });
      }, " is-full-width");
      tile.setAttribute(
        "aria-label",
        on ? t(state, "hide") : t(state, labelKey)
      );
      grid.append(tile);
    }
    const checks = grid;

    const fields = [
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label" }, [t(state, "tldrCount")]),
        tldrRow,
      ]),
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label" }, [t(state, "language")]),
        langRow,
      ]),
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label prefs-label-row" }, [
          el("span", {}, [t(state, "storyCount")]),
          countValue,
        ]),
        countSlider,
      ]),
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label" }, [t(state, "sections")]),
        checks,
      ]),
      el("div", { className: "prefs-field" }, [
        el("span", { className: "prefs-label prefs-label-row" }, [
          el("span", {}, [t(state, "showFooter")]),
          el(
            "input",
            {
              type: "checkbox",
              checked: state.showFooter,
              onChange: async (event) => {
                state.showFooter = event.target.checked;
                await persist({ repaint: false });
              },
            },
            []
          ),
        ]),
      ]),
    ];

    const manifest =
      typeof globalThis.chrome?.runtime?.getManifest === "function"
        ? globalThis.chrome.runtime.getManifest()
        : null;
    if (allowCustomApiBase(manifest)) {
      const apiInput = el("input", {
        type: "url",
        className: "prefs-input",
        value: state.apiBase,
        spellcheck: "false",
      });
      apiInput.addEventListener("change", async () => {
        state.apiBase = apiInput.value;
        await persist({ repaint: false });
      });
      fields.push(
        el("div", { className: "prefs-field" }, [
          el("span", { className: "prefs-label" }, [t(state, "apiBase")]),
          apiInput,
        ])
      );
    }

    return el("div", { className: "prefs-tab-body" }, fields);
  };

  const buildAboutTab = () =>
    el("div", { className: "prefs-tab-body prefs-about" }, [
      el("p", {}, [t(state, "aboutBody")]),
      el(
        "a",
        {
          href: withExtRef("https://aidr.today/about", "prefs_about"),
          rel: "noreferrer",
          target: "_blank",
        },
        [t(state, "aboutLink")]
      ),
    ]);

  const buildShell = () => {
    const tabs = el("div", { className: "prefs-tabs", role: "tablist" }, [
      el(
        "button",
        {
          type: "button",
          role: "tab",
          className: `prefs-tab${activeTab === "theme" ? " is-active" : ""}`,
          "aria-selected": activeTab === "theme" ? "true" : "false",
          onClick: () => {
            activeTab = "theme";
            paint();
          },
        },
        [t(state, "theme")]
      ),
      el(
        "button",
        {
          type: "button",
          role: "tab",
          className: `prefs-tab${activeTab === "settings" ? " is-active" : ""}`,
          "aria-selected": activeTab === "settings" ? "true" : "false",
          onClick: () => {
            activeTab = "settings";
            paint();
          },
        },
        [t(state, "settings")]
      ),
      el(
        "button",
        {
          type: "button",
          role: "tab",
          className: `prefs-tab${activeTab === "about" ? " is-active" : ""}`,
          "aria-selected": activeTab === "about" ? "true" : "false",
          onClick: () => {
            activeTab = "about";
            paint();
          },
        },
        [t(state, "about")]
      ),
    ]);

    const body =
      activeTab === "settings"
        ? buildSettingsTab()
        : activeTab === "about"
          ? buildAboutTab()
          : buildThemeTab();

    return el("div", { className: "prefs-panel" }, [tabs, body]);
  };

  paint();
}

/**
 * Aa popover like aidr.today PrefsPanel — fixed + high z-index so page
 * content cannot sit above the controls (the old drawer used z-index: 2
 * under .news-content z-index: 10, which made settings unclickable).
 */
export function bindPrefsPopover({ getSettings, onChange, triggers }) {
  let openBtn = null;
  let dialog = null;

  const place = () => {
    if (!dialog || !openBtn) return;
    const rect = openBtn.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 24);
    let left = rect.right - width;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    const top = rect.bottom + 8;
    dialog.style.width = `${width}px`;
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
    // Flip above the trigger if it would fall off the bottom.
    requestAnimationFrame(() => {
      if (!dialog) return;
      const box = dialog.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 12) {
        dialog.style.top = `${Math.max(12, rect.top - box.height - 8)}px`;
      }
    });
  };

  const close = () => {
    if (dialog) {
      dialog.remove();
      dialog = null;
    }
    openBtn = null;
    for (const btn of triggers) {
      btn?.setAttribute("aria-expanded", "false");
    }
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
  };

  const open = (btn) => {
    if (openBtn === btn && dialog) {
      close();
      return;
    }
    close();
    openBtn = btn;
    dialog = el("div", {
      className: "prefs-dialog",
      role: "dialog",
      "aria-label": t(getSettings(), "prefsTitle"),
    });
    const root = el("div", { className: "prefs-dialog-root" });
    dialog.append(root);
    document.body.append(dialog);
    btn.setAttribute("aria-expanded", "true");
    mountSettingsPanel(root, getSettings(), onChange);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  };

  for (const btn of triggers) {
    if (!btn) continue;
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      open(btn);
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (!dialog) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (dialog.contains(target)) return;
    if (triggers.some((b) => b?.contains(target))) return;
    close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog) close();
  });
}
