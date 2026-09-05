import { fetchDigest } from "./api.js";
import { highlightTitle, tagsForHighlight } from "./highlight.js";
import { t, uiLang } from "./i18n.js";
import { tagSiteLinks, withExtRef } from "./ref.js";
import {
  applyAppearance,
  loadSettings,
  safeHttpUrl,
  saveSettings,
} from "./settings.js";
import { bindPrefsPopover } from "./settings-panel.js";
import { topicColor } from "./topic-color.js";
import {
  fetchExtensionMeta,
  installedVersion,
  isChromeWebStoreInstall,
  isNewerVersion,
} from "./update.js";

const NEWS_SITE = "https://aidr.today";
const THUMB_MARK = new URL("../icons/thumb-mark.svg", import.meta.url).href;

const CATEGORY_VI = {
  Regulation: "Chính sách",
  Research: "Nghiên cứu",
  Releases: "Phát hành",
  Funding: "Gọi vốn",
  Legal: "Pháp lý",
  Industry: "Doanh nghiệp",
  Products: "Sản phẩm",
  Infra: "Hạ tầng",
  Agents: "Tác nhân",
  Chips: "Chip",
};

function $(id) {
  return document.getElementById(id);
}

function looksVietnamese(text) {
  return /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(
    text
  );
}

function categoryLabel(name, lang) {
  if (lang !== "vi") return name;
  return CATEGORY_VI[name] ?? name;
}

function timeAgo(epoch, lang) {
  const started = epoch > 1e12 ? Math.floor(epoch / 1000) : Math.floor(epoch);
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - started);
  if (lang === "vi") {
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  }
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function bulletsFor(tldr, language) {
  if (!tldr) return [];
  const vi = (tldr.bullets_vi || []).filter((b) => b.text);
  const en = (tldr.bullets_en || []).filter((b) => b.text);
  if (language === "en") return en.length ? en : vi;
  if (language === "both") {
    const rows = [];
    const n = Math.max(vi.length, en.length);
    for (let i = 0; i < n; i++) {
      if (vi[i]) rows.push(vi[i]);
      if (en[i] && en[i].text !== vi[i]?.text) rows.push(en[i]);
    }
    return rows;
  }
  const viUseful = vi.length >= 2 && vi.some((b) => looksVietnamese(b.text));
  return viUseful ? vi : en.length ? en : vi;
}

function paintTopic(el, tag) {
  const color = topicColor(tag);
  el.classList.add("topic-colored");
  el.style.setProperty("--tc-light", color.light);
  el.style.setProperty("--tc-dark", color.dark);
}

function itemMeta(digest, itemId) {
  return digest.items?.[itemId] || null;
}

function bulletTags(digest, bullet) {
  const ids = bullet.item_ids || [];
  const tags = [];
  for (const id of ids) {
    const meta = itemMeta(digest, id);
    if (meta?.tags) tags.push(...meta.tags);
  }
  return tags;
}

function bulletTopic(digest, bullet, segments) {
  const primaryId = bullet.item_ids?.[0];
  const meta = primaryId ? itemMeta(digest, primaryId) : null;
  if (meta?.tags?.[0]) return meta.tags[0];
  if (meta?.category) return meta.category;
  const highlighted = segments.find((s) => s.highlighted && s.tag);
  return highlighted?.tag || null;
}

function appendHighlighted(parent, text, tags) {
  const segments = highlightTitle(text, tagsForHighlight(tags));
  for (const segment of segments) {
    const span = document.createElement("span");
    span.textContent = segment.text;
    if (segment.highlighted && segment.tag) {
      span.className = "hl";
      paintTopic(span, segment.tag);
    } else if (segment.highlighted) {
      span.className = "hl";
    }
    parent.append(span);
  }
  return segments;
}

function thumbNode(src) {
  const img = document.createElement("img");
  img.className = "thumb";
  img.width = 48;
  img.height = 48;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.src = safeHttpUrl(src, THUMB_MARK) || THUMB_MARK;
  img.addEventListener("error", () => {
    if (img.src !== THUMB_MARK) img.src = THUMB_MARK;
  });
  return img;
}

