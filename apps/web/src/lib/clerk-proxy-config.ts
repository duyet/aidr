export const CLERK_PROXY_PATH = "/__clerk";

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") {
    return true;
  }

  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      return Number(part) <= 255;
    })
  );
}

/**
 * Normalize the public URL used by browser and server Clerk configuration.
 * Server callers require an absolute HTTPS URL; explicit loopback HTTP is
 * allowed for local development only.
 */
export function resolveClerkProxyUrl(
  value: string | undefined
): string | undefined {
  if (typeof value !== "string") return undefined;

  const raw = value.trim();
  if (
    !raw ||
    [...raw].some((character) => {
      const code = character.charCodeAt(0);
      return (
        code <= 0x1f ||
        code === 0x7f ||
        character === "\\" ||
        character === "?" ||
        character === "#"
      );
    })
  ) {
    return undefined;
  }

  if (raw.startsWith("/")) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname))
  ) {
    return undefined;
  }

  if (
    parsed.pathname !== "/" &&
    parsed.pathname !== CLERK_PROXY_PATH &&
    parsed.pathname !== `${CLERK_PROXY_PATH}/`
  ) {
    return undefined;
  }

  parsed.pathname = CLERK_PROXY_PATH;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function requireClerkProxyUrl(value: string | undefined): string {
  const url = resolveClerkProxyUrl(value);
  if (!url) {
    throw new Error("CLERK_PROXY_URL must be an explicit trusted absolute URL");
  }
  return url;
}
