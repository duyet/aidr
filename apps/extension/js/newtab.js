import { digestPaintKey, fetchDigest, hydrateDigest } from "./api.js";
import { bindAidrDialogLink, openStoryDialogLazy } from "./dialog-link.js";
import {
  highlightKeywords,
  setLearnedKeywords,
  tagsForHighlight,
} from "./highlight.js";
import { t, uiLang } from "./i18n.js";
import { icon } from "./icons.js";
import { tagSiteLinks, withExtRef } from "./ref.js";
import {
  applyAppearance,
  loadSettings,
  safeHttpUrl,
  saveSettings,
  updateSettings,
} from "./settings.js";
import { bindPrefsPopover } from "./settings-panel.js";
import { TLDR_VIEW_ICONS, tldrRows } from "./shared/reader-view.js";
import { NEWS_SITE, storyPermalink } from "./site-url.js";
import { categoryColor, topicColor } from "./topic-color.js";
import { track, trackChannelClick } from "./track.js";
import {
  fetchExtensionMeta,
  installedVersion,
  isChromeWebStoreInstall,
  isNewerVersion,
} from "./update.js";
import { lastClosedEdition } from "./week.js";

/** Web-home copy the extension's i18n pack does not carry yet. Kept local so
 *  i18n.js stays owned by its own agent; the values mirror apps/web. */
const HOME_COPY = {
  vi: {
    today: "Hôm nay",
    weeks: "Tuần",
    calendar: "Lịch",
    previousDay: "Ngày trước",
    nextDay: "Ngày sau",
    everyMorning: "Bản tin mỗi sáng",
    subscribe: "Đăng ký",
    thisWeek: "Tuần này",
    editionCalendar: "Lịch số báo",
    rankedToday: "Tin xếp hạng hôm nay",
    readMore: "Đọc tiếp",
    readSource: "Đọc bài gốc",
    topStory: "Tin hàng đầu",
    storyPage: "Trang tin",
    email: "Email",
    showMore: "Xem thêm",
    showLess: "Thu gọn",
    emailBlurb: "Bản tin xếp hạng lúc 07:00 theo giờ của bạn. Miễn phí.",
    issue: "Số",
  },
  en: {
    today: "Today",
    weeks: "Weeks",
    calendar: "Calendar",
    previousDay: "Previous day",
    nextDay: "Next day",
    everyMorning: "Every morning",
    subscribe: "Subscribe",
    thisWeek: "This week",
    editionCalendar: "Edition calendar",
    rankedToday: "Ranked today",
    readMore: "Read more",
    readSource: "Read source",
    topStory: "Top story",
    storyPage: "Story page",
    email: "Email",
    showMore: "Show more",
    showLess: "Show less",
    emailBlurb: "The ranked edition at 07:00 your time. Free.",
    issue: "Issue",
  },
};

function homeCopy(settings, key) {
  const pack = HOME_COPY[uiLang(settings)] || HOME_COPY.vi;
  return pack[key] ?? HOME_COPY.vi[key] ?? key;
}

/** Bilingual is either the dedicated pref or the legacy "both" language. */
function isBilingual(settings) {
  return settings.bilingual === true || settings.language === "both";
}

function primaryLang(settings) {
  if (!isBilingual(settings)) return uiLang(settings);
  return settings.bilingualFirst === "en" ? "en" : "vi";
}

function secondaryLang(settings) {
  return primaryLang(settings) === "vi" ? "en" : "vi";
}

/** Leading language full size, the other in .bi-second — never a fallback. */
function setBiText(node, viText, enText, settings) {
  if (!node) return;
  const leading = primaryLang(settings);
  const first = leading === "vi" ? viText : enText;
  const second = leading === "vi" ? enText : viText;
  node.replaceChildren();
  if (first) node.append(document.createTextNode(first));
  if (isBilingual(settings) && second && second !== first) {
    const other = document.createElement("span");
    other.className = "bi-second";
    other.lang = leading === "vi" ? "en" : "vi";
    other.textContent = second;
    node.append(other);
  }
}

function localize(root, settings) {
  if (!root) return;
  for (const node of root.querySelectorAll("[data-vi][data-en]")) {
    setBiText(node, node.dataset.vi, node.dataset.en, settings);
  }
}