function bulletHref(bullet) {
  const id = bullet.item_ids?.[0];
  if (id) return withExtRef(`${NEWS_SITE}/ai/${id}`, "tldr");
  return withExtRef(NEWS_SITE, "tldr_home");
}

function renderThumbRow(digest, bullet, n) {
  const row = document.createElement("li");
  const inner = document.createElement("span");
  inner.className = "bullet";

  const copy = document.createElement("span");
  copy.className = "bullet-copy";
  copy.title = bullet.text;

  const tags = bulletTags(digest, bullet);
  const segments = highlightTitle(bullet.text, tagsForHighlight(tags));
  const topic = bulletTopic(digest, bullet, segments);
  if (topic) {
    const tagEl = document.createElement("span");
    tagEl.className = "topic-tag";
    tagEl.textContent = topic;
    paintTopic(tagEl, topic);
    copy.append(tagEl);
  }

  const link = document.createElement("a");
  link.href = safeHttpUrl(bulletHref(bullet), NEWS_SITE);
  link.rel = "noreferrer";
  appendHighlighted(link, bullet.text, tags);
  copy.append(link);

  const extra = (bullet.item_ids || []).length - 1;
  if (extra > 0) {
    const more = document.createElement("span");
    more.className = "related";
    more.textContent = `+${extra}`;
    copy.append(more);
  }

  inner.append(copy, thumbNode(bullet.image_url));
  row.append(inner);
  row.dataset.n = String(n);
  return row;
}

function splitColumns(items) {
  const mid = Math.ceil(items.length / 2) || 1;
  return [items.slice(0, mid), items.slice(mid)];
}

let filterTag = null;
/** @type {Set<string>} */
let filterCategories = new Set();
let tldrExpanded = false;
let pushSettings = async () => {};

function formatDayHeading(date, lang) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function applyChrome(settings) {
  const lang = uiLang(settings);
  const tagline = $("brand-tagline");
  if (tagline) tagline.textContent = t(settings, "lede");
  const searchPh = t(settings, "search");
  for (const id of ["search", "search-compact"]) {
    const node = $(id);
    if (node) node.placeholder = searchPh;
  }
  $("submit-label").textContent = t(settings, "submit");
  $("trending-label").textContent = t(settings, "trending");
  for (const id of ["open-settings", "open-settings-compact"]) {
    const node = $(id);
    if (node) node.setAttribute("aria-label", t(settings, "prefsTitle"));
  }
  const phoneLang = $("phone-lang-label");
  if (phoneLang) {
    phoneLang.textContent = lang === "vi" ? "Ngôn ngữ" : "Language";
  }
  const chromeLink = $("chrome-tab-link");
  if (chromeLink) {
    const label = lang === "vi" ? "Tab mới Chrome" : "Chrome new tab";
    chromeLink.title = label;
    chromeLink.setAttribute("aria-label", label);
  }
  document.title = t(settings, "lede");
  for (const root of [$("lang-toggle"), $("lang-toggle-phone")]) {
    if (!root) continue;
    for (const btn of root.querySelectorAll("button")) {
      btn.setAttribute(
        "aria-pressed",
        btn.dataset.lang === lang ? "true" : "false"
      );
    }
  }
}

function renderFooter(_settings, digest) {
  const node = $("footer-copy");
  if (!node) return;
  const year = new Date().getFullYear();
  const stamp = digest.lastFetchedAt || digest.updatedAt;
  const updated = stamp ? ` · Updated ${timeAgo(stamp, "en")}` : "";
  node.textContent = `© ${year} Duyet · aidr.today${updated}`;
}

function setStatus(message, show) {
  const node = $("status");
  node.hidden = !show;
  node.textContent = message || "";
}

function setUpdateBanner(settings, meta) {
  const banner = $("update-banner");
  const text = $("update-text");
  if (!banner || !text) return;
  const remote = typeof meta?.version === "string" ? meta.version : "";
  const local = installedVersion();
  const store = isChromeWebStoreInstall(
    globalThis.chrome?.runtime?.getManifest?.()
  );
  if (store || !isNewerVersion(remote, local)) {
    banner.hidden = true;
    return;
  }
  text.textContent = t(settings, "updateAvailable");
  banner.hidden = false;
}

