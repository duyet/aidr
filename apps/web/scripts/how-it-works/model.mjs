// The figure's model. Constants are the Worker's: ingest-schedule.ts (30 min
// run, 25 min coalesce), llm.ts (score batch 5), tldr.ts (16 items, rolling
// 24h, 3h refresh), subscribe/send.ts (email 07:00 local), notify/index.ts
// (08:00 ICT, 8 bullets). rankScore is worker/ranking.ts with its inputs
// renamed; snapshot.ts checks it against the real function.
export const RUN_EVERY_H = 0.5;
export const COALESCE_MIN = 25;
export const SCORE_BATCH = 5;
export const TLDR_MAX = 16;
export const TLDR_WINDOW_H = 24;
export const TLDR_REFRESH_H = 3;
export const EMAIL_HOUR = 7;
export const NOTIFY_HOUR = 8;
export const TELEGRAM_BULLETS = 8;
export const ICT_OFFSET_H = 7;
export const RACK_SLOTS = 20;

export function rankScore({
  importance,
  quality,
  points,
  comments,
  sourceCount,
  voteNet,
  age,
}) {
  if (age < 0) return 0;
  importance = Math.min(10, Math.max(0, importance));
  let decay = Math.exp(-age / 36);
  if (age > 24) decay *= Math.exp(-(age - 24) / 24);
  let engagement = 1 + Math.log10(1 + points + 0.5 * comments);
  if (importance < 4) engagement = Math.min(engagement, 1.3);
  const boost = 1 + 0.12 * (Math.min(Math.max(sourceCount, 1), 8) - 1);
  const crowd = Math.min(engagement * boost, 3.25);
  const steps = 0.2 * Math.min(6, Math.abs(voteNet));
  const vote = voteNet >= 0 ? 1 + steps : 1 / (1 + steps);
  const weight = importance ** 1.5 / Math.sqrt(10);
  const breaking = importance >= 8 ? 1 + 0.4 * Math.exp(-age / 3) : 1;
  return (
    weight *
    (0.6 + (0.4 * Math.min(10, Math.max(0, quality))) / 10) *
    decay *
    crowd *
    vote *
    breaking
  );
}

// Local ICT hour at clock time t (hours after the snapshot's start).
export const ictHour = (snap, t) =>
  (((snap.start / 3600 + ICT_OFFSET_H + t) % 24) + 24) % 24;

// Published stories, each with an id the page can key bars on.
export const storiesOf = (snap) =>
  snap.items
    .map((it, id) => ({ ...it, id }))
    .filter((it) => it.status === "published");

// The rack at clock time t: stories already fetched, in-window ones by score,
// then aged-out ones past the gate.
export function board(stories, t) {
  const live = stories
    .filter((s) => s.fetched <= t)
    .map((s) => {
      const age = t - s.published;
      return {
        id: s.id,
        s,
        age,
        score: rankScore({ ...s, age }),
        inWindow: age <= TLDR_WINDOW_H,
      };
    });
  const inside = live
    .filter((r) => r.inWindow)
    .sort((a, b) => b.score - a.score);
  const out = live.filter((r) => !r.inWindow).sort((a, b) => b.score - a.score);
  const gate = Math.max(Math.min(inside.length, RACK_SLOTS), TLDR_MAX);
  return [
    ...inside.map((r, i) => ({ ...r, slot: i })),
    ...out.map((r, i) => ({ ...r, slot: gate + i })),
  ].filter((r) => r.slot < RACK_SLOTS);
}

// Items fetched so far, newest first (all statuses).
export const fetchedBy = (snap, t) =>
  snap.items
    .filter((it) => it.fetched <= t)
    .sort((a, b) => b.fetched - a.fetched);
