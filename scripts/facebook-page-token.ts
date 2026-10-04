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

/** Replace listed keys and append any that are missing. Other lines stay. */
export function upsertEnv(
  content: string,
  updates: Record<string, string>
): string {
  const pending = { ...updates };
  const lines = content.split("\n");
  const out = lines.map((line) => {
    const eq = line.indexOf("=");
    if (eq === -1) return line;
    const key = line.slice(0, eq).trim();
    if (!Object.hasOwn(pending, key)) return line;
    const value = pending[key];
    delete pending[key];
    return `${key}=${value}`;
  });
  for (const [key, value] of Object.entries(pending)) {
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
    out.push(`${key}=${value}`);
  }
  const text = out.join("\n");
  return text.endsWith("\n") || text.length === 0 ? text : `${text}\n`;
}

export function mask(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Cloudflare error 10053: the name is already a wrangler var. */
export function collidingBinding(text: string): string | undefined {
  const match = text.match(/Binding name '([A-Za-z0-9_]+)' already in use/);
  return match?.[1];
}

/** Drop secret values and Graph tokens before anything is printed. */
export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    out = out.split(secret).join("[redacted]");
  }
  return out.replace(/EAA[A-Za-z0-9]+/g, "[redacted]");
}
