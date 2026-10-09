// The AI;DR voice cast (videos/brand/voices.json) for the daily brief.
// Hosts are keyed by a slug of their name ("Tyler Cruz" → "tyler-cruz"); script.json names them in
// `anchor`. The order is a seeded shuffle (seed = edition date), so a re-run drafts the same hosts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

export const slug = (name) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// { provider, model, settings, hosts: { key: { id, name, gender } } } for one language.
export function loadCast(config, lang = config.voice.lang ?? "en") {
  const file = resolve(ROOT, config.voice.cast);
  const all = JSON.parse(readFileSync(file, "utf8"));
  const list = all[lang] ?? [];
  return {
    provider: all.provider,
    model: all.model,
    settings: all.settings,
    hosts: Object.fromEntries(list.map((v) => [slug(v.name ?? v.id), v])),
  };
}

// Host keys shuffled with the seed (same seed → same order).
export function hostOrder(keys, seed) {
  let h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return h / 2 ** 32;
  };
  const out = [...keys];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The show's rule: never the same voice twice in a row, and the closer is not the opener.
export function castProblems(parts) {
  const problems = [];
  for (let i = 1; i < parts.length; i++)
    if (parts[i].anchor === parts[i - 1].anchor)
      problems.push(
        `"${parts[i].anchor}" speaks twice in a row: "${parts[i].text.slice(0, 40)}"`
      );
  if (parts.length > 1 && parts[0].anchor === parts.at(-1).anchor)
    problems.push(`opener and closer are both "${parts[0].anchor}"`);
  return problems;
}