async function maybeOfferUnpackedUpdate(settings) {
  try {
    if (isChromeWebStoreInstall(globalThis.chrome?.runtime?.getManifest?.())) {
      return;
    }
    const meta = await fetchExtensionMeta(settings.apiBase);
    setUpdateBanner(settings, meta);
  } catch {
    // ignore — digest still works without the version endpoint
  }
}

function tldrShown(bullets, settings) {
  const cap = settings.tldrCount || 8;
  if (bullets.length <= 8) return bullets;
  if (tldrExpanded) return bullets.slice(0, Math.min(bullets.length, cap));
  return bullets.slice(0, 8);
}

function renderTldr(settings, digest) {
  const section = $("section-tldr");
  const cols = $("tldr-cols");
  const more = $("tldr-more");
  const counts = $("tldr-counts");
  cols.replaceChildren();
  counts.replaceChildren();
  if (!settings.sections.tldr) {
    section.hidden = true;
    return;
  }
  const bullets = bulletsFor(digest.tldr, settings.language);
  if (!bullets.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $("tldr-meta").textContent = digest.tldr?.date || t(settings, "tldrMeta");

  const options = [];
  if (bullets.length > 8) {
    options.push(8);
    options.push(Math.min(bullets.length, 12));
    if (bullets.length > 12) options.push(Math.min(bullets.length, 16));
  }
  counts.hidden = options.length === 0;
  for (const n of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(n);
    btn.setAttribute(
      "aria-pressed",
      (settings.tldrCount || 8) === n ||
        (n === bullets.length && (settings.tldrCount || 8) > n)
        ? "true"
        : "false"
    );
    btn.addEventListener("click", async () => {
      const nominal = n <= 8 ? 8 : n <= 12 ? 12 : 16;
      tldrExpanded = nominal > 8;
      await pushSettings({ ...settings, tldrCount: nominal });
    });
    counts.append(btn);
  }

  const shown = tldrShown(bullets, {
    ...settings,
    tldrCount: tldrExpanded ? settings.tldrCount || 8 : 8,
  });
  const columns = splitColumns(shown);
  columns.forEach((col, ci) => {
    if (!col.length) return;
    const list = document.createElement("ol");
    list.className = "tldr-list";
    list.start = ci === 0 ? 1 : columns[0].length + 1;
    col.forEach((bullet, i) => {
      list.append(
        renderThumbRow(
          digest,
          bullet,
          (ci === 0 ? 1 : columns[0].length + 1) + i
        )
      );
    });
    cols.append(list);
  });

  if (bullets.length > 8 && !tldrExpanded) {
    more.hidden = false;
    more.textContent = t(settings, "showMore");
    more.onclick = async () => {
      tldrExpanded = true;
      const next = bullets.length > 12 ? 16 : 12;
      await pushSettings({ ...settings, tldrCount: next });
    };
  } else if (tldrExpanded && bullets.length > 8) {
    more.hidden = false;
    more.textContent = t(settings, "showLess");
    more.onclick = async () => {
      tldrExpanded = false;
      await pushSettings({ ...settings, tldrCount: 8 });
    };
  } else {
    more.hidden = true;
  }

  const total = digest.totalStories || digest.stories.length;
  $("tldr-total").textContent = total
    ? `${total} ${t(settings, "storiesCount")}`
    : "";
  const stamp = digest.lastFetchedAt || digest.updatedAt;
  $("tldr-updated").textContent = stamp
    ? `${t(settings, "updated")} ${timeAgo(stamp, uiLang(settings))}`
    : "";
}

function renderChips(settings, digest) {
  const catSection = $("section-categories");
  const trendSection = $("section-trending");
  const trendRoot = $("trending");
  catSection.replaceChildren();
  trendRoot.replaceChildren();

  const showCats = settings.sections.categories && digest.categories.length > 0;
  if (!showCats) filterCategories = new Set();
  catSection.hidden = !showCats;
  if (showCats) {
    const lang = uiLang(settings);
    const all = document.createElement("button");
    all.type = "button";
    all.className = "chip";
    all.textContent = t(settings, "all");
    all.setAttribute(
      "aria-pressed",
      filterCategories.size === 0 ? "true" : "false"
    );
    all.addEventListener("click", () => {
      filterCategories = new Set();
      render(settings, digest);
    });
    catSection.append(all);
    for (const row of digest.categories) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      const selected = filterCategories.has(row.name);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
      btn.append(
        `${categoryLabel(row.name, lang)} `,
        Object.assign(document.createElement("span"), {
          className: "n",
          textContent: String(row.count),
        })
      );
      btn.addEventListener("click", () => {
        const next = new Set(filterCategories);
        if (next.has(row.name)) next.delete(row.name);
        else next.add(row.name);
        filterCategories = next;
        render(settings, digest);
      });
      catSection.append(btn);
    }
  }

  const showTrending = settings.sections.trending && digest.trending.length > 0;
  if (!showTrending) filterTag = null;
  trendSection.hidden = !showTrending;
  if (showTrending) {
    for (const row of digest.trending) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "trend-chip";
      paintTopic(btn, row.tag);
      btn.setAttribute(
        "aria-pressed",
        filterTag === row.tag ? "true" : "false"
      );
      btn.append(
        row.tag,
        Object.assign(document.createElement("span"), {
          className: "n",
          textContent: String(row.count),
        })
      );
      btn.addEventListener("click", () => {
        filterTag = filterTag === row.tag ? null : row.tag;
        render(settings, digest);
      });
      trendRoot.append(btn);
    }
  }
}

