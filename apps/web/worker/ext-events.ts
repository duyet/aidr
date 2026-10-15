import { EXTENSION_EVENTS } from "../src/lib/analytics/events.js";
import { SLUG_RE } from "../src/lib/analytics/schema.js";
import { isBotUserAgent } from "./reads.js";

export type ExtensionEventName = keyof typeof EXTENSION_EVENTS;

export interface ExtensionEvent {
  event: ExtensionEventName;
  /** channel for channel_click, lang for lang_change, '' otherwise. */
  key: string;
}

const KEY_PARAM: Partial<Record<ExtensionEventName, string>> = {
  channel_click: "channel",
  lang_change: "lang",
};

/** Parses `utm_content` as `trackContent` in apps/extension/js/track.js builds
 * it: the event name then each allowlisted param, joined by `_`. Enum values
 * must match the registry; a free slug (`to`) is checked for shape and never
 * stored. Anything else returns null. */
export function parseExtensionEvent(
  content: string | null
): ExtensionEvent | null {
  if (!content) return null;
  const event = (Object.keys(EXTENSION_EVENTS) as ExtensionEventName[]).find(
    (name) => content === name || content.startsWith(`${name}_`)
  );
  if (!event) return null;
  let rest = content.slice(event.length + 1);
  let key = "";
  for (const [name, spec] of Object.entries(EXTENSION_EVENTS[event].params)) {
    let value: string | undefined;
    if (spec.kind === "enum") {
      value = (spec.values as readonly string[]).find(
        (v) => rest === v || rest.startsWith(`${v}_`)
      );
      if (!value) return null;
    } else if (spec.kind === "slug") {
      if (rest && !SLUG_RE.test(rest)) return null;
      value = rest;
    } else {
      return null;
    }
    if (name === KEY_PARAM[event]) key = value;
    rest = rest.slice(value.length + 1);
  }
  return rest === "" ? { event, key } : null;
}

let tableReady: boolean | null = null;

/** Whether `ext_events` exists, so the route still answers before 0068. */
export async function extEventsTableReady(db: {
  prepare(sql: string): { all(): Promise<unknown> };
}): Promise<boolean> {
  if (tableReady !== null) return tableReady;
  try {
    await db.prepare("SELECT event FROM ext_events LIMIT 1").all();
  } catch {
    return false;
  }
  tableReady = true;
  return true;
}

/** Counts one extension event. Drops bots, anything that does not parse, and
 * repeats from one IP inside the limiter's period (`READ_LIMITER`, keyed
 * apart from story reads). Never throws: the route answers as before. */
export async function recordExtensionEvent(input: {
  ua: string | null;
  ip: string | null;
  limiter: RateLimit | undefined;
  content: string | null;
  db: D1Database | undefined;
  day: string;
}): Promise<void> {
  try {
    if (!input.db || isBotUserAgent(input.ua)) return;
    const parsed = parseExtensionEvent(input.content);
    if (!parsed) return;
    if (input.limiter) {
      if (!input.ip) return;
      const { success } = await input.limiter.limit({
        key: `ext|${input.ip}|${parsed.event}|${parsed.key}`,
      });
      if (!success) return;
    }
    if (!(await extEventsTableReady(input.db))) return;
    await input.db
      .prepare(
        `INSERT INTO ext_events (day, event, key, count) VALUES (?, ?, ?, 1)
         ON CONFLICT(day, event, key) DO UPDATE SET count = count + 1`
      )
      .bind(input.day, parsed.event, parsed.key)
      .run();
  } catch (e) {
    console.error("extension event:", e);
  }
}