/** The calendar day before `date` (YYYY-MM-DD). */
function dayBefore(date) {
  if (!SNAPSHOT_DATE.test(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function $(id) {
  return document.getElementById(id);
}

function looksVietnamese(text) {
  return /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(
    text
  );
}

/** Categories are the site's own taxonomy and stay in English on both locales. */
function categoryLabel(name) {
  return name;
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

/** One language's bullets from its own column. No cross-language fallback:
 *  a missing language renders nothing in bilingual mode. */
function bulletsFor(tldr, language) {
  if (!tldr) return [];
  const key = language === "en" ? "bullets_en" : "bullets_vi";
  return (tldr[key] || []).filter((b) => b?.text);
}

/** The other language's text per leading bullet, matched by first story id. */
function secondBulletTexts(digest, settings) {
  if (!isBilingual(settings)) return null;
  const map = new Map();
  for (const bullet of bulletsFor(digest.tldr, secondaryLang(settings))) {
    const id = bullet.item_ids?.[0];
    if (id && !map.has(id)) map.set(id, bullet.text);
  }
  return map;
}

/** Title rows for a story, from each language's own column. In single-language
 *  VI the labelled English fallback is kept (the EN badge in the row). */
function ownTitles(story) {
  const viRaw = story.title_vi?.trim() || "";
  const vi = viRaw || (looksVietnamese(story.title) ? story.title : "") || null;
  const en = vi && story.title === vi ? null : story.title || null;
  return { vi, en };
}

function titleRows(story, settings) {
  const own = ownTitles(story);
  const leading = primaryLang(settings);
  if (!isBilingual(settings)) {
    if (leading === "vi" && !own.vi) {
      return [{ lang: "en", text: own.en || story.title, fallback: true }];
    }
    return [
      {
        lang: leading,
        text: leading === "vi" ? own.vi || story.title : own.en || story.title,
        fallback: false,
      },
    ];
  }
  const other = secondaryLang(settings);
  return [leading, other]
    .map((lang) => ({
      lang,
      text: lang === "vi" ? own.vi : own.en,
      fallback: false,
    }))
    .filter((row) => row.text);
}

function summaryRows(story, settings) {
  const own = {
    vi: story.summary_vi?.trim() || null,
    en: story.summary?.trim() || null,
  };
  const langs = isBilingual(settings)
    ? [primaryLang(settings), secondaryLang(settings)]
    : [primaryLang(settings)];
  return langs
    .map((lang) => ({ lang, text: own[lang] }))
    .filter((row) => row.text);
}

/** Sets the topic's color pair; `topic-colored` also colors the text. */
function paintTopic(node, tag, colored = true) {
  const color = topicColor(tag);
  if (colored) node.classList.add("topic-colored");
  node.style.setProperty("--tc-light", color.light);
  node.style.setProperty("--tc-dark", color.dark);
}

function paintCategory(el, name) {
  const color = categoryColor(name);
  el.style.setProperty("--tc-light", color.light);
  el.style.setProperty("--tc-dark", color.dark);
}

/** A node with a class and children; strings become text. */
function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((child) => child != null && child !== false));
  return node;
}

/** The feed's "7 giờ" / "7h": the relative time without its "ago". */
function shortTimeAgo(epoch, lang) {
  return timeAgo(epoch, lang).replace(/ (trước|ago)$/, "");
}

/** A category with its color on a dot and the name in the surrounding text
 *  (web CategoryLabel `quiet`); `selected` is the chip's high-contrast dot. */
function categoryLabelNode(name, selected = false) {
  const node = el(
    "span",
    "cat-label",
    el("span", `${selected ? "category-filter-dot" : "topic-dot"} cat-dot`),
    el("span", "", categoryLabel(name))
  );
  node.firstChild.setAttribute("aria-hidden", "true");
  paintCategory(node, name);
  return node;
}

/** Key words in a title: `kw-num` / `kw-entity` spans (the digest), or with
 *  `ink` every key word in the story's category color (rows and the lead). */
function appendKeywords(
  parent,
  text,
  tags,
  { ink = false, category = null } = {}
) {
  for (const segment of highlightKeywords(text, tagsForHighlight(tags))) {
    if (!segment.kind) {
      parent.append(document.createTextNode(segment.text));
      continue;
    }
    const span = el(
      "span",
      ink
        ? "topic-ink kw-ink"
        : segment.kind === "num"
          ? "kw-num"
          : "kw-entity",
      segment.text
    );
    if (ink && category) paintCategory(span, category);
    parent.append(span);
  }
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

/** The brand semicolon on the soft yellow ground, for a story with no usable
 *  picture (web StoryThumbTile). */
function thumbTile(extraClass = "") {
  const tile = el(
    "span",
    extraClass ? `thumb-tile ${extraClass}` : "thumb-tile",
    ";"
  );
  tile.setAttribute("aria-hidden", "true");
  return tile;
}

function thumbNode(src, extraClass = "") {
  const url = safeHttpUrl(src, "");
  if (!url) return thumbTile(extraClass);
  const img = document.createElement("img");
  img.className = extraClass ? `thumb ${extraClass}` : "thumb";
  img.width = 48;
  img.height = 48;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = url;
  img.addEventListener("error", () => img.replaceWith(thumbTile(extraClass)));
  return img;
}

function storyHref(story, lang) {
  return (
    story?.permalink ||
    storyPermalink(String(story?.id || "").slice(0, 8), lang)
  );
}

function bulletHref(digest, bullet, lang) {
  const id = bullet.item_ids?.[0];
  if (!id) return withExtRef(NEWS_SITE, "tldr_home", lang);
  const story = digest?.items?.[id];
  return withExtRef(
    storyHref(story || { id, permalink: "" }, lang),
    "tldr",
    lang
  );
}

/** One AI;DR bullet: a row-major list item, rank | text | thumb (web
 *  TldrBulletList + TldrBulletRow, layout A). */
function renderThumbRow(settings, digest, bullet, n, secondText) {
  const lang = primaryLang(settings);
  const primaryId = bullet.item_ids?.[0];
  const meta = primaryId ? itemMeta(digest, primaryId) : null;
  const topic = meta?.tags?.[0] ?? meta?.category ?? null;
  const color = topic
    ? meta?.tags?.length
      ? topicColor(topic)
      : categoryColor(topic)
    : null;
  const tags = bulletTags(digest, bullet);

  const row = el("li", "tldr-item");
  row.dataset.n = String(n);
  if (secondText) row.dataset.bilingual = "true";
  if (color) {
    row.style.setProperty("--tc-light", color.light);
    row.style.setProperty("--tc-dark", color.dark);
  }

  const text = el("span", "bullet-copy");
  text.title = bullet.text;
  if (topic) {
    const tag = el("span", "topic-tag", el("span", "topic-dot"), topic);
    tag.firstChild.setAttribute("aria-hidden", "true");
    text.append(tag);
  }
  appendKeywords(text, bullet.text, tags);
  const extra = (bullet.item_ids || []).length - 1;
  if (extra > 0) text.append(el("span", "related", `+${extra}`));

  const rank = el(
    "span",
    n === 1 ? "tldr-rank is-first" : "tldr-rank",
    String(n).padStart(2, "0")
  );
  const copy = el("span", "bullet", text);
  if (secondText) {
    const other = el("span", "bi-second", secondText);
    other.lang = secondaryLang(settings);
    copy.append(other);
  }
  const inner = el(
    "span",
    "tldr-row",
    el("span", "tldr-rank-cell", rank),
    copy,
    thumbNode(bullet.image_url)
  );
  rank.parentElement.setAttribute("aria-hidden", "true");

  if (!primaryId) {
    row.append(inner);
    return row;
  }
  const link = el("a", "tldr-link", inner);
  link.href = safeHttpUrl(
    bulletHref(digest, bullet, lang),
    storyPermalink("", lang)
  );
  link.rel = "noreferrer";
  bindAidrDialogLink(link, () =>
    openStoryDialogLazy({
      apiBase: settings.apiBase,
      language: lang,
      itemId: primaryId,
      relatedIds: (bullet.item_ids || []).slice(1),
      digest,
      permalink: link.href,
      bilingual: settings.bilingualDialog,
    })
  );
  row.append(link);
  return row;
}

let filterTag = null;
/** @type {Set<string>} */
let filterCategories = new Set();
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
  const introBtn = $("intro-video-btn");
  if (introBtn) {
    const label = t(settings, "introOpen");
    introBtn.title = label;
    introBtn.setAttribute("aria-label", label);
  }
  const introMenu = $("phone-intro-label");
  if (introMenu) introMenu.textContent = t(settings, "introMenu");
  const introTitle = t(settings, "introTitle");
  const introHeading = $("intro-dialog-title");
  if (introHeading) introHeading.textContent = introTitle;
  const introFrame = $("intro-dialog-frame");
  if (introFrame) introFrame.title = introTitle;
  for (const id of ["open-settings", "open-settings-compact"]) {
    const node = $(id);
    if (node) node.setAttribute("aria-label", t(settings, "prefsTitle"));
  }
  const phoneLang = $("phone-lang-label");
  if (phoneLang) {
    phoneLang.textContent = lang === "vi" ? "Ngôn ngữ" : "Language";
  }
  const reloadBtn = $("tldr-reload");
  if (reloadBtn) {
    const label = t(settings, "refresh");
    reloadBtn.title = label;
    reloadBtn.setAttribute("aria-label", label);
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
  // New web-home chrome: section nav, rail and footer carry both languages.
  localize(document.querySelector(".home-rail"), settings);
  localize($("home-sections"), settings);
  localize(document.querySelector(".site-footer"), settings);
  const layoutSwitch = $("layout-switch");
  if (layoutSwitch) {
    for (const btn of layoutSwitch.querySelectorAll("button[data-layout]")) {
      btn.setAttribute(
        "aria-pressed",
        btn.dataset.layout === (settings.layout || "compact") ? "true" : "false"
      );
    }
  }
}

function renderFooter(settings, digest) {
  const footer = document.querySelector(".site-footer");
  if (!footer) return;
  footer.hidden = !settings.showFooter;
  const telegram = $("footer-telegram");
  if (telegram) {
    telegram.href =
      primaryLang(settings) === "vi"
        ? "https://t.me/aihomnay"
        : "https://t.me/aidr_today";
  }
  const node = $("footer-copy");
  if (!node) return;
  node.replaceChildren(`© ${new Date().getFullYear()} AI;DR`);
  const stamp = digest.lastFetchedAt || digest.updatedAt;
  if (!stamp) return;
  const label = el("span", "");
  setBiText(
    label,
    `Cập nhật ${timeAgo(stamp, "vi")}`,
    `Updated ${timeAgo(stamp, "en")}`,
    settings
  );
  const link = el("a", "", label);
  link.href = withExtRef(
    "https://aidr.today/data?tab=runs",
    "footer",
    primaryLang(settings)
  );
  node.append(" · ", link);
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
    const meta = await fetchExtensionMeta(settings.apiBase, uiLang(settings));
    setUpdateBanner(settings, meta);
  } catch {
    // ignore — digest still works without the version endpoint
  }
}

const SNAPSHOT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const INTRO_VIDEO_ID = "tynoWx03zDc";

function dayOgDateParts(date, lang) {
  if (!SNAPSHOT_DATE.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const locale = lang === "vi" ? "vi-VN" : "en-US";
  const fmt = (options) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(
      parsed
    );
  return {
    day: date.slice(8, 10),
    weekday: fmt({ weekday: "long" }).toUpperCase(),
    monthYear:
      lang === "vi"
        ? `THÁNG ${Number(date.slice(5, 7))} ${date.slice(0, 4)}`
        : fmt({ month: "long", year: "numeric" }).toUpperCase(),
  };
}

function dayPageUrl(date, lang) {
  return withExtRef(`https://aidr.today/date/${date}`, "day", lang);
}

function dayCardImageUrl(date, lang) {
  const url = new URL(`https://aidr.today/api/og/date/${date}.png`);
  url.searchParams.set("lang", lang);
  return url.toString();
}

function renderTldrMasthead(settings, date) {
  const title = $("tldr-title");
  const section = $("section-tldr");
  if (!title || !section) return;
  const lang = uiLang(settings);
  const parts = dayOgDateParts(date, lang);
  title.replaceChildren();
  if (!parts) {
    delete section.dataset.snapshotDate;
    const heading = document.createElement("h2");
    heading.textContent = "AI;DR";
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.id = "tldr-meta";
    meta.textContent = t(settings, "tldrMeta");
    title.append(heading, meta);
    syncDayCard(settings, "");
    return;
  }
  section.dataset.snapshotDate = date;
  const link = el("a", "tldr-date");
  link.href = dayPageUrl(date, lang);
  link.append(`${parts.weekday} · ${parts.monthYear}`);
  if (isBilingual(settings)) {
    const other = dayOgDateParts(date, secondaryLang(settings));
    if (other) {
      const second = el(
        "span",
        "bi-second",
        `${other.weekday} · ${other.monthYear}`
      );
      second.lang = secondaryLang(settings);
      link.append(second);
    }
  }
  const brand = el("span", "tldr-brand", el("span", "signal-dot"), "AI;DR");
  brand.firstChild.setAttribute("aria-hidden", "true");
  title.append(
    el("span", "tldr-day", parts.day),
    el("span", "tldr-date-block", brand, link)
  );
  syncDayCard(settings, date);
}

/** Image | 2 rows | 3 rows masthead switch (web TldrViewSwitch). 2 rows is default. */
let dayCardImageOn = false;
/** The rows view behind (or instead of) the day card: "rows2" or "rows3". */
let tldrView = "rows2";

const DAY_CARD_BUTTONS = {
  image: "day-card-image",
  rows2: "day-card-rows2",
  rows3: "day-card-rows3",
};

/** Lucide glyph as inline SVG from the shared icon data. */
function viewIcon(view) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })) {
    svg.setAttribute(key, value);
  }
  for (const [tag, attrs] of TLDR_VIEW_ICONS[view]) {
    const shape = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) {
      shape.setAttribute(key, value);
    }
    svg.append(shape);
  }
  return svg;
}