function storyMatchesFilters(story) {
  if (filterCategories.size > 0) {
    if (!story.category || !filterCategories.has(story.category)) return false;
  }
  if (filterTag) {
    const blob = `${story.title} ${story.title_vi || ""} ${(story.tags || []).join(" ")}`;
    if (!blob.toLowerCase().includes(filterTag.toLowerCase())) return false;
  }
  return true;
}

function filteredDays(digest) {
  const days = Array.isArray(digest.days) ? digest.days : [];
  if (!days.length && digest.stories?.length) {
    return [
      {
        date: "",
        items: digest.stories.filter(storyMatchesFilters),
        categoryCounts: {},
      },
    ].filter((d) => d.items.length);
  }
  return days
    .map((day) => {
      const items = day.items.filter(storyMatchesFilters);
      return {
        ...day,
        items,
        categoryCounts: items.reduce((acc, item) => {
          if (!item.category) return acc;
          acc[item.category] = (acc[item.category] || 0) + 1;
          return acc;
        }, {}),
      };
    })
    .filter((day) => day.items.length > 0);
}

function externalLinkIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("class", "ext-icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"
  );
  svg.append(path);
  return svg;
}

function hotIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("class", "hot-icon");
  svg.setAttribute("aria-hidden", "true");
  const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p1.setAttribute("d", "M3 17 9 11l4 4 8-8");
  const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p2.setAttribute("d", "M14 7h7v7");
  svg.append(p1, p2);
  return svg;
}

