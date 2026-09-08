import type { IngestSourceRow } from "./system-queries";

const TYPE_HOST: Record<string, string> = {
  hn: "news.ycombinator.com",
  huggingnews: "huggingnews.com",
  lobsters: "lobste.rs",
  anthropic: "anthropic.com",
};

function hostFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Publisher host used for the Google favicon lookup. */
export function sourceIconHost(source: IngestSourceRow): string | null {
  return (
    hostFromUrl(source.config.homepage) ??
    hostFromUrl(source.config.feed) ??
    TYPE_HOST[source.id] ??
    TYPE_HOST[source.type] ??
    null
  );
}

export function sourceIconUrl(source: IngestSourceRow): string | null {
  const host = sourceIconHost(source);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}
