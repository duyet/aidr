/**
 * A model of what gtag.js sends, built from `window.dataLayer`, so tests can
 * inspect GA4 hits without loading Google's script.
 */

type GtagWindow = Window & {
  dataLayer?: ArrayLike<unknown>[];
  gtag?: (...args: unknown[]) => void;
};

export type GaHit = { en: string; dl: string; dr: string };

/** The tag the Cloudflare Google tag gateway inlines at the top of <head>. */
export function gatewaySnippet(): void {
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  const dataLayer = w.dataLayer;
  w.gtag = function gtag() {
    // biome-ignore lint/complexity/noArguments: gtag.js replays arguments objects
    dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("set", "developer_id.dYzg1YT", true);
  w.gtag("config", "G-22PGCY4GEG");
}

/**
 * Commands run in order, and `config` sends a page_view unless
 * `send_page_view` is false. A hit takes `dl` from its own params, else the
 * last `set`, else location.href. A `set` issued after a `config` does not
 * reach that config's page_view (measured against aidr.today on 2026-10-14).
 */
export function gaHits(): GaHit[] {
  const page: Record<string, unknown> = {};
  const hits: GaHit[] = [];
  const hit = (en: string, params: Record<string, unknown>) => {
    hits.push({
      en,
      dl: String(params.page_location ?? page.page_location ?? location.href),
      dr: String(
        params.page_referrer ?? page.page_referrer ?? document.referrer
      ),
    });
  };
  for (const entry of (window as GtagWindow).dataLayer ?? []) {
    const [cmd, a, b] = Array.from(entry);
    const params = (b ?? {}) as Record<string, unknown>;
    if (cmd === "set" && typeof a === "object" && a) Object.assign(page, a);
    if (cmd === "config" && params.send_page_view !== false) {
      hit("page_view", params);
    }
    if (cmd === "event") hit(String(a), params);
  }
  return hits;
}