function renderStoryRow(settings, story, index, hot) {
  const lang = uiLang(settings);
  const { text: title, fallbackFromEnglish } = (() => {
    const vi = story.title_vi?.trim();
    if (settings.language === "en") {
      return { text: story.title, fallbackFromEnglish: false };
    }
    if (vi && (settings.language === "vi" || looksVietnamese(vi))) {
      return { text: vi, fallbackFromEnglish: false };
    }
    return {
      text: story.title,
      fallbackFromEnglish: settings.language !== "en" && Boolean(story.title),
    };
  })();

  const summary =
    lang === "vi" && story.summary_vi ? story.summary_vi : story.summary;
  const hasDetails =
    Boolean(summary) ||
    (story.tags || []).length > 0 ||
    (story.sources || []).length > 0;

  const row = document.createElement("div");
  row.className = "story-row";
  row.id = story.id ? `item-${story.id}` : undefined;

  const head = document.createElement("div");
  head.className = `story-head${hasDetails ? " story-head-expandable" : ""}`;

  const n = document.createElement("span");
  n.className = "story-n";
  n.textContent = String(index);

  const titleWrap = document.createElement("span");
  titleWrap.className = "story-title";
  if (hot) titleWrap.append(hotIcon());

  const article = document.createElement("a");
  article.className = "story-article";
  article.href =
    safeHttpUrl(
      withExtRef(`${NEWS_SITE}/ai/${story.id}`, "story"),
      withExtRef(NEWS_SITE, "story")
    ) || withExtRef(NEWS_SITE, "story");
  article.rel = "noreferrer";
  if (fallbackFromEnglish) article.lang = "en";
  appendHighlighted(article, title, story.tags || []);
  titleWrap.append(article);

  if (fallbackFromEnglish) {
    const badge = document.createElement("span");
    badge.className = "en-badge";
    badge.textContent = "EN";
    badge.title =
      lang === "vi"
        ? "Tiêu đề gốc tiếng Anh — chưa có bản dịch"
        : "Original English title — no Vietnamese translation yet";
    titleWrap.append(badge);
  }

  const ext = document.createElement("a");
  ext.className = "story-ext";
  // External publishers: do not stamp aidr utm onto third-party hosts.
  ext.href = safeHttpUrl(story.url, NEWS_SITE) || NEWS_SITE;
  ext.target = "_blank";
  ext.rel = "noopener noreferrer";
  ext.setAttribute("aria-label", "Open story link");
  ext.append(externalLinkIcon());
  titleWrap.append(document.createTextNode(" "), ext);

  const cat = document.createElement("span");
  cat.className = "story-cat";
  cat.textContent = story.category ? categoryLabel(story.category, lang) : "";

  const when = document.createElement("span");
  when.className = "story-when";
  when.textContent = story.published_at
    ? timeAgo(story.published_at, lang)
    : "";

  const score = document.createElement("span");
  score.className = "story-score";
  score.textContent = `${story.points || 0}/${story.comments || 0}`;

  head.append(n, titleWrap, cat, when, score);

  let detail = null;
  if (hasDetails) {
    detail = document.createElement("div");
    detail.className = "story-detail";
    detail.hidden = true;
    if (summary) {
      const p = document.createElement("p");
      p.className = "story-summary";
      p.textContent = summary;
      detail.append(p);
    }
    if ((story.tags || []).length) {
      const tags = document.createElement("div");
      tags.className = "story-tags";
      for (const tag of story.tags) {
        const chip = document.createElement("span");
        chip.className = "story-tag";
        chip.textContent = tag;
        paintTopic(chip, tag);
        tags.append(chip);
      }
      detail.append(tags);
    }
    head.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      detail.hidden = !detail.hidden;
      head.classList.toggle("is-expanded", !detail.hidden);
    });
  }

  row.append(head);
  if (detail) row.append(detail);
  return row;
}

function renderStories(settings, digest) {
  const root = $("section-stories");
  root.replaceChildren();
  if (!settings.sections.stories) {
    root.hidden = true;
    return;
  }

  const days = filteredDays(digest);
  if (!days.length) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const lang = uiLang(settings);

  for (const day of days) {
    const section = document.createElement("section");
    section.className = "day-section";

    const head = document.createElement("div");
    head.className = "day-head";

    const title = document.createElement("h2");
    title.textContent = day.date
      ? formatDayHeading(day.date, lang)
      : t(settings, "stories");

    const count = document.createElement("span");
    count.className = "day-count";
    const n = day.items.length;
    count.textContent =
      lang === "vi"
        ? `${n} ${t(settings, "tin")}`
        : `${n} ${n === 1 ? t(settings, "storyWordOne") : t(settings, "storyWord")}`;

    const cats = document.createElement("span");
    cats.className = "day-cats";
    const entries = Object.entries(day.categoryCounts || {}).sort(
      (a, b) => b[1] - a[1]
    );
    const shown = entries.slice(0, 7);
    const more = entries.length - shown.length;
    for (const [name, c] of shown) {
      const bit = document.createElement("span");
      bit.append(
        document.createTextNode(`${categoryLabel(name, lang)} `),
        Object.assign(document.createElement("strong"), {
          textContent: String(c),
        })
      );
      cats.append(bit);
    }
    if (more > 0) {
      const bit = document.createElement("span");
      bit.textContent = `+${more} ${t(settings, "footerMore")}`;
      cats.append(bit);
    }

    head.append(title, count, cats);
    section.append(head);

    const list = document.createElement("div");
    list.className = "day-list";
    day.items.forEach((story, i) => {
      const hot = i === 0 && story.rank_score > 0 && day.items.length > 1;
      list.append(renderStoryRow(settings, story, i + 1, hot));
    });
    section.append(list);
    root.append(section);
  }
}

