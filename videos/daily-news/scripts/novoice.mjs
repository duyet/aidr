// The no-voice cut: when ElevenLabs cannot voice a day (quota short, key missing or rejected, or
// --no-voice), the whole cut goes silent instead of mixing voiced and silent segments.
// Read-along timing comes from a reading-speed estimate (config.timing.noVoice), not from audio.

// A segment line is a string or a list of { anchor, text } parts.
export const partsOf = (line) =>
  typeof line === "string" ? [{ text: line }] : line;

// Word timings for a segment's parts at a reading speed: { id, text, start, end, anchor }.
// Same shape voice.mjs writes, so captions and cues need no special case.
export function estimateWords(parts, { wordsPerSecond, gap }, lang) {
  const rate = wordsPerSecond[lang];
  if (!rate) throw new Error(`config.timing.noVoice.wordsPerSecond has no "${lang}"`);
  const words = [];
  let offset = 0;
  for (const p of parts) {
    const tokens = p.text.split(/\s+/).filter(Boolean);
    const per = 1 / rate;
    for (const [i, text] of tokens.entries())
      words.push({
        id: `w${words.length}`,
        text,
        start: offset + i * per,
        end: offset + (i + 1) * per,
        anchor: p.anchor,
      });
    offset += tokens.length * per + gap;
  }
  return words;
}

// null when the account can voice `needed` characters, else the reason it cannot.
// `subscription` is the body of GET /v1/user/subscription.
export function quotaShortfall(needed, subscription) {
  const remaining =
    Number(subscription.character_limit) - Number(subscription.character_count);
  if (!Number.isFinite(remaining))
    throw new Error("subscription has no character_limit / character_count");
  return remaining < needed
    ? `ElevenLabs quota short: ${needed} characters to voice, ${Math.max(0, remaining)} left`
    : null;
}

// Set when a part fails for quota or key reasons: no HeyGen fallback, the cut goes no-voice.
export class QuotaError extends Error {}
