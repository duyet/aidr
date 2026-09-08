import { fetchStory } from "./api.js";
import { topicColor } from "./topic-color.js";
import { safeHttpUrl } from "./settings.js";

const NEWS_SITE = "https://aidr.today";
const THUMB_MARK = new URL("../icons/thumb-mark.svg", import.meta.url).href;

/** Create an element with attributes and children. Matches the helper in
 * settings-panel.js / newtab.js so story-dialog.js is self-contained. */
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

const DIALOG_COPY = {
  vi: {
    dualLanguage: "Xem song ngữ",
    dualLabel: "Song ngữ",
  },
  en: {
    dualLanguage: "View dual language",
    dualLabel: "Dual",
  },
};

function t(lang, key) {
  return (lang === "vi" ? DIALOG_COPY.vi : DIALOG_COPY.en)[key] || "";
}

/** Left-click without modifiers — same gate as the website StoryDialog. */
export function isUnmodifiedLeftClick(event) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function bindAidrDialogLink(anchor, onOpen) {
  anchor.addEventListener("click", (event) => {
    if (!isUnmodifiedLeftClick(event)) return;
    event.preventDefault();
    onOpen();
  });
}

let openRoot = null;

function copyFor(lang) {
  if (lang === "vi") {
    return {
      close: "Đóng",
      loading: "Đang tải...",
      missing: "Không tìm thấy tin.",
      related: "Cùng chủ đề",
      site: "Xem trên aidr.today",
    };
  }
  return {
    close: "Close",
    loading: "Loading...",
    missing: "Story not found.",
    related: "Also in this story",
    site: "Open on aidr.today",
  };
}

function pickTitle(story, lang) {
  const vi = story?.title_vi?.trim();
  if (lang === "vi" && vi) return vi;
  return story?.title || "";
}

function pickTitleFallbackFromEnglish(story, lang) {
  const vi = story?.title_vi?.trim();
  if (lang === "vi") return !vi;
  return false;
}

function findDigestItem(digest, id) {
  if (!id || !digest?.items) return null;
  if (digest.items[id]) return digest.items[id];
  const prefix = String(id).slice(0, 8);
  return (
    Object.values(digest.items).find((story) =>
      String(story?.id || "").startsWith(prefix)
    ) || null
  );
}

function pickSummary(story, lang) {
  if (lang === "vi" && story?.summary_vi) return story.summary_vi;
  return story?.summary || "";
}

function fmtTime(epochSec, lang) {
  const d = new Date(
    (epochSec > 1e12 ? Math.floor(epochSec / 1000) : Math.floor(epochSec)) * 1000
  );
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function publisherHost(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function splitParagraphs(text) {
  return text
    ? text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
    : [];
}

function paintTopic(el, tag) {
  const color = topicColor(tag);
  el.classList.add("topic-colored");
  el.style.setProperty("--tc-light", color.light);
  el.style.setProperty("--tc-dark", color.dark);
}

function closeStoryDialog() {
  if (!openRoot) return;
  openRoot.remove();
  openRoot = null;
  document.body.style.overflow = "";
}

/**
 * Modal story reader. Permalink stays on the <a> for middle/cmd-click.
 */
export function openStoryDialog({
  apiBase,
  language,
  itemId,
  relatedIds = [],
  digest = null,
  permalink = NEWS_SITE,
  bilingual = false,
}) {
  closeStoryDialog();
  const lang = language === "en" ? "en" : "vi";
  const copy = copyFor(lang);
  const hasVi = (story) =>
    Boolean(story?.title_vi || story?.summary_vi);
  let showBilingual = bilingual;

  const overlay = document.createElement("div");
  overlay.className = "story-dialog-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeStoryDialog();
  });

  const panel = document.createElement("div");
  panel.className = "story-dialog";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.tabIndex = -1;

  const head = document.createElement("div");
  head.className = "story-dialog-head";
  const titleEl = document.createElement("a");
  titleEl.className = "story-dialog-title";
  titleEl.target = "_blank";
  titleEl.rel = "noopener noreferrer";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "story-dialog-close";
  closeBtn.setAttribute("aria-label", copy.close);
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", closeStoryDialog);

  const dualBtn = document.createElement("button");
  dualBtn.type = "button";
  dualBtn.className = "story-dialog-dual";
  dualBtn.setAttribute("aria-label", t(lang, "dualLanguage"));
  dualBtn.setAttribute("aria-pressed", String(showBilingual));
  dualBtn.textContent = t(lang, "dualLabel");
  dualBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    showBilingual = !showBilingual;
    dualBtn.setAttribute("aria-pressed", String(showBilingual));
    if (currentStory) paintStory(currentStory, ctx);
  });

  head.append(titleEl, dualBtn, closeBtn);

  const body = document.createElement("div");
  body.className = "story-dialog-body";
  body.textContent = copy.loading;

  const foot = document.createElement("div");
  foot.className = "story-dialog-foot";
  const siteLink = document.createElement("a");
  siteLink.href = permalink || NEWS_SITE;
  siteLink.target = "_blank";
  siteLink.rel = "noopener noreferrer";
  siteLink.textContent = copy.site;
  foot.append(siteLink);

  panel.append(head, body, foot);
  overlay.append(panel);
  document.body.style.overflow = "hidden";
  document.body.append(overlay);
  openRoot = overlay;
  panel.focus();

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      document.removeEventListener("keydown", onKey);
      closeStoryDialog();
    }
  };
  document.addEventListener("keydown", onKey);

  let currentStory = null;
  const ctx = {
    apiBase,
    titleEl,
    body,
    lang,
    copy,
    digest,
    relatedIds,
    itemId,
    get bilingual() {
      return showBilingual && hasVi(currentStory);
    },
  };

  function renderBilingualBtn(story) {
    if (hasVi(story)) {
      dualBtn.hidden = false;
    } else {
      dualBtn.hidden = true;
    }
  }

  const cached = findDigestItem(digest, itemId);
  if (cached) {
    currentStory = cached;
    renderBilingualBtn(cached);
    paintStory(cached, ctx);
  }

  fetchStory(apiBase, itemId).then((story) => {
    if (openRoot !== overlay) return;
    const next = story || cached;
    if (!next) {
      body.textContent = copy.missing;
      titleEl.removeAttribute("href");
      titleEl.textContent = "";
      return;
    }
    currentStory = next;
    renderBilingualBtn(next);
    paintStory(next, ctx);
  });
}