function syncDayCard(settings, date) {
  const view = $("day-card-switch");
  const buttons = Object.entries(DAY_CARD_BUTTONS).map(([v, id]) => [v, $(id)]);
  if (!view || buttons.some(([, btn]) => !btn)) return;
  const lang = uiLang(settings);
  const parts = dayOgDateParts(date, lang);
  if (!parts) {
    view.hidden = true;
    delete view.dataset.og;
    dayCardImageOn = false;
    applyDayCardView();
    return;
  }
  view.hidden = false;
  view.dataset.og = dayCardImageUrl(date, lang);
  view.setAttribute("aria-label", lang === "vi" ? "Kiểu hiển thị" : "View");
  const labels = {
    image: lang === "vi" ? "Xem ảnh tóm tắt" : "Show day card",
    rows2: lang === "vi" ? "Chữ, 2 dòng mỗi tin" : "2 rows",
    rows3: lang === "vi" ? "Chữ, 3 dòng mỗi tin" : "3 rows",
  };
  for (const [v, btn] of buttons) {
    btn.setAttribute("aria-label", labels[v]);
    btn.title = labels[v];
    if (!btn.firstElementChild) btn.append(viewIcon(v));
  }
  const img = $("day-card-img");
  if (img) {
    img.alt =
      lang === "vi"
        ? `Ảnh tóm tắt AI;DR ngày ${date}`
        : `AI;DR card for ${date}`;
    if (img.dataset.og && img.dataset.og !== view.dataset.og) {
      img.removeAttribute("src");
      delete img.dataset.og;
    }
  }
  applyDayCardView();
}

function armDayCardImage() {
  const src = $("day-card-switch")?.dataset.og;
  const img = $("day-card-img");
  if (!src || !img || img.dataset.og === src) return;
  img.dataset.og = src;
  img.src = src;
}

function applyDayCardView() {
  const open = dayCardImageOn;
  if (open) armDayCardImage();
  $("day-card-overlay")?.classList.toggle("is-open", open);
  $("day-card-overlay")?.setAttribute("aria-hidden", open ? "false" : "true");
  const current = open ? "image" : tldrView;
  for (const [v, id] of Object.entries(DAY_CARD_BUTTONS)) {
    $(id)?.setAttribute("aria-pressed", v === current ? "true" : "false");
  }
  const list = $("tldr-cols");
  if (list) list.dataset.rows = String(tldrRows(tldrView));
  // The overlay lets pointer events through; keep clicks and tab focus off
  // the covered bullets, more/less button and footer while the card shows.
  for (const covered of [
    $("tldr-cols"),
    $("tldr-more"),
    document.querySelector(".tldr-foot"),
  ]) {
    if (!covered) continue;
    covered.toggleAttribute("inert", open);
    if (open) covered.setAttribute("aria-hidden", "true");
    else covered.removeAttribute("aria-hidden");
  }
}

let dayCardArmed = false;

function bindDayCard(onViewChange) {
  const buttons = Object.entries(DAY_CARD_BUTTONS).map(([v, id]) => [v, $(id)]);
  if (buttons.some(([, btn]) => !btn)) return;
  for (const [view, btn] of buttons) {
    btn.addEventListener("click", () => {
      dayCardImageOn = view === "image";
      if (view !== "image") tldrView = view;
      applyDayCardView();
      onViewChange?.(view);
    });
  }
  if (!dayCardArmed) {
    dayCardArmed = true;
    setTimeout(armDayCardImage, 2000);
  }
}

