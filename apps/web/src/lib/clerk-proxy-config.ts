export const CLERK_PROXY_PATH = "/__clerk";

export interface ClerkProxyUrlOptions {
  /** Relative paths are useful to explicitly configured browser SDKs only. */
  allowRelative?: boolean;
}

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
  value: string | undefined,
  { allowRelative = false }: ClerkProxyUrlOptions = {}
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

  if (raw.startsWith("/")) {
    if (!allowRelative || raw.startsWith("//")) return undefined;
    try {
      const parsed = new URL(raw, "https://clerk-proxy.invalid");
      if (
        parsed.pathname !== CLERK_PROXY_PATH ||
        parsed.search ||
        parsed.hash
      ) {
        return undefined;
      }
      return CLERK_PROXY_PATH;
    } catch {
      return undefined;
    }
  }

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

/** Require the runtime and browser values to be explicit, trusted, and equal. */
export function requireMatchingClerkProxyUrls(
  runtimeValue: string | undefined,
  browserValue: string | undefined
): string {
  const runtimeUrl = resolveClerkProxyUrl(runtimeValue);
  const browserUrl = resolveClerkProxyUrl(browserValue);
  if (!runtimeUrl || !browserUrl || runtimeUrl !== browserUrl) {
    throw new Error(
      "CLERK_PROXY_URL and VITE_CLERK_PROXY_URL must be explicit, trusted, and match"
    );
  }
  return runtimeUrl;
}
