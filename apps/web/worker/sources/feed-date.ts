/**
 * Feed date parsing with an optional per-source UTC offset.
 *
 * `Date.parse` reads a string with no zone in the *host's* timezone, so the
 * same feed would parse 7 hours differently on a laptop in Ho Chi Minh City
 * and on a Worker running in UTC. A source whose dates carry no zone declares
 * `timezone` in its config (`"+07:00"`); this module then parses the wall
 * clock itself and applies that offset. A string that already carries a zone
 * is never shifted.
 */

const ZONE_SUFFIX =
  /:\d{2}(?:\.\d+)?\s*(?:[AP]M)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?|GMT|UTC|UT|[ECMP][SD]T)$/i;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** `"+07:00"`, `"+0700"` or `"-03:30"` as minutes east of UTC; null for
 *  anything else, so a typo in a config is ignored rather than trusted. */
export function parseUtcOffset(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59) return null;
  return (match[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

function wallClockMs(raw: string): number {
  const iso = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/
  );
  if (iso) {
    return Date.UTC(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4] ?? 0),
      Number(iso[5] ?? 0),
      Number(iso[6] ?? 0)
    );
  }
  const us = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i
  );
  if (us) {
    let hour = Number(us[4]);
    const meridiem = us[7]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return Date.UTC(
      Number(us[3]),
      Number(us[1]) - 1,
      Number(us[2]),
      hour,
      Number(us[5]),
      Number(us[6] ?? 0)
    );
  }
  const rfc = raw.match(
    /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  const month = rfc ? MONTHS[rfc[2].toLowerCase()] : undefined;
  if (rfc && month !== undefined) {
    return Date.UTC(
      Number(rfc[3]),
      month,
      Number(rfc[1]),
      Number(rfc[4]),
      Number(rfc[5]),
      Number(rfc[6] ?? 0)
    );
  }
  return Number.NaN;
}

/** Epoch milliseconds, or NaN. With `utcOffsetMinutes` set, a date string
 *  that has no zone is read as that offset's wall clock; a string with a zone
 *  is parsed as written. A zone-less string in a shape this module does not
 *  know is NaN: guessing the host timezone is the bug being avoided. */
export function parseFeedDate(
  raw: string,
  utcOffsetMinutes?: number | null
): number {
  const text = raw.trim();
  if (utcOffsetMinutes === null || utcOffsetMinutes === undefined) {
    return Date.parse(text);
  }
  const hasTime = /\d:\d{2}/.test(text);
  if (hasTime && ZONE_SUFFIX.test(text)) return Date.parse(text);
  return wallClockMs(text) - utcOffsetMinutes * 60_000;
}
