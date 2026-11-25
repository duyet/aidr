import { digestPaintKey, fetchDigest, hydrateDigest } from "./api.js";
import { bindAidrDialogLink, openStoryDialogLazy } from "./dialog-link.js";
import { highlightTitle, tagsForHighlight } from "./highlight.js";
import { t, uiLang } from "./i18n.js";
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
  Tools: "Công cụ",
  Frameworks: "Frameworks",
  Data: "Dữ liệu",
  "Open Source": "Mã nguồn mở",
};

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
    weeklyEdition: "Bản tin tuần",
    editionCalendar: "Lịch số báo",
    rankedToday: "Tin xếp hạng hôm nay",
    readMore: "Đọc tiếp",
    readSource: "Đọc bài gốc",
    topStory: "Tin hàng đầu",
    storyPage: "Trang tin",
    email: "Email",
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
    weeklyEdition: "Weekly edition",
    editionCalendar: "Edition calendar",
    rankedToday: "Ranked today",
    readMore: "Read more",
    readSource: "Read source",
    topStory: "Top story",
    storyPage: "Story page",
    email: "Email",
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

function paintTopic(el, tag) {
  const color = topicColor(tag);
  el.classList.add("topic-colored");
  el.style.setProperty("--tc-light", color.light);
  el.style.setProperty("--tc-dark", color.dark);
}

function paintCategory(el, name) {
  const color = categoryColor(name);
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
      span.className = "hl topic-ink";
      paintTopic(span, segment.tag);
    } else if (segment.highlighted) {
      span.className = "hl";
    }
    parent.append(span);
  }
  return segments;
}