function introEmbedUrl(id) {
  const params = new URLSearchParams({
    autoplay: "1",
    controls: "0",
    modestbranding: "1",
    showinfo: "0",
    fs: "0",
    rel: "0",
    iv_load_policy: "3",
    disablekb: "1",
    playsinline: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`;
}

function openIntroVideo() {
  const dialog = $("intro-dialog");
  const frame = $("intro-dialog-frame");
  if (!dialog || !frame) return;
  closePhoneMenu();
  frame.src = introEmbedUrl(INTRO_VIDEO_ID);
  dialog.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeIntroVideo() {
  const dialog = $("intro-dialog");
  const frame = $("intro-dialog-frame");
  if (!dialog || dialog.hidden) return;
  dialog.hidden = true;
  frame?.removeAttribute("src");
  if ($("phone-menu")?.hidden !== false) document.body.style.overflow = "";
}

function bindIntroVideo() {
  $("intro-video-btn")?.addEventListener("click", openIntroVideo);
  $("phone-intro-video")?.addEventListener("click", openIntroVideo);
  $("intro-dialog-backdrop")?.addEventListener("click", closeIntroVideo);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeIntroVideo();
  });
}

/** The 8 | 12 | 16 picker, as in apps/web/src/lib/tldr-links. */
function tldrCountOptions(bulletCount) {
  const options = [];
  if (bulletCount > 8) {
    options.push({ effective: 8, nominal: 8 });
    const cap12 = Math.min(bulletCount, 12);
    options.push({ effective: cap12, nominal: 12 });
    if (bulletCount > 12) {
      const cap16 = Math.min(bulletCount, 16);
      if (cap16 !== cap12) options.push({ effective: cap16, nominal: 16 });
    }
  }
  return options;
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
  const bullets = bulletsFor(digest.tldr, primaryLang(settings));
  const secondTexts = secondBulletTexts(digest, settings);
  if (!bullets.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  // The persisted tldrView pref decides the opening view (2 rows by default);
  // the buttons below only change that pref.
  if (settings.tldrView !== "image") tldrView = settings.tldrView;
  dayCardImageOn = settings.tldrView === "image" && Boolean(digest.tldr?.date);
  renderTldrMasthead(settings, digest.tldr?.date || "");

  const options = tldrCountOptions(bullets.length);
  const wanted = settings.tldrCount || 8;
  let selectedIndex = options.findIndex((o) => o.nominal === wanted);
  if (selectedIndex < 0) selectedIndex = options.length - 1;
  const selected = options[selectedIndex];
  counts.hidden = options.length === 0;
  for (const option of options) {
    const btn = el("button", "", String(option.effective));
    btn.type = "button";
    btn.setAttribute("aria-pressed", option === selected ? "true" : "false");
    btn.addEventListener("click", async () => {
      await pushSettings({ ...settings, tldrCount: option.nominal });
    });
    counts.append(btn);
  }

  const shown = bullets.slice(
    0,
    selected ? selected.effective : bullets.length
  );
  shown.forEach((bullet, i) => {
    const primaryId = bullet.item_ids?.[0];
    cols.append(
      renderThumbRow(
        settings,
        digest,
        bullet,
        i + 1,
        secondTexts && primaryId ? secondTexts.get(primaryId) : null
      )
    );
  });

  const next = options[selectedIndex + 1];
  const showAll = (nominal) => async () => {
    await pushSettings({ ...settings, tldrCount: nominal });
  };
  if (next || selectedIndex > 0) {
    const label = next ? "showMore" : "showLess";
    const text = el("span", "");
    setBiText(
      text,
      homeCopy({ ...settings, language: "vi", bilingual: false }, label),
      homeCopy({ ...settings, language: "en", bilingual: false }, label),
      settings
    );
    more.hidden = false;
    more.replaceChildren(text, icon(next ? "chevron-down" : "chevron-up"));
    more.onclick = showAll(next ? next.nominal : options[0].nominal);
  } else {
    more.hidden = true;
  }

  const total = digest.totalStories || digest.stories.length;
  $("tldr-total").textContent = total
    ? `${total} ${t(settings, "storiesCount")}`
    : "";
  const stamp = digest.lastFetchedAt || digest.updatedAt;
  const updated = $("tldr-updated");
  const dot = el("span", "signal-dot");
  dot.setAttribute("aria-hidden", "true");
  updated.replaceChildren(
    ...(stamp
      ? [dot, `${t(settings, "updated")} ${timeAgo(stamp, uiLang(settings))}`]
      : [])
  );
}

function clearSectionContent(sectionEl) {
  sectionEl.replaceChildren();
}

const TRENDING_LIMIT = 8;

/** Wheel-to-sideways scroll and the edge fades on a chip row (web
 *  useHorizontalScroll): 24px on the side that still has content to scroll to. */
function bindEdgeFade(row) {
  if (!row || row.dataset.fadeBound) return;
  row.dataset.fadeBound = "true";
  let frame = 0;
  const update = () => {
    frame = 0;
    const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    row.style.setProperty("--fade-l", row.scrollLeft > 0 ? "24px" : "0px");
    row.style.setProperty("--fade-r", right ? "24px" : "0px");
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  row.addEventListener(
    "wheel",
    (event) => {
      if (event.deltaY && !event.deltaX) {
        row.scrollLeft += event.deltaY;
        event.preventDefault();
        schedule();
      }
    },
    { passive: false }
  );
  row.addEventListener("scroll", schedule, { passive: true });
  new ResizeObserver(update).observe(row);
  update();
}

function renderChips(settings, digest) {
  const catSection = $("section-categories");
  const trendSection = $("section-trending");
  const trendRoot = $("trending");
  clearSectionContent(catSection);
  trendRoot.replaceChildren();

  const showCats = settings.sections.categories && digest.categories.length > 0;
  if (!showCats) filterCategories = new Set();
  catSection.hidden = !showCats;
  if (showCats) {
    const all = el("button", "chip");
    all.type = "button";
    const allLabel = el("span", "");
    setBiText(allLabel, "Tất cả", "All", settings);
    all.append(
      allLabel,
      el(
        "span",
        "chip-count",
        String(digest.categories.reduce((sum, row) => sum + row.count, 0))
      )
    );
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
      const selected = filterCategories.has(row.name);
      const btn = el(
        "button",
        "chip",
        categoryLabelNode(row.name, selected),
        el("span", "chip-count", String(row.count))
      );
      btn.type = "button";
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
      btn.addEventListener("click", () => {
        const next = new Set(filterCategories);
        if (next.has(row.name)) next.delete(row.name);
        else next.add(row.name);
        filterCategories = next;
        render(settings, digest);
      });
      catSection.append(btn);
    }
    bindEdgeFade(catSection);
  }

  const showTrending = settings.sections.trending && digest.trending.length > 0;
  if (!showTrending) filterTag = null;
  trendSection.hidden = !showTrending;
  if (showTrending) {
    // A selected tag past the cut stays listed, so it can be cleared.
    const rows = digest.trending.filter(
      (row, i) => i < TRENDING_LIMIT || row.tag === filterTag
    );
    for (const row of rows) {
      const dot = el("span", "topic-dot trend-dot");
      dot.setAttribute("aria-hidden", "true");
      const btn = el(
        "button",
        "trend-chip",
        el("span", "trend-main", dot, el("span", "topic-ink", row.tag)),
        el("span", "topic-muted", String(row.count))
      );
      btn.type = "button";
      paintTopic(btn, row.tag, false);
      btn.setAttribute(
        "aria-pressed",
        filterTag === row.tag ? "true" : "false"
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
  return true;
}

/** Whether a story carries the selected trending tag (web StoryRow isMatch):
 *  the tag picks rows out with a tint, it does not filter the feed. */
function matchesSelectedTag(story) {
  if (!filterTag) return false;
  const tag = filterTag.toLowerCase();
  return (
    (story.tags || []).some((t) => t.toLowerCase() === tag) ||
    story.title.toLowerCase().includes(tag) ||
    (story.title_vi?.toLowerCase().includes(tag) ?? false)
  );
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

function renderStoryRow(settings, story, index, hot, showVotes) {
  const lang = primaryLang(settings);
  const titles = titleRows(story, settings);
  const mainTitle = titles[0] || {
    text: story.title,
    lang: "en",
    fallback: false,
  };
  const secondTitle = titles[1] || null;
  const { text: title, fallback: fallbackFromEnglish } = mainTitle;
  const summaries = summaryRows(story, settings);
  const mainSummary = summaries[0] || null;
  const secondSummary = summaries[1] || null;
  const hasDetails =
    Boolean(mainSummary) ||
    (story.tags || []).length > 0 ||
    (story.sources || []).length > 0;

  const row = document.createElement("div");
  row.className = index <= 3 ? "story-row story-row-top" : "story-row";
  row.id = story.id ? `item-${story.id}` : undefined;

  const head = document.createElement("div");
  head.className = `story-head${hasDetails ? " story-head-expandable" : ""}`;

  // Rank sits on the first title line; the expand chevron shares its column
  // and is revealed on hover/focus or while expanded (see the toggle below).
  const n = el("span", "story-n story-rank");
  let chevron = null;
  if (hasDetails) {
    chevron = el("span", "story-rank-chevron", icon("chevron-down"));
    chevron.setAttribute("aria-hidden", "true");
    chevron.setAttribute("data-testid", "story-row-chevron");
    chevron.setAttribute("data-expanded", "false");
    chevron.hidden = true;
    n.append(chevron);
  }
  n.append(document.createTextNode(String(index)));

  const titleLine = el("span", "story-title-line");
  if (hot) {
    const hotMark = icon("trending-up", "hot-icon");
    hotMark.setAttribute("role", "img");
    hotMark.setAttribute(
      "aria-label",
      lang === "vi" ? "Tin hàng đầu hôm nay" : "Top story today"
    );
    hotMark.removeAttribute("aria-hidden");
    titleLine.append(hotMark);
  }
  const article = document.createElement("a");
  article.className = "story-article";
  article.href =
    safeHttpUrl(
      withExtRef(storyHref(story, lang), "story", lang),
      withExtRef(NEWS_SITE, "story", lang)
    ) || withExtRef(NEWS_SITE, "story", lang);
  article.rel = "noreferrer";
  if (fallbackFromEnglish) article.lang = "en";
  appendKeywords(article, title, story.tags || [], {
    ink: true,
    category: story.category,
  });
  if (story.id) {
    bindAidrDialogLink(article, () =>
      openStoryDialogLazy({
        apiBase: settings.apiBase,
        language: lang,
        itemId: story.id,
        digest: { items: { [story.id]: story } },
        permalink: article.href,
        bilingual: settings.bilingualDialog,
      })
    );
  }
  titleLine.append(article);
  if (fallbackFromEnglish) {
    const badge = el("span", "en-badge", "EN");
    badge.title =
      lang === "vi"
        ? "Tiêu đề gốc tiếng Anh — chưa có bản dịch"
        : "Original English title — no Vietnamese translation yet";
    titleLine.append(badge);
  }
  const titleWrap = el("span", "story-title", titleLine);
  if (matchesSelectedTag(story)) {
    const color = topicColor(filterTag);
    head.classList.add("topic-hl-row");
    head.style.setProperty("--tc-light", color.light);
    head.style.setProperty("--tc-dark", color.dark);
    titleWrap.classList.add("topic-colored");
  }
  if (secondTitle) {
    const other = el("span", "bi-second", secondTitle.text);
    other.lang = secondTitle.lang;
    titleWrap.append(other);
  }

  // Small source line: category dot and name, publisher, then the time.
  const meta = el("span", "story-meta");
  if (showVotes && settings.votes) meta.append(renderVotes(settings, story));
  if (story.category) meta.append(categoryLabelNode(story.category));
  const host = story.url ? publisherHost(story.url) : null;
  if (host) {
    const publisher = el("a", "story-publisher", host);
    publisher.href = safeHttpUrl(story.url, NEWS_SITE) || NEWS_SITE;
    publisher.target = "_blank";
    publisher.rel = "noopener noreferrer";
    meta.append(el("span", "story-sep", "·"), publisher);
  }
  if (story.published_at) {
    meta.append(
      el("span", "story-sep", "·"),
      el("span", "story-when", shortTimeAgo(story.published_at, lang))
    );
  }
  for (const sep of meta.querySelectorAll(".story-sep")) {
    sep.setAttribute("aria-hidden", "true");
  }

  // One column holds the title, the optional summary line and the metadata,
  // so the rank shares only the first title line (web StoryRow.story-body).
  const body = el("span", "story-body", titleWrap);
  if (mainSummary) {
    const summaryEl = el("span", "row-summary np-justify", mainSummary.text);
    summaryEl.lang = mainSummary.lang;
    body.append(summaryEl);
  }
  if (secondSummary) {
    const other = el(
      "span",
      "bi-second row-summary np-justify",
      secondSummary.text
    );
    other.lang = secondSummary.lang;
    body.append(other);
  }
  body.append(meta);
  head.append(
    n,
    body,
    el("span", "row-thumb", thumbNode(story.image_url, "row-thumb-img"))
  );
  let detail = null;
  if (hasDetails) {
    detail = document.createElement("div");
    detail.className = "story-detail";
    detail.hidden = true;
    if (mainSummary) {
      const p = document.createElement("p");
      p.className = "story-summary np-justify";
      p.textContent = mainSummary.text;
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
    const sources = story.sources || [];
    if (sources.length) {
      const list = document.createElement("div");
      list.className = "story-sources";
      for (const source of sources) {
        const row = document.createElement("div");
        row.className = "story-source";
        const kind = document.createElement("span");
        kind.className = "story-source-kind";
        kind.textContent = (source.kind || "source").toUpperCase();
        row.append(kind);
        if (source.author) {
          const author = document.createElement("span");
          author.className = "story-source-author";
          author.textContent = source.author;
          row.append(author);
        }
        if (source.url) {
          const a = document.createElement("a");
          a.className = "story-source-host";
          a.href = safeHttpUrl(source.url, NEWS_SITE) || NEWS_SITE;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          try {
            a.textContent = new URL(a.href).hostname.replace(/^www\./, "");
          } catch {
            a.textContent = source.url;
          }
          row.append(a);
        }
        list.append(row);
      }
      detail.append(list);
    }
    head.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      detail.hidden = !detail.hidden;
      head.classList.toggle("is-expanded", !detail.hidden);
      if (chevron) {
        chevron.hidden = detail.hidden;
        chevron.setAttribute("data-expanded", detail.hidden ? "false" : "true");
      }
    });
    if (chevron) {
      const reveal = () => {
        if (!detail.hidden) return;
        chevron.hidden = false;
      };
      const conceal = () => {
        if (detail.hidden) chevron.hidden = true;
      };
      head.addEventListener("mouseenter", reveal);
      head.addEventListener("mouseleave", conceal);
      head.addEventListener("focusin", reveal);
      head.addEventListener("focusout", (event) => {
        if (!head.contains(event.relatedTarget)) conceal();
      });
    }
  }

  row.append(head);
  if (detail) row.append(detail);
  return row;
}

function publisherHost(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function renderVotes(settings, story) {
  const lang = uiLang(settings);
  const net = typeof story.vote_net === "number" ? story.vote_net : 0;
  const wrap = document.createElement("span");
  wrap.className = "story-votes";
  const label = lang === "vi" ? "Đăng nhập để bình chọn" : "Sign in to vote";
  const href = withExtRef("https://aidr.today/sign-in", "vote", lang);
  const link = () => {
    const anchor = document.createElement("a");
    anchor.className = "story-vote";
    anchor.href = href;
    anchor.title = label;
    anchor.setAttribute("aria-label", label);
    return anchor;
  };
  const up = link();
  up.append(icon("chevron-up"));
  const down = link();
  down.append(icon("chevron-down"));
  const count = document.createElement("span");
  count.className = "story-vote-net";
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = lang === "vi" ? "Tổng phiếu " : "Reader votes ";
  count.append(sr, document.createTextNode(String(net)));
  wrap.append(up, count, down);
  return wrap;
}

/** Web LeadStory: the day's top story above the ranked list. */
/** Web LeadStory: the day's top story above the ranked list. */
function renderLeadStory(settings, story) {
  const lang = primaryLang(settings);
  const article = el("article", "lead-story");
  article.setAttribute("aria-label", homeCopy(settings, "topStory"));

  const body = el("div", "lead-story-body");

  const kicker = el("p", "lead-story-kicker");
  if (story.category) kicker.append(categoryLabelNode(story.category));
  if (story.published_at) {
    kicker.append(
      el("span", "", "·"),
      el("span", "", timeAgo(story.published_at, lang))
    );
    kicker.children[kicker.children.length - 2].setAttribute(
      "aria-hidden",
      "true"
    );
  }
  body.append(kicker);

  const titles = titleRows(story, settings);
  const main = titles[0] || {
    text: story.title,
    lang: "en",
    fallback: false,
  };
  const link = el("a");
  link.href = storyHref(story, lang);
  if (main.fallback) link.lang = "en";
  appendKeywords(link, main.text, story.tags || [], {
    ink: true,
    category: story.category,
  });
  if (story.id) {
    bindAidrDialogLink(link, () =>
      openStoryDialogLazy({
        apiBase: settings.apiBase,
        language: lang,
        itemId: story.id,
        digest: { items: { [story.id]: story } },
        permalink: link.href,
        bilingual: settings.bilingualDialog,
      })
    );
  }
  body.append(el("h3", "lead-title lead-story-title", link));
  if (titles[1]) {
    const second = el("p", "bi-second", titles[1].text);
    second.lang = titles[1].lang;
    body.append(second);
  }

  // The site's payload carries no summary on first paint; it shows one when
  // the reader asked for summaries (or the newspaper layout, which prints them).
  if (settings.summaries || settings.layout === "newspaper") {
    const summaries = summaryRows(story, settings);
    if (summaries[0]) {
      const summary = el(
        "p",
        "lead-story-summary np-justify",
        summaries[0].text
      );
      summary.lang = summaries[0].lang;
      body.append(summary);
    }
    if (summaries[1]) {
      const second = el(
        "p",
        "bi-second lead-story-summary np-justify",
        summaries[1].text
      );
      second.lang = summaries[1].lang;
      body.append(second);
    }
  }

  const actions = el("div", "lead-story-actions");
  const more = el(
    "a",
    "btn-primary",
    homeCopy(settings, "readMore"),
    icon("arrow-right")
  );
  more.href = storyHref(story, lang);
  actions.append(more);
  if (story.url) {
    const source = el(
      "a",
      "btn-link",
      homeCopy(settings, "readSource"),
      icon("external-link")
    );
    source.href = safeHttpUrl(story.url, NEWS_SITE) || NEWS_SITE;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    actions.append(source);
    const host = publisherHost(source.href);
    if (host) actions.append(el("span", "lead-story-source", host));
  }
  body.append(actions);

  // No publisher picture: the story's own card, as the site does.
  const picture =
    story.image_url ||
    (story.id
      ? `${NEWS_SITE}/api/og/${story.id}.png?lang=${lang === "en" ? "en" : "vi"}`
      : "");
  article.append(
    body,
    el("div", "lead-story-media", thumbNode(picture, "lead-thumb"))
  );
  return article;
}

/** Stories a day section lists before its "Load more" button. */
const DAY_STORY_LIMIT = 30;

/** Whether any story carries a vote; a column of zeros says nothing. */
function anyVotes(items) {
  return items.some((story) => (story.vote_net ?? 0) > 0);
}

function renderDaySection(settings, day, { fromLead, showVotes }) {
  const lang = primaryLang(settings);
  const items = fromLead ? day.items.slice(1) : day.items;
  const section = el("section", "day-section");
  const head = el("div", "day-head");
  const title = el("h2", "section-label");
  if (fromLead) {
    setBiText(
      title,
      homeCopy({ ...settings, language: "vi" }, "rankedToday"),
      homeCopy({ ...settings, language: "en" }, "rankedToday"),
      settings
    );
    head.append(title);
  } else {
    const archiveHref = SNAPSHOT_DATE.test(day.date || "")
      ? dayPageUrl(day.date, lang)
      : "";
    const heading = archiveHref
      ? Object.assign(document.createElement("a"), {
          className: "day-link",
          href: archiveHref,
        })
      : title;
    setBiText(
      heading,
      day.date ? formatDayHeading(day.date, "vi") : t(settings, "stories"),
      day.date ? formatDayHeading(day.date, "en") : t(settings, "stories"),
      settings
    );
    if (heading !== title) title.append(heading);

    const count = el("span", "day-count");
    const n = items.length;
    setBiText(
      count,
      `${n} tin`,
      `${n} ${n === 1 ? "story" : "stories"}`,
      settings
    );

    const cats = el("span", "day-cats");
    const entries = Object.entries(day.categoryCounts || {}).sort(
      (a, b) => b[1] - a[1]
    );
    const shownCats = entries.slice(0, 7);
    const moreCats = entries.length - shownCats.length;
    for (const [name, c] of shownCats) {
      cats.append(
        el(
          "span",
          "",
          categoryLabelNode(name),
          " ",
          el("strong", "", String(c))
        )
      );
    }
    if (moreCats > 0) {
      cats.append(
        el("span", "", lang === "vi" ? `+${moreCats} nữa` : `+${moreCats} more`)
      );
    }
    head.append(title, count, cats);
  }
  section.append(head);

  const list = el("div", "day-list np-columns");
  section.append(list);
  const firstRank = fromLead ? 2 : 1;
  let expanded = false;
  const paint = () => {
    list.replaceChildren();
    const visible = expanded ? items : items.slice(0, DAY_STORY_LIMIT);
    visible.forEach((story, i) => {
      const hot =
        !fromLead && i === 0 && story.rank_score > 0 && items.length > 1;
      list.append(
        renderStoryRow(settings, story, firstRank + i, hot, showVotes)
      );
    });
    section.querySelector(".day-more")?.remove();
    const hidden = items.length - visible.length;
    if (hidden > 0) {
      const button = el("button", "btn-link");
      button.type = "button";
      const label = el("span", "");
      setBiText(
        label,
        `Xem thêm (${hidden})`,
        `Load more (${hidden})`,
        settings
      );
      button.replaceChildren(icon("chevron-down"), label);
      button.addEventListener("click", () => {
        expanded = true;
        paint();
      });
      section.append(el("div", "day-more day-more-row", button));
    }
  };
  paint();
  return section;
}

function renderStories(settings, digest) {
  const root = $("section-days");
  clearSectionContent(root);
  if (!settings.sections.days) {
    root.hidden = true;
    return;
  }

  const dayLimit = Math.max(1, Number(settings.feedDays) || 3);
  const days = filteredDays(digest).slice(0, dayLimit);
  if (!days.length) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const showVotes = anyVotes(days.flatMap((day) => day.items));

  // The first story of the newest day is the lead; the list below starts at 2.
  const lead = days[0]?.items?.[0];
  if (lead) root.append(renderLeadStory(settings, lead));

  days.forEach((day, dayIndex) => {
    const fromLead = dayIndex === 0 && Boolean(lead);
    if ((fromLead ? day.items.slice(1) : day.items).length === 0) return;
    root.append(renderDaySection(settings, day, { fromLead, showVotes }));
  });
}

const SECTION_ORDER_KEYS = ["categories", "trending", "tldr", "days"];

const SECTION_TILES = [
  {
    key: "categories",
    icon: "layout-grid",
    vi: "Danh mục",
    en: "Category nav",
  },
  { key: "trending", icon: "trending-up", vi: "Xu hướng", en: "Trending" },
  { key: "tldr", icon: "sparkles", vi: "AI;DR", en: "AI;DR" },
  {
    key: "days",
    icon: "calendar-days",
    vi: "Bảng tin theo ngày",
    en: "Daily feed",
  },
];

/** Web HomeSections: one chip per home section, pressed while it shows. */
function renderHomeSections(settings) {
  const root = $("home-sections-chips");
  if (!root) return;
  root.replaceChildren();
  for (const { key, icon: name, vi, en } of SECTION_TILES) {
    const on = settings.sections[key];
    const label = el("span", "");
    setBiText(label, vi, en, settings);
    const chip = el("button", "chip", icon(name), label);
    chip.type = "button";
    chip.setAttribute("aria-pressed", on ? "true" : "false");
    chip.addEventListener("click", async () => {
      await pushSettings({
        ...settings,
        sections: { ...settings.sections, [key]: !on },
      });
    });
    root.append(chip);
  }
}

/** Reorder DOM sections to match settings.sectionOrder. Categories, AI;DR
 * and the feed live in the main column; Trending belongs at the top of the
 * rail. Moving into the right host keeps the redesigned grid intact. */
/** Reorder DOM sections to match settings.sectionOrder. Categories, AI;DR
 * and the feed live in the main column; Trending belongs at the top of the
 * rail. Categories sit with the day header (the web's fixed order) until the
 * reader moves them below the AI;DR card. */
function applySectionOrder(settings) {
  const page = $("page-content");
  const grid = document.querySelector(".home-grid");
  const top = $("home-top");
  const main = $("home-main");
  const rail = $("home-rail");
  if (!page || !main || !rail || !top) return;
  const order = settings.sectionOrder || SECTION_ORDER_KEYS;
  const categoriesFirst =
    order.indexOf("categories") < order.indexOf("tldr") ||
    order.indexOf("tldr") < 0;
  const wrappers = [
    {
      key: "categories",
      id: "section-categories",
      host: categoriesFirst ? top : page,
    },
    { key: "trending", id: "section-trending", host: rail },
    { key: "tldr", id: "section-tldr", host: page },
    { key: "days", id: "section-days", host: main },
  ];
  const railAnchor = rail.querySelector(".rail-subscribe");
  for (const key of order) {
    const w = wrappers.find((w) => w.key === key);
    if (!w) continue;
    const node = $(w.id);
    if (!node) continue;
    if (w.host === page && grid) page.insertBefore(node, grid);
    else if (w.host === rail && railAnchor) rail.insertBefore(node, railAnchor);
    else w.host.append(node);
  }
}

function visibleSection(id) {
  const node = $(id);
  return Boolean(node && !node.hidden);
}

function applyBriefLayout() {
  const page = $("page-content");
  if (!page) return;
  const brief =
    visibleSection("section-tldr") && !visibleSection("section-days");
  page.classList.toggle("is-brief", brief);
}

/** Web DayHeader: the big date, a story count and prev/next arrows. */
/** Web DayHeader: the big date, a story count and prev/next arrows. */
function renderDayHeader(settings, digest) {
  const root = $("day-header");
  if (!root) return;
  const days = filteredDays(digest);
  const date = days[0]?.date || digest.tldr?.date || "";
  if (!SNAPSHOT_DATE.test(date)) {
    root.hidden = true;
    return;
  }
  root.hidden = false;

  const total =
    days[0]?.items?.length || digest.totalStories || digest.stories.length;
  const stamp = digest.lastFetchedAt || digest.updatedAt;
  const summary = (language) => {
    const count = language === "vi" ? `${total} tin` : `${total} stories`;
    if (!stamp) return count;
    const ago = timeAgo(stamp, language);
    return language === "vi"
      ? `${count} · cập nhật ${ago}`
      : `${count} · updated ${ago}`;
  };
  setBiText(
    $("day-header-title"),
    formatDayHeading(date, "vi"),
    formatDayHeading(date, "en"),
    settings
  );
  setBiText($("day-header-count"), summary("vi"), summary("en"), settings);
  setBiText(
    $("day-masthead-date"),
    formatDayHeading(date, "vi"),
    formatDayHeading(date, "en"),
    settings
  );
  setBiText($("day-masthead-count"), summary("vi"), summary("en"), settings);

  const prevDate = days[1]?.date || dayBefore(date);
  const prev = $("day-prev");
  if (prevDate) {
    prev.href = dayPageUrl(prevDate, primaryLang(settings));
    prev.removeAttribute("disabled");
    prev.setAttribute("aria-label", homeCopy(settings, "previousDay"));
  } else {
    prev.removeAttribute("href");
  }
  const next = $("day-next");
  if (next) next.setAttribute("aria-label", homeCopy(settings, "nextDay"));
}

/** Web HomeRail's subscribe + this-week blocks (Trending is rendered by
 *  renderChips into #trending inside the same rail). */
/** Web HomeRail's subscribe + this-week blocks (Trending is rendered by
 *  renderChips into #trending inside the same rail). */
function renderRail(settings) {
  const lang = primaryLang(settings);
  const vi = lang === "vi";
  const telegram = $("rail-telegram");
  if (telegram) {
    telegram.href = vi ? "https://t.me/aihomnay" : "https://t.me/aidr_today";
    const label = $("rail-telegram-label");
    if (label)
      label.textContent = `Telegram ${vi ? "@aihomnay" : "@aidr_today"}`;
  }
  const edition = lastClosedEdition(Date.now(), lang);
  const weekLink = $("rail-week-link");
  if (weekLink) {
    weekLink.hidden = !edition;
    weekLink.href = withExtRef(
      edition
        ? `https://aidr.today/week/${edition.week}`
        : "https://aidr.today/weeks",
      "week",
      lang
    );
    const label = $("rail-week-label");
    if (label && edition) {
      label.textContent = `${homeCopy(settings, "issue")} ${edition.issue} · ${edition.range}`;
    }
  }
  const calendar = $("rail-calendar-link");
  if (calendar)
    calendar.href = withExtRef("https://aidr.today/calendar", "calendar", lang);
  const emailForm = $("rail-email-form");
  if (emailForm)
    emailForm.action = withExtRef(
      "https://aidr.today/subscribe",
      "email",
      lang
    );
  const emailLabel = $("rail-email-label");
  if (emailLabel) emailLabel.textContent = homeCopy(settings, "email");
  const blurb = $("rail-email-blurb");
  if (blurb) blurb.textContent = homeCopy(settings, "emailBlurb");
}

