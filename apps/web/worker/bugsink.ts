import type { AlertEvent } from "./notify/alert.js";
import type { Env } from "./types.js";

export interface SentryReport {
  message: string;
  tags?: Record<string, string>;
  /** When set, the event is an exception issue, not only a message. */
  exception?: { type: string; value: string };
  /** Sentry level; defaults to "error". */
  level?: "info" | "warning" | "error" | "fatal";
  /** Sentry logger; defaults to "aidr.delivery". */
  logger?: string;
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
    level: report.level ?? "error",
    logger: report.logger ?? "aidr.delivery",
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

const SENTRY_LEVEL = {
  info: "info",
  warning: "warning",
  error: "error",
  critical: "fatal",
} as const satisfies Record<
  AlertEvent["severity"],
  NonNullable<SentryReport["level"]>
>;

/** Health-check alert (see `worker/health.ts`), grouped by the `check` tag. */
export async function reportHealthAlert(
  env: Pick<Env, "SENTRY_DSN">,
  event: AlertEvent,
  check: string
): Promise<void> {
  await reportToSentry(env, {
    message: `${event.title}: ${event.summary}`,
    level: SENTRY_LEVEL[event.severity],
    logger: "aidr.health",
    tags: { kind: "health", check, source: event.source },
  });
}

/** What the Workflows engine raises when it interrupts a step itself: a deploy
 * replacing the Durable Object code, a Durable Object that went away under an
 * in-flight call, an internal engine fault, or a step that outran its timeout.
 * The engine retries or replays the step, so none of these is an app bug and
 * none belongs in a Bugsink issue.
 *
 * The value is a short reason, not a tag, because `workflow-step.ts` writes it
 * onto the run's step line — that is where the signal has to land once the
 * Bugsink report is gone. */
const ENGINE_INTERRUPTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /durable object reset because its code was updated/i,
    "durable object code updated",
  ],
  [
    /durable object instance is no longer active/i,
    "durable object instance went away",
  ],
  [/internal workflows error/i, "internal workflows error"],
  [/(?:execution|step) timed out after \d+\s*ms/i, "step timed out"],
];

/** The text to match an interruption against.
 *
 * Deliberately not `String(error)` and not `instanceof Error`: the engine and
 * the Durable Object RPC boundary both hand failures back structured-cloned,
 * so the receiver sees a plain object (`String()` on one is `[object Object]`,
 * `instanceof Error` is false) and the phrase survives only on `.message`.
 * That is why #339 and #340 got through the previous `instanceof`-based
 * filter while the messages were listed in it. */
function interruptionText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error == null) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}

/** Short reason when the engine (not this code) ended the step, else null. */
export function engineInterruptionReason(error: unknown): string | null {
  const text = interruptionText(error);
  if (!text) return null;
  return (
    ENGINE_INTERRUPTIONS.find(([pattern]) => pattern.test(text))?.[1] ?? null
  );
}

/** Exception path used by the ingest workflow. Database rows stay as they are. */
export async function reportPipelineException(
  error: unknown,
  tags: Record<string, string>
): Promise<void> {
  const interruption = engineInterruptionReason(error);
  if (interruption) {
    console.warn(
      `${tags.step ?? "pipeline"}: interrupted by the workflow engine (${interruption})`
    );
    return;
  }
  const exception = exceptionReport(error);
  await reportToSentry(bound, {
    message: exception.value,
    tags,
    exception,
  });
}
