import type { Env } from "./types.js";

/** Sentry-compatible envelope for Bugsink. No SDK: one POST, then forget. */
export function bugsinkEnvelope(
  dsn: string,
  message: string,
  tags: Record<string, string>
): { url: string; key: string; body: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return null;
  }
  const key = decodeURIComponent(parsed.username);
  const project = parsed.pathname.replace(/^\//, "").split("/")[0];
  if (!key || !project) return null;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const store = new URL(parsed.origin);
  store.pathname = `/api/${project}/envelope/`;
  const event = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    logger: "aidr.delivery",
    environment: "production",
    message: { formatted: message.slice(0, 500) },
    tags,
  };
  const body = [
    JSON.stringify({ event_id: eventId }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  return { url: store.toString(), key, body };
}

/** Report a delivery failure. A missing DSN or a Bugsink outage never throws. */
export async function reportDeliveryFailure(
  env: Pick<Env, "SENTRY_DSN">,
  message: string,
  tags: Record<string, string>
): Promise<void> {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return;
  const envelope = bugsinkEnvelope(dsn, message, tags);
  if (!envelope) {
    console.error("bugsink: SENTRY_DSN is not a Sentry DSN");
    return;
  }
  try {
    const response = await fetch(envelope.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=aidr/1, sentry_key=${envelope.key}`,
      },
      body: envelope.body,
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      console.error(`bugsink: ${response.status}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`bugsink: ${detail}`);
  }
}