function paintStory(story, ctx) {
  const {
    apiBase,
    titleEl,
    body,
    lang,
    copy,
    digest,
    relatedIds,
    itemId,
    bilingual,
  } = ctx;
  const title = pickTitle(story, lang);
  const fallbackFromEnglish = pickTitleFallbackFromEnglish(story, lang);
  titleEl.textContent = title;
  if (fallbackFromEnglish && lang === "vi") {
    titleEl.lang = "en";
  }
  titleEl.href = safeHttpUrl(story.url, NEWS_SITE) || NEWS_SITE;
  titleEl.setAttribute("aria-label", title);

  body.replaceChildren();

  const hasVi =
    Boolean(story.title_vi) ||
    Boolean(story.summary_vi) ||
    (story.sources || []).some((s) => s?.author?.vi || s?.quote?.vi);

  if (bilingual && hasVi) {
    paintBilingualBody(body, story, lang);
  } else {
    paintMonoBody(body, story, lang);
  }

  const related = (relatedIds || [])
    .filter((id) => id && id !== itemId)
    .map((id) => findDigestItem(digest, id))
    .filter(Boolean);
  if (related.length) {
    const wrap = document.createElement("div");
    wrap.className = "story-dialog-related";
    const label = document.createElement("p");
    label.className = "story-dialog-related-label";
    label.textContent = copy.related;
    wrap.append(label);
    const ul = document.createElement("ul");
    for (const rel of related) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "story-dialog-related-btn";
      btn.textContent = pickTitle(rel, lang);
      btn.addEventListener("click", () => {
        openStoryDialog({
          apiBase,
          language: lang,
          itemId: rel.id,
          relatedIds,
          digest,
          permalink: `${NEWS_SITE}/ai/${String(rel.id).slice(0, 8)}`,
        });
      });
      li.append(btn);
      ul.append(li);
    }
    wrap.append(ul);
    body.append(wrap);
  }
}

function paintMonoBody(body, story, lang) {
  const summary = pickSummary(story, lang);
  const paragraphs = splitParagraphs(summary);
  if (paragraphs.length) {
    const wrap = document.createElement("div");
    wrap.className = "story-dialog-summary";
    for (const p of paragraphs) {
      const node = document.createElement("p");
      node.textContent = p;
      wrap.append(node);
    }
    body.append(wrap);
  }
  if ((story.tags || []).length) {
    const tags = document.createElement("div");
    tags.className = "story-dialog-tags";
    for (const tag of story.tags) {
      const chip = document.createElement("span");
      chip.className = "story-tag";
      paintTopic(chip, tag);
      chip.textContent = tag;
      tags.append(chip);
    }
    body.append(tags);
  }
  paintTopics(body, story, lang);
  paintSources(body, story, lang);
  paintThumbnail(body, story);
}

