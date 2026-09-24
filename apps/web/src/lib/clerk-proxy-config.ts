export const CLERK_PROXY_PATH = "/__clerk";

export interface ClerkProxyUrlOptions {
  /** Relative paths are useful to browser SDKs but are not trusted server config. */
  allowRelative?: boolean;
}

/**
 * Normalize the public URL used by browser and server Clerk configuration.
 * The server always supplies an absolute URL; the browser may use the
 * relative route when explicitly configured by its build environment.
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
    parsed.password
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
