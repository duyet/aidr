/** Public GA4 measurement ID (client id, not a secret). */
export const DEFAULT_GA_MEASUREMENT_ID = "G-HXJPPQVYQN";

export function resolveMeasurementId(envId?: string | null): string {
  const trimmed = typeof envId === "string" ? envId.trim() : "";
  return trimmed || DEFAULT_GA_MEASUREMENT_ID;
}

const importMetaEnv =
  typeof import.meta !== "undefined"
    ? ((import.meta as unknown as Record<string, unknown>).env as
        | Record<string, string>
        | undefined)
    : undefined;

/**
 * The GA4 stream every app event goes to. The Cloudflare tag gateway
 * configures its own id on the page before the app runs (#703), so the app
 * configures this one explicitly and names it in each event's `send_to`;
 * without it gtag sends an event to every configured id.
 */
export const GA_MEASUREMENT_ID = resolveMeasurementId(
  importMetaEnv?.VITE_MEASUREMENT_ID
);
