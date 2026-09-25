import { isSiteUrl, normalizeLang, withSiteLang } from "./site-url.js";

/**
 * Tag aidr.today links so website GA can attribute new-tab clicks.
 * No analytics SDK here — privacy policy forbids one; params only.
 */

export const EXT_REF = "extension";
export const EXT_UTM_SOURCE = "extension";
export const EXT_UTM_MEDIUM = "newtab";
export const EXT_UTM_CAMPAIGN = "aidr_ext";

/**
 * @param {string} url
 * @param {string} [content] utm_content — e.g. tldr, story, brand, submit
 * @returns {string}
 */
export function withExtRef(url, content = "link", lang = "vi") {
  if (typeof url !== "string" || !url.trim()) return url;
  try {
    const localized = withSiteLang(url.trim(), normalizeLang(lang));
    if (!isSiteUrl(localized)) return url;
    const u = new URL(localized);
    u.searchParams.set("ref", EXT_REF);
    u.searchParams.set("utm_source", EXT_UTM_SOURCE);
    u.searchParams.set("utm_medium", EXT_UTM_MEDIUM);
    u.searchParams.set("utm_campaign", EXT_UTM_CAMPAIGN);
    if (content)
      u.searchParams.set("utm_content", String(content).slice(0, 64));
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Form actions must not carry `lang`: GET form submission serializes the
 * hidden lang field alongside the action, which would otherwise create two
 * locale parameters. The hidden field remains the single source of truth.
 */
export function formActionWithExtRef(url, content = "link", lang = "vi") {
  const tagged = withExtRef(url, content, lang);
  if (!isSiteUrl(tagged)) return tagged;
  try {
    const u = new URL(tagged);
    u.searchParams.delete("lang");
    return u.toString();
  } catch {
    return tagged;
  }
}

/** Rewrite aidr.today href/action on a root element (static chrome). */
export function tagSiteLinks(root, contentBySelector = {}, lang = "vi") {
  if (!root?.querySelectorAll) return;
  const defaults = {
    "a.brand": "brand",
    "a#chrome-tab-link": "extension_page",
    "a#submit-btn": "submit",
    "a#sign-in-btn": "sign_in",
    "a.sign-in-btn": "sign_in",
    "form.search": "search",
    ".footer-nav a": "footer",
    ".footer-col a": "footer",
    ".phone-menu-nav a": "menu",
  };
  const map = { ...defaults, ...contentBySelector };

  for (const [selector, content] of Object.entries(map)) {
    for (const node of root.querySelectorAll(selector)) {
      if (node instanceof HTMLAnchorElement && node.href) {
        node.href = withExtRef(node.href, content, lang);
      } else if (node instanceof HTMLFormElement && node.action) {
        node.action = formActionWithExtRef(node.action, content, lang);
        ensureHidden(node, "lang", normalizeLang(lang));
        ensureHidden(node, "ref", EXT_REF);
        ensureHidden(node, "utm_source", EXT_UTM_SOURCE);
        ensureHidden(node, "utm_medium", EXT_UTM_MEDIUM);
        ensureHidden(node, "utm_campaign", EXT_UTM_CAMPAIGN);
        ensureHidden(node, "utm_content", content);
      }
    }
  }

  // Catch remaining same-site anchors not covered above.
  for (const a of root.querySelectorAll("a[href]")) {
    if (!(a instanceof HTMLAnchorElement)) continue;
    try {
      if (!isSiteUrl(a.href)) continue;
      const content =
        a.closest(".footer-nav") || a.closest(".phone-menu-nav")
          ? "nav"
          : "link";
      a.href = withExtRef(a.href, content, lang);
    } catch {
      // ignore
    }
  }
}

function ensureHidden(form, name, value) {
  let input = form.querySelector(`input[name="${name}"]`);
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    form.append(input);
  }
  input.value = value;
}
