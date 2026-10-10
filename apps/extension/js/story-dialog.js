import { fetchStory } from "./api.js";
import { safeHttpUrl } from "./settings.js";
import { withExtRef } from "./ref.js";
import { NEWS_SITE, siteUrl, storyPermalink } from "./site-url.js";
import { topicColor } from "./topic-color.js";

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
  permalink = "",
  bilingual = false,
}) {
  closeStoryDialog();
  const lang = language === "en" ? "en" : "vi";
  const copy = copyFor(lang);
  const canonicalPermalink = permalink || siteUrl("/", lang);
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
  siteLink.href = canonicalPermalink;
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
    panel,
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

  fetchStory(apiBase, itemId, lang).then((story) => {
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
    panel,
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
  const showBilingual = Boolean(bilingual && hasVi);
  panel.classList.toggle("is-bilingual", showBilingual);

  // Same shape as the website StoryDetail: reading column + 240px aside.
  const main = el("div", { className: "story-dialog-main" });
  const aside = el("aside", { className: "story-dialog-aside" });
  body.append(el("div", { className: "story-dialog-layout" }, [main, aside]));

  if (showBilingual) paintBilingualSummary(main, story);
  else paintMonoSummary(main, story, lang);
  paintSources(main, story, lang);

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
          permalink: storyPermalink(rel.id, lang),
        });
      });
      li.append(btn);
      ul.append(li);
    }
    wrap.append(ul);
    main.append(wrap);
  }

  // Website aside order: votes, media, topics, meta.
  aside.append(storyVotes(story, lang));
  paintThumbnail(aside, story);
  paintTopics(aside, story, lang);
  paintMeta(aside, story, lang);
}

function paintMonoSummary(main, story, lang) {
  const paragraphs = splitParagraphs(pickSummary(story, lang));
  if (!paragraphs.length) return;
  const wrap = document.createElement("div");
  wrap.className = "story-dialog-summary";
  for (const p of paragraphs) {
    const node = document.createElement("p");
    node.textContent = p;
    wrap.append(node);
  }
  main.append(wrap);
}

function paintBilingualSummary(main, story) {
  const cols = document.createElement("div");
  cols.className = "story-dialog-bilingual";
  const parasEn = splitParagraphs(story.summary || "");
  const parasVi = splitParagraphs(story.summary_vi || "");
  cols.append(
    paintBilingualColumn(story.title, story.title_vi, parasEn, parasVi, false),
    paintBilingualColumn(story.title, story.title_vi, parasEn, parasVi, true)
  );
  main.append(cols);
}

const THUMB_PATHS = {
  up: [
    "M7 10v12",
    "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
  ],
  down: [
    "M17 14V2",
    "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z",
  ],
};

function thumbIcon(direction) {
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
  for (const d of THUMB_PATHS[direction]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/**
 * Signed-out variant of the website's StoryVotes pill. The extension has no
 * account session (requests use credentials: "omit"), so both thumbs link to
 * sign-in on aidr.today, the same as a signed-out reader on the site.
 */
export function storyVotes(story, lang) {
  const copy = VOTE_COPY[lang === "en" ? "en" : "vi"];
  const href = withExtRef(siteUrl("/sign-in", lang), "vote", lang);
  const net = typeof story?.vote_net === "number" ? story.vote_net : 0;
  const thumb = (direction) =>
    el(
      "a",
      {
        className: "story-vote-hit",
        href,
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": copy.signIn,
        title: copy.signIn,
      },
      [thumbIcon(direction)]
    );
  return el("div", { className: "story-votes" }, [
    el("span", { className: "story-votes-label" }, [copy.useful]),
    el("span", { className: "story-votes-pill" }, [
      thumb("up"),
      el("span", { className: "story-votes-net" }, [
        el("span", { className: "sr-only" }, [`${copy.total} `]),
        String(net),
      ]),
      thumb("down"),
    ]),
    el(
      "a",
      {
        className: "story-votes-signin",
        href,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      [copy.signIn]
    ),
  ]);
}

const VOTE_COPY = {
  en: {
    useful: "Was this useful?",
    signIn: "Sign in to vote",
    total: "Reader votes",
  },
  vi: {
    useful: "Tin này hữu ích?",
    signIn: "Đăng nhập để bình chọn",
    total: "Tổng phiếu",
  },
};

function paintMeta(aside, story, lang) {
  const when = story.published_at ? fmtTime(story.published_at, lang) : "";
  const host = publisherHost(story.url);
  const text = [when, host].filter(Boolean).join(" · ");
  if (!text) return;
  aside.append(el("div", { className: "story-dialog-meta" }, [text]));
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
  img.addEventListener("click", (event) => {
    if (img.src === THUMB_MARK) return;
    event.stopPropagation();
    openThumbLightbox(img.src);
  });
  wrap.append(img);
  body.append(wrap);
}

function openThumbLightbox(src) {
  const existing = document.querySelector(".thumb-lightbox");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.className = "thumb-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Image");
  const big = document.createElement("img");
  big.src = src;
  big.alt = "";
  overlay.append(big);
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
}
