export const DEFAULT_LANG = "vi";
export const NEWS_SITE = "https://aidr.today";

const SITE_HOSTS = new Set(["aidr.today", "www.aidr.today"]);

export function normalizeLang(value) {
  return value === "en" ? "en" : DEFAULT_LANG;
}

export function isSiteUrl(value) {
  try {
    return SITE_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function withLang(url, lang = DEFAULT_LANG) {
  if (typeof url !== "string" || !url.trim()) return url;
  try {
    const next = new URL(url);
    next.searchParams.delete("locale");
    next.searchParams.delete("lang");
    next.searchParams.set("lang", normalizeLang(lang));
    return next.toString();
  } catch {
    return url;
  }
}

export function withSiteLang(url, lang = DEFAULT_LANG) {
  return isSiteUrl(url) ? withLang(url, lang) : url;
}

export function siteUrl(path, lang = DEFAULT_LANG, base = NEWS_SITE) {
  return withLang(new URL(path, `${base}/`).toString(), lang);
}

export function apiUrl(apiBase, path, lang = DEFAULT_LANG) {
  return withLang(new URL(path, `${apiBase}/`).toString(), lang);
}

export function storyPermalink(id, lang = DEFAULT_LANG, base = NEWS_SITE) {
  const key = String(id || "")
    .trim()
    .slice(0, 8);
  return key ? siteUrl(`/${key}`, lang, base) : siteUrl("/", lang, base);
}