function render(settings, digest) {
  setLearnedKeywords(digest.learnedKeywords);
  applyChrome(settings);
  tagSiteLinks(document, {}, uiLang(settings));
  renderDayHeader(settings, digest);
  renderChips(settings, digest);
  renderTldr(settings, digest);
  renderStories(settings, digest);
  renderRail(settings);
  renderHomeSections(settings);
  applySectionOrder(settings);
  renderFooter(settings, digest);
  applyBriefLayout();
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

function bindChannelTracking(getSettings) {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a[data-channel], button[data-channel]");
    if (!link) return;
    const channel = link.dataset.channel;
    if (!channel) return;
    const href = link.getAttribute("href") || "";
    const to = href.split("?")[0] || href;
    trackChannelClick(channel, { to }, getSettings().apiBase);
  });
}

function closeHeaderMenu() {
  const menu = $("header-menu-content");
  const trigger = $("header-menu-trigger");
  if (!menu || !trigger) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

function toggleHeaderMenu() {
  const menu = $("header-menu-content");
  const trigger = $("header-menu-trigger");
  if (!menu || !trigger) return;
  if (trigger.getAttribute("aria-expanded") === "true") {
    closeHeaderMenu();
    return;
  }
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  menu.querySelector(".header-menu-item")?.focus();
}

function bindHeaderMenu() {
  const menu = $("header-menu-content");
  const trigger = $("header-menu-trigger");
  if (!menu || !trigger) return;

  trigger.addEventListener("click", toggleHeaderMenu);
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeHeaderMenu();
  });
  menu.addEventListener("keydown", (event) => {
    const items = [...menu.querySelectorAll(".header-menu-item")];
    const current = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(current + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(current - 1 + items.length) % items.length]?.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (menu.hidden || !(event.target instanceof Node)) return;
    if (!menu.contains(event.target) && !trigger.contains(event.target)) {
      closeHeaderMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || menu.hidden) return;
    closeHeaderMenu();
    trigger.focus();
  });
}

