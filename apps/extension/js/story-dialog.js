import { fetchStory } from "./api.js";
import { safeHttpUrl } from "./settings.js";

const NEWS_SITE = "https://aidr.today";

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
}) {
  closeStoryDialog();
  const lang = language === "en" ? "en" : "vi";
  const copy = copyFor(lang);
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
  head.append(titleEl, closeBtn);

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

  const cached = findDigestItem(digest, itemId);
  const ctx = {
    apiBase,
    titleEl,
    body,
    lang,
    copy,
    digest,
    relatedIds,
    itemId,
  };
  if (cached) paintStory(cached, ctx);

  fetchStory(apiBase, itemId).then((story) => {
    if (openRoot !== overlay) return;
    const next = story || cached;
    if (!next) {
      body.textContent = copy.missing;
      titleEl.removeAttribute("href");
      titleEl.textContent = "";
      return;
    }
    paintStory(next, ctx);
  });
}

function paintStory(story, ctx) {
  const { apiBase, titleEl, body, lang, copy, digest, relatedIds, itemId } =
    ctx;
  const title = pickTitle(story, lang);
  titleEl.textContent = title;
  titleEl.href = safeHttpUrl(story.url, NEWS_SITE) || NEWS_SITE;
  titleEl.setAttribute("aria-label", title);

  body.replaceChildren();
  const summary = pickSummary(story, lang);
  if (summary) {
    const p = document.createElement("p");
    p.className = "story-dialog-summary";
    p.textContent = summary;
    body.append(p);
  }
  if ((story.tags || []).length) {
    const tags = document.createElement("div");
    tags.className = "story-dialog-tags";
    for (const tag of story.tags) {
      const chip = document.createElement("span");
      chip.className = "story-tag";
      chip.textContent = tag;
      tags.append(chip);
    }
    body.append(tags);
  }
  const sources = story.sources || [];
  if (sources.length) {
    const list = document.createElement("div");
    list.className = "story-dialog-sources";
    for (const source of sources) {
      if (!source?.url && !source?.author) continue;
      const a = document.createElement("a");
      a.className = "story-dialog-source";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.href = safeHttpUrl(source.url, NEWS_SITE) || NEWS_SITE;
      a.textContent = source.author || source.name || source.url || "source";
      list.append(a);
    }
    if (list.childNodes.length) body.append(list);
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
