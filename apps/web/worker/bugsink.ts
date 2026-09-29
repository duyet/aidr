import type { Env } from "./types.js";

export interface SentryReport {
  message: string;
  tags?: Record<string, string>;
  /** When set, the event is an exception issue, not only a message. */
  exception?: { type: string; value: string };
}

/** Sentry-compatible envelope for Bugsink. No SDK: one POST, then forget. */
export function bugsinkEnvelope(
  dsn: string,
  report: SentryReport
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
    message: { formatted: report.message.slice(0, 500) },
    tags: report.tags ?? {},
    ...(report.exception
      ? {
          exception: {
            values: [
              { type: report.exception.type, value: report.exception.value },
            ],
          },
        }
      : {}),
  };
  const body = [
    JSON.stringify({ event_id: eventId }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  return { url: store.toString(), key, body };
}

let bound: Pick<Env, "SENTRY_DSN"> | null = null;

/** Point later pipeline errors at the Worker DSN. Does not touch D1 logs. */
export function bindSentry(env: Pick<Env, "SENTRY_DSN">): void {
  bound = env;
}

export function exceptionReport(
  error: unknown
): NonNullable<SentryReport["exception"]> {
  if (error instanceof Error) {
    return { type: error.name || "Error", value: error.message.slice(0, 500) };
  }
  return { type: "Error", value: String(error).slice(0, 500) };
}

/** Report a delivery failure or an exception. A missing DSN never throws. */
export async function reportToSentry(
  env: Pick<Env, "SENTRY_DSN"> | null,
  report: SentryReport
): Promise<void> {
  const dsn = env?.SENTRY_DSN?.trim();
  if (!dsn) return;
  const envelope = bugsinkEnvelope(dsn, report);
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

export async function reportDeliveryFailure(
  env: Pick<Env, "SENTRY_DSN">,
  message: string,
  tags: Record<string, string>
): Promise<void> {
  await reportToSentry(env, { message, tags });
}

/** Exception path used by the ingest workflow. Database rows stay as they are. */
export async function reportPipelineException(
  error: unknown,
  tags: Record<string, string>
): Promise<void> {
  const exception = exceptionReport(error);
  await reportToSentry(bound, {
    message: exception.value,
    tags,
    exception,
  });
}