const PHONE_MENU_TRIGGERS = ["open-menu", "tab-menu"];

function closePhoneMenu() {
  const menu = $("phone-menu");
  if (!menu) return;
  menu.hidden = true;
  for (const id of PHONE_MENU_TRIGGERS) {
    $(id)?.setAttribute("aria-expanded", "false");
  }
  document.body.style.overflow = "";
}

function openPhoneMenu() {
  const menu = $("phone-menu");
  if (!menu) return;
  menu.hidden = false;
  for (const id of PHONE_MENU_TRIGGERS) {
    $(id)?.setAttribute("aria-expanded", "true");
  }
  document.body.style.overflow = "hidden";
}

function bindPhoneMenu() {
  for (const id of PHONE_MENU_TRIGGERS) {
    $(id)?.addEventListener("click", openPhoneMenu);
  }
  $("close-menu")?.addEventListener("click", closePhoneMenu);
  $("close-menu-backdrop")?.addEventListener("click", closePhoneMenu);
  $("phone-menu-nav")?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closePhoneMenu();
  });
}

function bindLangToggle(getSettings, onChange) {
  const handler = (event) => {
    const btn = event.target.closest("button[data-lang]");
    if (!btn) return;
    const language = btn.dataset.lang;
    // VI / EN turn bilingual off; VI+EN turns it on (web LangToggle).
    onChange({
      ...getSettings(),
      language,
      bilingual: language === "both",
    });
  };
  $("lang-toggle")?.addEventListener("click", handler);
  $("lang-toggle-phone")?.addEventListener("click", handler);
}

