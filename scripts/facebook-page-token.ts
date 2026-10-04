/**
 * Mint a Facebook Page token for whatever install is in `.env.local`.
 *
 * An app id and app secret cannot publish. They exchange a short-lived
 * user token (Graph API Explorer, with pages_show_list,
 * pages_read_engagement, and pages_manage_posts) for a long-lived user
 * token, then `GET /me/accounts` returns the Page token. That Page token
 * is what the hourly pipeline posts with. Its expires_at is 0.
 */

export interface FacebookPageAccount {
  id: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
}

export function selectPage(
  pages: FacebookPageAccount[],
  pageId: string | undefined
): FacebookPageAccount {
  const wanted = pageId?.trim() ?? "";
  if (wanted) {
    const match = pages.find((page) => page.id === wanted);
    if (!match) {
      const known = pages.map((page) => page.id).join(", ") || "none";
      throw new Error(
        `FACEBOOK_PAGE_ID ${wanted} is not in /me/accounts (${known})`
      );
    }
    return match;
  }
  if (pages.length === 1 && pages[0]) return pages[0];
  const known = pages
    .map((page) => `${page.id}${page.name ? ` ${page.name}` : ""}`)
    .join("; ");
  throw new Error(
    `Set FACEBOOK_PAGE_ID. This user can manage ${pages.length} Pages: ${known}`
  );
}

/** Replace listed keys and append any that are missing. Other lines stay.
 *  A repeated key is updated every time. Deleting it from the pending map
 *  on the first hit used to write the literal `undefined` on the next one,
 *  and a later read keeps the last value. */
export function upsertEnv(
  content: string,
  updates: Record<string, string>
): string {
  if (content.trim() === "") {
    const text = Object.entries(updates)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    return text.length === 0 ? "" : `${text}\n`;
  }
  const seen = new Set<string>();
  const lines = content.split("\n");
  const out = lines.map((line) => {
    const eq = line.indexOf("=");
    if (eq === -1) return line;
    const key = line.slice(0, eq).trim();
    if (!Object.hasOwn(updates, key)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  const missing = Object.keys(updates).filter((key) => !seen.has(key));
  if (missing.length > 0) {
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
    for (const key of missing) out.push(`${key}=${updates[key]}`);
  }
  const text = out.join("\n");
  return text.endsWith("\n") || text.length === 0 ? text : `${text}\n`;
}

export function mask(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Cloudflare error 10053. The API says
 *  `Binding name 'NAME' already in use. Please use a different name and try again.`
 *  A bulk call can name more than one. A fresh regex each call: a shared
 *  global regexp would keep `lastIndex` and miss the next error. */
export function collidingBindings(text: string): string[] {
  return [
    ...text.matchAll(/Binding name '([A-Za-z0-9_]+)' already in use/g),
  ].flatMap((match) => (match[1] ? [match[1]] : []));
}

/** First colliding name, for a one-binding error. */
export function collidingBinding(text: string): string | undefined {
  return collidingBindings(text)[0];
}

/** Drop the pending names Cloudflare refused because they are still vars.
 *  Undefined when this error is not that collision, so the caller stops. */
export function collisionSkip(
  pending: readonly string[],
  text: string
): { keep: string[]; skipped: string[] } | undefined {
  const hit = new Set(collidingBindings(text));
  const skipped = pending.filter((key) => hit.has(key));
  if (skipped.length === 0) return undefined;
  const drop = new Set(skipped);
  return {
    keep: pending.filter((key) => !drop.has(key)),
    skipped,
  };
}

/** Drop secret values and Graph tokens before anything is printed.
 *  Longer values first, so a short value that is also a prefix of a token
 *  cannot split that token and leave the rest visible. */
export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  const unique = [...new Set(secrets.filter((secret) => secret.length >= 8))];
  unique.sort((a, b) => b.length - a.length);
  for (const secret of unique) out = out.split(secret).join("[redacted]");
  return out.replace(/EAA[A-Za-z0-9]+/g, "[redacted]");
}
