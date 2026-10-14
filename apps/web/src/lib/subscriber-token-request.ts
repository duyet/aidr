/** Query parameters that carry a subscriber's token, by the GET path a mail links to. */
const SUBSCRIBER_TOKEN_PARAMS: ReadonlyMap<string, readonly string[]> = new Map(
  [
    ["/subscribe", ["settings", "unsubscribe"]],
    ["/api/subscribe", ["token"]],
    ["/api/subscribe/confirm", ["token"]],
    ["/feedback", ["t"]],
  ]
);

/**
 * A request whose URL carries a subscriber token. The path matches without
 * regard to case or a trailing slash, as the router's own matching does.
 */
export function isSubscriberTokenRequest(
  pathname: string,
  search = ""
): boolean {
  const path = pathname.toLowerCase().replace(/(.)\/+$/, "$1");
  const names = SUBSCRIBER_TOKEN_PARAMS.get(path);
  if (!names) return false;
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  return names.some((name) => params.has(name));
}
