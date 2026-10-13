/**
 * Param kinds for the event registry (`events.ts`). No kind accepts free
 * text: a value is an item id, an enum member, a number, a pathname, a
 * code-supplied slug, or a label from our own data vocabulary. That is the
 * PII rule, and `normalizeParams` is the one place it runs.
 */

/** https://support.google.com/analytics/answer/9267744 */
export const GA4_LIMITS = {
  eventName: 40,
  paramName: 40,
  paramValue: 100,
  paramsPerEvent: 25,
} as const;

export type ParamSpec =
  /** sha256 hex of the source URL, or its 8+ char prefix. */
  | { kind: "item_id" }
  | { kind: "enum"; values: readonly string[] }
  /** Integer >= 0. */
  | { kind: "count" }
  /** Any finite number. */
  | { kind: "number" }
  /** Pathname only; query and hash are cut off before sending. */
  | { kind: "path" }
  /** Static link targets and utm tokens written by our code. */
  | { kind: "slug" }
  /** Category and trending-tag names from the feed, never reader input. */
  | { kind: "label" };

export type Spec = ParamSpec & { optional: boolean; dimension: boolean };

// Each builder returns a literal type, not the widened `Spec`. A widened
// spec would type every param as string | number and let bad calls compile.
export const itemId = () =>
  ({ kind: "item_id", optional: false, dimension: false }) as const;
export const oneOf = <const V extends readonly string[]>(values: V) =>
  ({ kind: "enum", values, optional: false, dimension: false }) as const;
export const count = () =>
  ({ kind: "count", optional: false, dimension: false }) as const;
export const num = () =>
  ({ kind: "number", optional: false, dimension: false }) as const;
export const path = () =>
  ({ kind: "path", optional: false, dimension: false }) as const;
export const slug = () =>
  ({ kind: "slug", optional: false, dimension: false }) as const;
export const label = () =>
  ({ kind: "label", optional: false, dimension: false }) as const;
export const opt = <S extends Spec>(s: S) =>
  ({ ...s, optional: true }) as Omit<S, "optional"> & { optional: true };
/** A GA4 custom dimension: the owner registers it in GA4 Admin. */
export const dim = <S extends Spec>(s: S) =>
  ({ ...s, dimension: true }) as Omit<S, "dimension"> & { dimension: true };

export type ValueOf<S> = S extends {
  kind: "enum";
  values: readonly (infer V)[];
}
  ? V
  : S extends { kind: "count" | "number" }
    ? number
    : string;

export type ParamsOf<P extends Record<string, Spec>> = {
  [K in keyof P as P[K]["optional"] extends true ? never : K]: ValueOf<P[K]>;
} & {
  [K in keyof P as P[K]["optional"] extends true ? K : never]?: ValueOf<P[K]>;
};

export type ParamValue = string | number;

const ITEM_ID_RE = /^[0-9a-f]{8,64}$/;
const SLUG_RE = /^[A-Za-z0-9_.:/?=&-]{1,100}$/;
const LABEL_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .&+#'/-]{0,99}$/u;

function parseValue(spec: Spec, value: unknown): ParamValue | undefined {
  switch (spec.kind) {
    case "item_id":
      return typeof value === "string" && ITEM_ID_RE.test(value)
        ? value
        : undefined;
    case "enum":
      return typeof value === "string" && spec.values.includes(value)
        ? value
        : undefined;
    case "count":
      return Number.isInteger(value) && (value as number) >= 0
        ? (value as number)
        : undefined;
    case "number":
      return Number.isFinite(value) ? (value as number) : undefined;
    case "path": {
      if (typeof value !== "string" || !value.startsWith("/")) return undefined;
      return value.split(/[?#]/, 1)[0].slice(0, GA4_LIMITS.paramValue);
    }
    case "slug":
      return typeof value === "string" && SLUG_RE.test(value)
        ? value
        : undefined;
    case "label": {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return LABEL_RE.test(trimmed) ? trimmed : undefined;
    }
  }
}

/**
 * Iterates the spec's keys, not the caller's, so keys outside the spec never
 * leave the browser. A value that fails its kind is dropped.
 */
export function normalizeParams(
  specs: Record<string, Spec>,
  params: Record<string, unknown> | undefined
): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  if (!params) return out;
  for (const [key, spec] of Object.entries(specs)) {
    const value = parseValue(spec, params[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
