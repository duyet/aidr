/**
 * Original monogram for a model id that has no first-party mark.
 * Vendor trademarks are not hotlinked; Laguna, Jev, and AnyRouter keep
 * the logos `modelLogoUrl` already returns.
 */
export interface ModelMonogram {
  family: string;
  letters: string;
  /** Tailwind background class. The same family always uses the same chip. */
  tone: string;
}

/** Longer keys first so "space-bunny" wins over a shorter token. */
const FAMILIES = [
  "space-bunny",
  "deepseek",
  "nemotron",
  "minimax",
  "mistral",
  "gemini",
  "claude",
  "gemma",
  "llama",
  "grok",
  "qwen",
  "muse",
  "dots",
  "ling",
  "gpt",
  "glm",
] as const;

const LETTERS: Record<string, string> = {
  gemma: "Ge",
  gemini: "Gm",
  glm: "GL",
  grok: "Gk",
  minimax: "Mx",
  mistral: "Mi",
  "space-bunny": "Sb",
};

const TONE: Record<string, string> = {
  gemma: "bg-teal-800",
  gemini: "bg-indigo-800",
  glm: "bg-violet-800",
  "space-bunny": "bg-orange-800",
  deepseek: "bg-cyan-900",
  minimax: "bg-rose-800",
  mistral: "bg-orange-700",
  nemotron: "bg-green-900",
  grok: "bg-neutral-800",
  llama: "bg-blue-900",
  muse: "bg-sky-900",
  qwen: "bg-amber-900",
  claude: "bg-stone-700",
  gpt: "bg-emerald-900",
  ling: "bg-yellow-900",
  dots: "bg-slate-700",
};

const FALLBACK_TONE = [
  "bg-fuchsia-900",
  "bg-pink-900",
  "bg-red-900",
  "bg-purple-900",
  "bg-lime-900",
] as const;

function hasFamily(id: string, key: string): boolean {
  let from = 0;
  while (from <= id.length - key.length) {
    const at = id.indexOf(key, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : id.charAt(at - 1);
    const after = id.charAt(at + key.length);
    if (
      (before === "" || /[^a-z0-9]/.test(before)) &&
      (after === "" || /[^a-z0-9]/.test(after))
    ) {
      return true;
    }
    from = at + 1;
  }
  return false;
}

function familyOf(id: string): string {
  for (const key of FAMILIES) {
    if (hasFamily(id, key)) return key;
  }
  const slug = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  const stem = /^[a-z]+/.exec(slug)?.[0] ?? "";
  if (stem.length >= 2) return stem;
  const provider = id.includes("/") ? (id.split("/")[0] ?? "") : "";
  const providerStem = provider.replace(/[^a-z0-9]/g, "");
  if (providerStem.length >= 2) return providerStem;
  const alnum = id.replace(/[^a-z0-9]/g, "");
  return alnum.slice(0, 12) || "m";
}

function lettersFor(family: string): string {
  const known = LETTERS[family];
  if (known) return known;
  const alnum = family.replace(/[^a-z0-9]/g, "");
  if (alnum.length <= 1) return (alnum || "?").toUpperCase();
  return alnum.charAt(0).toUpperCase() + alnum.charAt(1);
}

function toneFor(family: string): string {
  const known = TONE[family];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < family.length; i++) {
    hash = (Math.imul(hash, 31) + family.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_TONE[hash % FALLBACK_TONE.length] ?? FALLBACK_TONE[0];
}

/** Monogram for any non-empty model id, including ones we have not named. */
export function modelMonogram(model: string): ModelMonogram | null {
  const id = model.trim().toLowerCase();
  if (!id) return null;
  const family = familyOf(id);
  return { family, letters: lettersFor(family), tone: toneFor(family) };
}