function paintBilingualBody(body, story, lang) {
  const cols = document.createElement("div");
  cols.className = "story-dialog-bilingual";
  cols.append(
    paintBilingualColumn(
      story.title,
      story.title_vi,
      splitParagraphs(story.summary || ""),
      splitParagraphs(story.summary_vi || ""),
      false
    ),
    paintBilingualColumn(
      story.title,
      story.title_vi,
      splitParagraphs(story.summary || ""),
      splitParagraphs(story.summary_vi || ""),
      true
    )
  );
  body.append(cols);
  if ((story.tags || []).length) {
    const tags = document.createElement("div");
    tags.className = "story-dialog-tags";
    for (const tag of story.tags) {
      const chip = document.createElement("span");
      chip.className = "story-tag";
      paintTopic(chip, tag);
      chip.textContent = tag;
      tags.append(chip);
    }
    body.append(tags);
  }
  paintTopics(body, story, lang);
  paintSources(body, story, lang);
  paintThumbnail(body, story);
}

function paintBilingualColumn(
  titleEn,
  titleVi,
  parasEn,
  parasVi,
  vi
) {
  const col = document.createElement("div");
  col.className = "story-dialog-bilingual-col";
  const h3 = document.createElement("h3");
  h3.className = "story-dialog-bilingual-title";
  h3.textContent = vi ? (titleVi || titleEn) : titleEn;
  if (vi && !titleVi) {
    h3.append(
      el("span", { className: "en-badge" }, [" EN"]),
    );
  }
  col.append(h3);
  const prose = document.createElement("div");
  prose.className = "story-dialog-summary";
  const source = vi ? parasVi : parasEn;
  for (const p of source) {
    const node = document.createElement("p");
    node.textContent = p;
    prose.append(node);
  }
  col.append(prose);
  return col;
}

function paintTopics(body, story, lang) {
  if (!(story.tags || story.category)) return;
  if (!story.tags.length && !story.category) return;
  const wrap = document.createElement("div");
  wrap.className = "story-dialog-topic-wrap";
  const label = document.createElement("span");
  label.className = "story-dialog-topic-label";
  label.textContent = lang === "vi" ? "Chủ đề" : "Topics";
  wrap.append(label);
  if (story.category) {
    const cat = document.createElement("span");
    cat.className = "story-dialog-topic";
    cat.textContent = story.category;
    wrap.append(cat);
  }
  for (const tag of story.tags || []) {
    const chip = document.createElement("span");
    chip.className = "story-dialog-topic story-topic-colored";
    paintTopic(chip, tag);
    chip.textContent = tag;
    wrap.append(chip);
  }
  body.append(wrap);
}

function paintSources(body, story, lang) {
  const sources = story.sources || [];
  if (!sources.length) return;
  const header = document.createElement("div");
  header.className = "story-dialog-source-header";
  header.textContent = lang === "vi" ? "Nguồn chính" : "Key sources";
  body.append(header);
  for (const source of sources) {
    if (!source?.url && !source?.author && !source?.quote) continue;
    const row = document.createElement("div");
    row.className = "story-dialog-source-row";
    const kind = document.createElement("span");
    kind.className = "story-dialog-source-kind";
    kind.textContent = source.kind
      ? source.kind.toUpperCase()
      : "SOURCE";
    row.append(kind);
    if (source.author) {
      const author = document.createElement("span");
      author.className = "story-dialog-source-author";
      author.textContent = source.author;
      row.append(author);
    }
    if (source.posted_at) {
      const time = document.createElement("span");
      time.className = "story-dialog-source-time";
      time.textContent = fmtTime(source.posted_at, lang);
      row.append(time);
    }
    if (source.quote) {
      const quote = document.createElement("span");
      quote.className = "story-dialog-source-quote";
      quote.textContent = `— ${source.quote}`;
      row.append(quote);
    }
    if (source.url) {
      const host = publisherHost(source.url);
      const a = document.createElement("a");
      a.className = "story-dialog-source-link";
      a.href = safeHttpUrl(source.url, NEWS_SITE) || NEWS_SITE;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = host || source.url || "link";
      row.append(a);
    }
    body.append(row);
  }
}

function paintThumbnail(body, story) {
  const url = story?.image_url || story?.thumbnail_url;
  if (!url) return;
  const wrap = document.createElement("div");
  wrap.className = "story-dialog-thumbnail-wrap";
  const img = document.createElement("img");
  img.className = "story-dialog-thumbnail";
  img.width = 640;
  img.height = 160;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.src = safeHttpUrl(url, THUMB_MARK) || THUMB_MARK;
  img.addEventListener("error", () => {
    if (img.src !== THUMB_MARK) img.src = THUMB_MARK;
  });
  wrap.append(img);
  body.append(wrap);
}