function thumbNode(src, extraClass = "") {
  const img = document.createElement("img");
  img.className = extraClass ? `thumb ${extraClass}` : "thumb";
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

function renderThumbRow(settings, digest, bullet, n, secondText) {
  const row = document.createElement("li");
  // Rank and copy share the first line; the second language, when present,
  // stays a full-width line under them.
  row.style.display = "flex";
  row.style.alignItems = "flex-start";
  row.style.gap = "0.5rem";
  row.style.flexWrap = "wrap";
  if (secondText) row.dataset.bilingual = "true";

  const rank = document.createElement("span");
  rank.className = "bullet-rank";
  rank.setAttribute("aria-hidden", "true");
  rank.style.flex = "none";
  rank.style.fontFamily = "var(--mono)";
  rank.style.fontSize = "11px";
  rank.style.fontVariantNumeric = "tabular-nums";
  rank.style.fontWeight = n === 1 ? "600" : "400";
  rank.style.color = "var(--muted-foreground)";
  rank.textContent = String(n).padStart(2, "0");

  const inner = document.createElement("span");
  inner.className = "bullet";
  inner.style.flex = "1 1 auto";
  inner.style.minWidth = "0";

  const copy = document.createElement("span");
  copy.className = "bullet-copy";
  copy.title = bullet.text;

  const tags = bulletTags(digest, bullet);
  const segments = highlightTitle(bullet.text, tagsForHighlight(tags));
  const topic = bulletTopic(digest, bullet, segments);
  if (topic) {
    const tagEl = document.createElement("span");
    tagEl.className = "topic-tag";
    paintTopic(tagEl, topic);
    const dot = document.createElement("span");
    dot.className = "topic-dot";
    dot.setAttribute("aria-hidden", "true");
    tagEl.append(dot, document.createTextNode(topic));
    copy.append(tagEl);
  }

  const link = document.createElement("a");
  link.href = safeHttpUrl(
    bulletHref(digest, bullet, primaryLang(settings)),
    storyPermalink("", primaryLang(settings))
  );
  link.rel = "noreferrer";
  appendHighlighted(link, bullet.text, tags);
  const primaryId = bullet.item_ids?.[0];
  if (primaryId) {
    bindAidrDialogLink(link, () =>
      openStoryDialogLazy({
        apiBase: settings.apiBase,
        language: primaryLang(settings),
        itemId: primaryId,
        relatedIds: (bullet.item_ids || []).slice(1),
        digest,
        permalink: link.href,
        bilingual: settings.bilingualDialog,
      })
    );
  }
  copy.append(link);

  const extra = (bullet.item_ids || []).length - 1;
  if (extra > 0) {
    const more = document.createElement("span");
    more.className = "related";
    more.textContent = `+${extra}`;
    copy.append(more);
  }

  inner.append(copy, thumbNode(bullet.image_url));
  row.append(rank, inner);
  if (secondText) {
    const other = document.createElement("span");
    other.className = "bi-second";
    other.lang = secondaryLang(settings);
    other.style.flexBasis = "100%";
    other.textContent = secondText;
    row.append(other);
  }
  row.dataset.n = String(n);
  return row;
}

function splitColumns(items, count = 2) {
  const cols = Math.max(1, Math.min(3, Number(count) || 2));
  const per = Math.ceil(items.length / cols) || 1;
  const result = [];
  for (let i = 0; i < cols; i++) {
    result.push(items.slice(i * per, (i + 1) * per));
  }
  return result;
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
  $("trending-label").textContent = t(settings, "trending");
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
  localize($("header-nav"), settings);
  localize(document.querySelector(".home-rail"), settings);
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
  const node = $("footer-copy");
  if (!node) return;
  const year = new Date().getFullYear();
  const stamp = digest.lastFetchedAt || digest.updatedAt;
  const updated = stamp ? ` · Updated ${timeAgo(stamp, "en")}` : "";
  node.textContent = `© ${year} AI;DR${updated}`;
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

function tldrShown(bullets, settings) {
  return bullets.slice(0, settings.tldrCount || 8);
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
  const day = document.createElement("span");
  day.className = "tldr-day";
  day.textContent = parts.day;
  const link = document.createElement("a");
  link.className = "tldr-date";
  link.href = dayPageUrl(date, lang);
  const weekday = document.createElement("span");
  weekday.textContent = parts.weekday;
  const monthYear = document.createElement("span");
  monthYear.textContent = parts.monthYear;
  link.append(weekday, monthYear);
  if (isBilingual(settings)) {
    const other = dayOgDateParts(date, secondaryLang(settings));
    if (other) {
      const second = document.createElement("span");
      second.className = "bi-second";
      second.lang = secondaryLang(settings);
      second.textContent = `${other.weekday} · ${other.monthYear}`;
      link.append(second);
    }
  }
  title.append(day, link);
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
      await pushSettings({ ...settings, tldrCount: nominal });
    });
    counts.append(btn);
  }

  const shown = tldrShown(bullets, settings);
  const expanded = shown.length > 8;
  const columns = splitColumns(shown, settings.tldrCols ?? 2);
  columns.forEach((col, ci) => {
    if (!col.length) return;
    const list = document.createElement("ol");
    list.className = "tldr-list";
    // Ranks are drawn in the rows (mono 11px), not by ::marker.
    list.style.listStyle = "none";
    list.style.paddingLeft = "0";
    list.start = ci === 0 ? 1 : columns[0].length + 1;
    col.forEach((bullet, i) => {
      const primaryId = bullet.item_ids?.[0];
      list.append(
        renderThumbRow(
          settings,
          digest,
          bullet,
          (ci === 0 ? 1 : columns[0].length + 1) + i,
          secondTexts && primaryId ? secondTexts.get(primaryId) : null
        )
      );
    });
    cols.append(list);
  });

  if (bullets.length > 8 && !expanded) {
    more.hidden = false;
    more.textContent = t(settings, "showMore");
    more.onclick = async () => {
      const next = bullets.length > 12 ? 16 : 12;
      await pushSettings({ ...settings, tldrCount: next });
    };
  } else if (expanded) {
    more.hidden = false;
    more.textContent = t(settings, "showLess");
    more.onclick = async () => {
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

function clearSectionContent(sectionEl) {
  sectionEl.replaceChildren();
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
    const all = document.createElement("button");
    all.type = "button";
    all.className = "chip";
    setBiText(all, "Tất cả", "All", settings);
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
      paintCategory(btn, row.name);
      if (selected) {
        btn.append(
          Object.assign(document.createElement("span"), {
            className: "category-filter-dot",
            ariaHidden: "true",
          })
        );
      }
      const label = document.createElement("span");
      label.className = selected ? "" : "category-colored";
      setBiText(
        label,
        categoryLabel(row.name, "vi"),
        categoryLabel(row.name, "en"),
        settings
      );
      const count = document.createElement("span");
      count.className = "n chip-count";
      count.textContent = String(row.count);
      btn.append(label, " ", count);
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
      const name = document.createElement("span");
      name.className = "topic-ink";
      const dot = document.createElement("span");
      dot.className = "topic-dot";
      dot.setAttribute("aria-hidden", "true");
      name.append(dot, document.createTextNode(row.tag));
      const count = document.createElement("span");
      count.className = "n chip-count topic-muted";
      count.textContent = String(row.count);
      btn.append(name, count);
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
  const lang = primaryLang(settings);
  const titles = titleRows(story, settings);
  const mainTitle = titles[0] || {
    text: story.title,
    lang: "en",
    fallback: false,
  };
  const secondTitle = titles[1] || null;
  const { text: title, fallbackFromEnglish } = mainTitle;
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
  const n = document.createElement("span");
  n.className = "story-n story-rank";
  n.style.display = "flex";
  n.style.alignItems = "flex-start";
  n.style.justifyContent = "flex-end";
  n.style.width = "1.75rem";
  n.style.gap = "2px";
  n.style.alignSelf = "flex-start";
  n.style.paddingTop = "2px";
  let chevron = null;
  if (hasDetails) {
    chevron = document.createElement("span");
    chevron.className = "story-rank-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.setAttribute("data-testid", "story-row-chevron");
    chevron.setAttribute("data-expanded", "false");
    chevron.hidden = true;
    chevron.append(voteChevron("down"));
    n.append(chevron);
  }
  n.append(document.createTextNode(String(index)));

  const titleWrap = document.createElement("span");
  titleWrap.className = "story-title";
  if (hot) titleWrap.append(hotIcon());

  const article = document.createElement("a");
  article.className = "story-article";
  article.href =
    safeHttpUrl(
      withExtRef(storyHref(story, lang), "story", lang),
      withExtRef(NEWS_SITE, "story", lang)
    ) || withExtRef(NEWS_SITE, "story", lang);
  article.rel = "noreferrer";
  if (fallbackFromEnglish) article.lang = "en";
  appendHighlighted(article, title, story.tags || []);
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
  titleWrap.append(article);

  if (secondTitle) {
    const other = document.createElement("span");
    other.className = "bi-second";
    other.lang = secondTitle.lang;
    other.style.display = "block";
    other.textContent = secondTitle.text;
    titleWrap.append(other);
  }

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
  const host = publisherHost(ext.href);
  if (host) {
    const publisher = document.createElement("span");
    publisher.className = "story-publisher";
    publisher.textContent = host;
    ext.append(publisher);
  }

  const cat = document.createElement("span");
  cat.className = "story-cat";
  if (story.category) {
    paintCategory(cat, story.category);
    cat.append(
      Object.assign(document.createElement("span"), {
        className: "category-filter-dot",
        ariaHidden: "true",
      }),
      Object.assign(document.createElement("span"), {
        className: "category-colored",
        textContent: categoryLabel(story.category, lang),
      })
    );
  }

  const when = document.createElement("span");
  when.className = "story-when";
  when.textContent = story.published_at
    ? timeAgo(story.published_at, lang)
    : "";

  // Small source line: category, time, publisher; votes only when enabled.
  const meta = document.createElement("span");
  meta.className = "story-meta";
  if (settings.votes) meta.append(renderVotes(settings, story));
  meta.append(cat, when, ext);

  // One column holds the title, the optional summary line and the metadata,
  // so the rank shares only the first title line (web StoryRow.story-body).
  const body = document.createElement("span");
  body.className = "story-body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.flex = "1 1 auto";
  body.style.minWidth = "0";
  body.append(titleWrap);
  if (mainSummary) {
    const summaryEl = document.createElement("span");
    summaryEl.className = "row-summary np-justify";
    summaryEl.lang = mainSummary.lang;
    summaryEl.textContent = mainSummary.text;
    body.append(summaryEl);
  }
  if (secondSummary) {
    const other = document.createElement("span");
    other.className = "bi-second row-summary np-justify";
    other.lang = secondSummary.lang;
    other.textContent = secondSummary.text;
    body.append(other);
  }
  body.append(meta);
  head.append(n, body);

  const rowThumb = document.createElement("span");
  rowThumb.className = "row-thumb";
  rowThumb.style.flex = "none";
  rowThumb.append(thumbNode(story.image_url, "row-thumb-img"));
  head.append(rowThumb);

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

function voteChevron(direction) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    direction === "up" ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"
  );
  svg.append(path);
  return svg;
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
  up.append(voteChevron("up"));
  const down = link();
  down.append(voteChevron("down"));
  const count = document.createElement("span");
  count.className = "story-vote-net";
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = lang === "vi" ? "Tổng phiếu " : "Reader votes ";
  count.append(sr, document.createTextNode(String(net)));
  wrap.append(up, count, down);
  return wrap;
}

function arrowIcon(path) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

/** Web LeadStory: the day's top story above the ranked list. */
function renderLeadStory(settings, story) {
  const lang = primaryLang(settings);
  const article = document.createElement("article");
  article.className = "lead-story";
  article.setAttribute("aria-label", homeCopy(settings, "topStory"));

  const body = document.createElement("div");
  body.className = "lead-story-body";

  const kicker = document.createElement("p");
  kicker.className = "lead-story-kicker";
  if (story.category) {
    const cat = document.createElement("span");
    cat.className = "category-colored";
    paintCategory(cat, story.category);
    cat.textContent = categoryLabel(story.category, lang);
    kicker.append(cat);
  }
  if (story.published_at) {
    if (story.category) kicker.append(document.createTextNode(" · "));
    kicker.append(document.createTextNode(timeAgo(story.published_at, lang)));
  }
  body.append(kicker);

  const titles = titleRows(story, settings);
  const main = titles[0] || {
    text: story.title,
    lang: "en",
    fallback: false,
  };
  const heading = document.createElement("h3");
  heading.className = "lead-story-title lead-title";
  const link = document.createElement("a");
  link.href = storyHref(story, lang);
  if (main.fallback) link.lang = "en";
  appendHighlighted(link, main.text, story.tags || []);
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
  heading.append(link);
  body.append(heading);
  if (titles[1]) {
    const second = document.createElement("p");
    second.className = "bi-second";
    second.lang = titles[1].lang;
    second.textContent = titles[1].text;
    body.append(second);
  }

  const summaries = summaryRows(story, settings);
  if (summaries[0]) {
    const summary = document.createElement("p");
    summary.className = "lead-story-summary np-justify";
    summary.lang = summaries[0].lang;
    summary.textContent = summaries[0].text;
    body.append(summary);
  }
  if (summaries[1]) {
    const second = document.createElement("p");
    second.className = "bi-second np-justify";
    second.lang = summaries[1].lang;
    second.textContent = summaries[1].text;
    body.append(second);
  }

  const actions = document.createElement("div");
  actions.className = "lead-story-actions";
  const more = document.createElement("a");
  more.className = "btn-primary";
  more.href = storyHref(story, lang);
  more.append(document.createTextNode(homeCopy(settings, "readMore")));
  more.append(arrowIcon("M5 12h14M13 6l6 6-6 6"));
  actions.append(more);
  if (story.url) {
    const source = document.createElement("a");
    source.className = "btn-link";
    source.href = safeHttpUrl(story.url, NEWS_SITE) || NEWS_SITE;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.append(document.createTextNode(homeCopy(settings, "readSource")));
    source.append(externalLinkIcon());
    actions.append(source);
    const host = publisherHost(source.href);
    if (host) {
      const hostEl = document.createElement("span");
      hostEl.className = "lead-story-source";
      hostEl.textContent = host;
      actions.append(hostEl);
    }
  }
  body.append(actions);

  article.append(body);
  if (story.image_url) {
    const media = document.createElement("div");
    media.className = "lead-story-media";
    media.append(thumbNode(story.image_url, "lead-thumb"));
    article.append(media);
  } else {
    article.classList.add("lead-story-text");
  }
  return article;
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
  const lang = primaryLang(settings);

  // The first story of the newest day is the lead; the list below starts at 2.
  const lead = days[0]?.items?.[0];
  if (lead) root.append(renderLeadStory(settings, lead));

  days.forEach((day, dayIndex) => {
    const fromLead = dayIndex === 0 && Boolean(lead);
    const items = fromLead ? day.items.slice(1) : day.items;
    if (!items.length) return;

    const section = document.createElement("section");
    section.className = "day-section";

    const head = document.createElement("div");
    head.className = "day-head";

    const title = document.createElement("h2");
    title.className = "section-label";
    if (fromLead) {
      setBiText(
        title,
        homeCopy({ ...settings, language: "vi" }, "rankedToday"),
        homeCopy({ ...settings, language: "en" }, "rankedToday"),
        settings
      );
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
    }

    const count = document.createElement("span");
    count.className = "day-count";
    const n = items.length + (fromLead ? 1 : 0);
    setBiText(
      count,
      `${n} tin`,
      `${n} ${n === 1 ? "story" : "stories"}`,
      settings
    );

    const cats = document.createElement("span");
    cats.className = "day-cats";
    const entries = Object.entries(day.categoryCounts || {}).sort(
      (a, b) => b[1] - a[1]
    );
    const shown = entries.slice(0, 7);
    const more = entries.length - shown.length;
    for (const [name, c] of shown) {
      const bit = document.createElement("span");
      bit.className = "category-colored";
      paintCategory(bit, name);
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
      bit.textContent = lang === "vi" ? `+${more} nữa` : `+${more} more`;
      cats.append(bit);
    }

    head.append(title, count, cats);
    section.append(head);

    const list = document.createElement("div");
    list.className = "day-list np-columns";
    const firstRank = fromLead ? 2 : 1;
    items.forEach((story, i) => {
      const hot =
        !fromLead && i === 0 && story.rank_score > 0 && items.length > 1;
      list.append(renderStoryRow(settings, story, firstRank + i, hot));
    });
    section.append(list);
    root.append(section);
  });
}

const SECTION_ORDER_KEYS = ["categories", "trending", "tldr", "days"];

/** Reorder DOM sections to match settings.sectionOrder. Categories, AI;DR
 * and the feed live in the main column; Trending belongs at the top of the
 * rail. Moving into the right host keeps the redesigned grid intact. */
function applySectionOrder(settings) {
  const page = $("page-content");
  const grid = document.querySelector(".home-grid");
  const main = $("home-main");
  const rail = $("home-rail");
  if (!page || !main || !rail) return;
  const wrappers = [
    { key: "categories", id: "section-categories", host: page },
    { key: "trending", id: "section-trending", host: rail },
    { key: "tldr", id: "section-tldr", host: page },
    { key: "days", id: "section-days", host: main },
  ];
  const order = settings.sectionOrder || SECTION_ORDER_KEYS;
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

  setBiText(
    $("day-header-title"),
    formatDayHeading(date, "vi"),
    formatDayHeading(date, "en"),
    settings
  );
  const total =
    days[0]?.items?.length || digest.totalStories || digest.stories.length;
  const stamp = digest.lastFetchedAt || digest.updatedAt;
  const ago = stamp ? ` · ${timeAgo(stamp, "vi")}` : "";
  const agoEn = stamp ? ` · ${timeAgo(stamp, "en")}` : "";
  setBiText(
    $("day-header-count"),
    `${total} tin${ago}`,
    `${total} ${total === 1 ? "story" : "stories"}${agoEn}`,
    settings
  );
  setBiText(
    $("day-masthead-date"),
    `${formatDayHeading(date, "vi")} · ${total} tin`,
    `${formatDayHeading(date, "en")} · ${total} stories`,
    settings
  );

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
function renderRail(settings) {
  const vi = primaryLang(settings) === "vi";
  const telegram = $("rail-telegram");
  if (telegram) {
    telegram.href = vi ? "https://t.me/aihomnay" : "https://t.me/aidr_today";
    const label = $("rail-telegram-label");
    if (label)
      label.textContent = `Telegram ${vi ? "@aihomnay" : "@aidr_today"}`;
  }
  const weekLink = $("rail-week-link");
  if (weekLink)
    weekLink.href = withExtRef(
      "https://aidr.today/weeks",
      "week",
      primaryLang(settings)
    );
  const calendar = $("rail-calendar-link");
  if (calendar)
    calendar.href = withExtRef(
      "https://aidr.today/calendar",
      "calendar",
      primaryLang(settings)
    );
  const emailForm = $("rail-email-form");
  if (emailForm)
    emailForm.action = withExtRef(
      "https://aidr.today/subscribe",
      "email",
      primaryLang(settings)
    );
  const emailLabel = $("rail-email-label");
  if (emailLabel) emailLabel.textContent = homeCopy(settings, "email");
}

function render(settings, digest) {
  applyChrome(settings);
  tagSiteLinks(document, {}, uiLang(settings));
  renderDayHeader(settings, digest);
  renderChips(settings, digest);
  renderTldr(settings, digest);
  renderStories(settings, digest);
  renderRail(settings);
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
