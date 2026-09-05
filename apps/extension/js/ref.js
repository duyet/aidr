/**
 * Tag aidr.today links so website GA can attribute new-tab clicks.
 * No analytics SDK here — privacy policy forbids one; params only.
 */

export const EXT_REF = "extension";
export const EXT_UTM_SOURCE = "extension";
export const EXT_UTM_MEDIUM = "newtab";
export const EXT_UTM_CAMPAIGN = "aidr_ext";

const SITE_HOSTS = new Set(["aidr.today", "www.aidr.today"]);

/**
 * @param {string} url
 * @param {string} [content] utm_content — e.g. tldr, story, brand, submit
 * @returns {string}
 */
export function withExtRef(url, content = "link") {
  if (typeof url !== "string" || !url.trim()) return url;
  try {
    const u = new URL(url.trim());
    if (!SITE_HOSTS.has(u.hostname)) return url;
    u.searchParams.set("ref", EXT_REF);
    u.searchParams.set("utm_source", EXT_UTM_SOURCE);
    u.searchParams.set("utm_medium", EXT_UTM_MEDIUM);
    u.searchParams.set("utm_campaign", EXT_UTM_CAMPAIGN);
    if (content) u.searchParams.set("utm_content", String(content).slice(0, 64));
    return u.toString();
  } catch {
    return url;
  }
}

/** Rewrite aidr.today href/action on a root element (static chrome). */
export function tagSiteLinks(root, contentBySelector = {}) {
  if (!root?.querySelectorAll) return;
  const defaults = {
    "a.brand": "brand",
    "a#chrome-tab-link": "extension_page",
    "a#submit-btn": "submit",
    "a#sign-in-btn": "sign_in",
    "a.sign-in-btn": "sign_in",
    "form.search": "search",
    ".footer-nav a": "footer",
    ".phone-menu-nav a": "menu",
  };
  const map = { ...defaults, ...contentBySelector };

  for (const [selector, content] of Object.entries(map)) {
    for (const node of root.querySelectorAll(selector)) {
      if (node instanceof HTMLAnchorElement && node.href) {
        node.href = withExtRef(node.href, content);
      } else if (node instanceof HTMLFormElement && node.action) {
        node.action = withExtRef(node.action, content);
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
      const u = new URL(a.href);
      if (!SITE_HOSTS.has(u.hostname)) continue;
      if (u.searchParams.get("ref") === EXT_REF) continue;
      const content =
        a.closest(".footer-nav") || a.closest(".phone-menu-nav")
          ? "nav"
          : "link";
      a.href = withExtRef(a.href, content);
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
