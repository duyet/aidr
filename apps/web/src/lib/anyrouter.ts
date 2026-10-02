const MODEL_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/**
 * AnyRouter already serves provider marks at `/providers/<slug>.svg`
 * (200 image/svg+xml). `GET /api/v1/models` still has no `logo` field
 * as of 2026-10-02, so these hotlinks stand in until that JSON includes one.
 * Jev is the TypeSafe model; its mark is the TypeSafe cube.
 */
const PROVIDER_LOGO: Record<string, string> = {
  anyrouter: "https://anyrouter.dev/providers/anyrouter-color.svg",
  typesafe: "https://anyrouter.dev/providers/typesafe-color.svg",
  poolside: "https://anyrouter.dev/providers/poolside-color.svg",
};

export const ANYROUTER_LOGO_URL = PROVIDER_LOGO.anyrouter;
export const JEV_LOGO_URL = PROVIDER_LOGO.typesafe;
export const POOLSIDE_LOGO_URL = PROVIDER_LOGO.poolside;

/** Public logo for a model id, or null when we have no mark to show. */
export function modelLogoUrl(model: string): string | null {
  const id = model.trim().toLowerCase();
  if (!id) return null;
  if (id.startsWith("@preset/")) return PROVIDER_LOGO.anyrouter;
  if (id.includes("jev")) return PROVIDER_LOGO.typesafe;
  const provider = id.split("/")[0] ?? "";
  return PROVIDER_LOGO[provider] ?? null;
}

/** Logo URL for every chain id that has a mark. Keys are the raw model ids. */
export function logosForModels(ids: readonly string[]): Record<string, string> {
  const logos: Record<string, string> = {};
  for (const id of ids) {
    const url = modelLogoUrl(id);
    if (url) logos[id] = url;
  }
  return logos;
}

/** Validate a public model id before it is used as a link target. */
export function isValidAnyrouterModel(model: string): boolean {
  const value = model.trim();
  if (!value || value.length > 160) return false;
  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment !== "." && segment !== ".." && MODEL_SEGMENT.test(segment)
  );
}

/** Public AnyRouter model detail page; encode each path segment defensively. */
export function anyrouterModelUrl(model: string): string {
  const value = model.trim();
  const path = isValidAnyrouterModel(value)
    ? value.split("/").map(encodeURIComponent).join("/")
    : encodeURIComponent(value);
  return `https://anyrouter.dev/model/${path}?ref=aidr.today`;
}