function render(settings, digest) {
  applyChrome(settings);
  renderChips(settings, digest);
  renderTldr(settings, digest);
  renderStories(settings, digest);
  renderFooter(settings, digest);
}

function bindPrefs(getSettings, onChange) {
  const prefs = bindPrefsPopover({
    getSettings,
    onChange,
    triggers: [$("open-settings"), $("open-settings-compact")],
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      prefs.close();
      closePhoneMenu();
    }
  });
}

function closePhoneMenu() {
  const menu = $("phone-menu");
  const btn = $("open-menu");
  if (!menu) return;
  menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

function openPhoneMenu() {
  const menu = $("phone-menu");
  const btn = $("open-menu");
  if (!menu) return;
  menu.hidden = false;
  if (btn) btn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function bindPhoneMenu() {
  $("open-menu")?.addEventListener("click", openPhoneMenu);
  $("close-menu-backdrop")?.addEventListener("click", closePhoneMenu);
  $("phone-menu-nav")?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closePhoneMenu();
  });
}

function bindLangToggle(getSettings, onChange) {
  const handler = (event) => {
    const btn = event.target.closest("button[data-lang]");
    if (!btn) return;
    onChange({ ...getSettings(), language: btn.dataset.lang });
  };
  $("lang-toggle")?.addEventListener("click", handler);
  $("lang-toggle-phone")?.addEventListener("click", handler);
}

async function main() {
  let settings = await loadSettings();
  applyAppearance(settings);
  applyChrome(settings);
  tagSiteLinks(document);

  let digest = globalThis.__NEWS_TAB_DIGEST__ || {
    tldr: null,
    stories: [],
    days: [],
    categories: [],
    trending: [],
    items: {},
    totalStories: 0,
    lastFetchedAt: 0,
    updatedAt: 0,
  };

  const refresh = async (next) => {
    settings = next;
    applyAppearance(settings);
    render(settings, digest);
    if (globalThis.__NEWS_TAB_DIGEST__) return;
    try {
      const result = await fetchDigest(settings.apiBase);
      digest = result.digest;
      setStatus(t(settings, "cached"), result.stale);
      render(settings, digest);
      void maybeOfferUnpackedUpdate(settings);
    } catch {
      setStatus(t(settings, "error"), true);
    }
  };

  bindPrefs(() => settings, refresh);
  bindPhoneMenu();
  pushSettings = async (next) => {
    settings = await saveSettings(next);
    applyAppearance(settings);
    render(settings, digest);
  };
  bindLangToggle(
    () => settings,
    async (next) => {
      settings = await saveSettings(next);
      applyAppearance(settings);
      render(settings, digest);
    }
  );

  if (digest.tldr || digest.stories.length) {
    render(settings, digest);
    return;
  }

  try {
    const result = await fetchDigest(settings.apiBase);
    digest = result.digest;
    setStatus(t(settings, "cached"), result.stale);
    if (!digest.tldr && digest.stories.length === 0) {
      setStatus(t(settings, "empty"), true);
    }
    render(settings, digest);
  } catch {
    setStatus(t(settings, "error"), true);
  }
  void maybeOfferUnpackedUpdate(settings);
}

main();