/** The three-icon layout switch in the header (Customize mirrors it offline). */
function bindLayoutSwitch(setLayout) {
  const root = $("layout-switch");
  if (!root) return;
  root.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-layout]");
    if (!btn) return;
    setLayout(btn.dataset.layout);
  });
}

async function main() {
  let settings = await loadSettings();
  applyAppearance(settings);
  applyChrome(settings);
  tagSiteLinks(document, {}, uiLang(settings));
  bindChannelTracking(() => settings);
  track("page_view", {}, settings.apiBase);

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

  const applyLive = (result) => {
    const nextKey = digestPaintKey(result.digest);
    const same = nextKey && nextKey === digestPaintKey(digest);
    digest = result.digest;
    setStatus(t(settings, "cached"), result.stale);
    if (!digest.tldr && digest.stories.length === 0) {
      setStatus(t(settings, "empty"), true);
    }
    if (!same) render(settings, digest);
  };

  let liveBusy = false;

  const setReloadBusy = (busy) => {
    const btn = $("tldr-reload");
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle("is-loading", busy);
  };

  const refreshLive = ({ force = false } = {}) => {
    if (!force && globalThis.__NEWS_TAB_DIGEST__) return;
    if (liveBusy) return;
    liveBusy = true;
    setReloadBusy(true);

    const finish = () => {
      liveBusy = false;
      setReloadBusy(false);
    };

    const onFail = () => {
      if (!digest.tldr && digest.stories.length === 0) {
        setStatus(t(settings, "error"), true);
      }
    };

    if (force) {
      void fetchDigest(settings.apiBase, {
        campaign: "refresh",
        lang: uiLang(settings),
        force: true,
      })
        .then((result) => {
          applyLive(result);
          void maybeOfferUnpackedUpdate(settings);
        })
        .catch(onFail)
        .finally(finish);
      return;
    }

    void hydrateDigest(settings.apiBase, {
      lang: uiLang(settings),
      onCache: (cached) => {
        digest = cached;
        setStatus("", false);
        render(settings, digest);
      },
      onLive: (result) => {
        applyLive(result);
        void maybeOfferUnpackedUpdate(settings);
      },
    })
      .catch(onFail)
      .finally(finish);
  };

  $("tldr-reload")?.addEventListener("click", () => {
    refreshLive({ force: true });
  });

  const refresh = async (next) => {
    settings = next;
    applyAppearance(settings);
    render(settings, digest);
  };

  bindPrefs(() => settings, refresh);
  bindPhoneMenu();
  bindHeaderMenu();
  bindIntroVideo();
  // Seed and persist the image / 2 rows / 3 rows toggle from the `tldrView` pref.
  bindDayCard(async (view) => {
    settings = await updateSettings({ tldrView: view });
    applyAppearance(settings);
    render(settings, digest);
  });
  bindLayoutSwitch(async (layout) => {
    settings = await updateSettings({ layout });
    applyAppearance(settings);
    render(settings, digest);
  });
  pushSettings = async (next) => {
    settings = await saveSettings(next);
    applyAppearance(settings);
    render(settings, digest);
  };
  bindLangToggle(
    () => settings,
    async (next) => {
      track("lang_change", { lang: next.language }, settings.apiBase);
      settings = await saveSettings(next);
      applyAppearance(settings);
      render(settings, digest);
    }
  );

  if (digest.tldr || digest.stories.length) {
    render(settings, digest);
    refreshLive();
    return;
  }

  refreshLive();
}

main();
