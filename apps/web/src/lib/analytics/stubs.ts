/**
 * Synchronous vendor queue stubs, installed before React hydrates.
 *
 * `track()` writes to `window.gtag` and `window.posthog.capture`. Both
 * vendors ship a stub that queues calls until their script loads: gtag
 * pushes into `window.dataLayer`, and the PostHog snippet turns
 * `window.posthog` into an array of `[method, ...args]` plus `_i`, the
 * queued `init` calls, which array.js replays via `init_from_snippet`. This
 * module ports those stubs so the network scripts can stay deferred past
 * the LCP paint (`afterLcpPaint`) while hydrate-time events still land.
 */

import { GA_MEASUREMENT_ID } from "./measurement-id";
import { maskRecordedRequest, scrubPosthogEvent } from "./url-privacy";

export const POSTHOG_STUB_METHODS =
  "capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(
    " "
  );

export type PosthogStubConfig = {
  token: string;
  host: string;
};

export type AnalyticsStubOptions = {
  posthog?: PosthogStubConfig;
};

type QueuedCall = unknown[];

/** The shape array.js expects to find at `window.posthog` on load. */
export type PosthogStub = QueuedCall[] & {
  __SV?: number;
  _i: [string, object, string][];
  init: (token: string, config: object, name?: string) => void;
  people: QueuedCall[] & { toString: () => string };
  toString: (stub?: number) => string;
  [method: string]: unknown;
};

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  posthog?: PosthogStub | { __SV?: number };
};

export function posthogArrayScriptUrl(host: string): string {
  return `${host.replace(".i.posthog.com", "-assets.i.posthog.com")}/static/array.js`;
}

function hasConfig(dataLayer: unknown[], measurementId: string): boolean {
  return dataLayer.some((entry) => {
    const args = entry as ArrayLike<unknown> | null;
    return args?.[0] === "config" && args[1] === measurementId;
  });
}

/**
 * The Cloudflare tag gateway defines `gtag` and configures its own id before
 * this runs (#703). Reusing its queue is fine, but the app's id still needs
 * its own `config`, or no event of ours ever reaches it.
 */
function installGtagStub(w: AnalyticsWindow): void {
  w.dataLayer = w.dataLayer || [];
  const dataLayer = w.dataLayer;
  if (typeof w.gtag !== "function") {
    // gtag.js only replays `arguments` objects from dataLayer; a plain array
    // is ignored, so this cannot be an arrow with rest args.
    w.gtag = function gtag() {
      // biome-ignore lint/complexity/noArguments: see above
      dataLayer.push(arguments);
    };
    w.gtag("js", new Date());
  }
  if (!hasConfig(dataLayer, GA_MEASUREMENT_ID)) {
    w.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
  }
}

/** Port of the PostHog snippet, minus the script tag `init` would inject. */
function installPosthogStub(w: AnalyticsWindow, cfg: PosthogStubConfig): void {
  if (w.posthog?.__SV) return;
  const stub = (w.posthog || []) as PosthogStub;
  w.posthog = stub;
  stub._i = [];
  stub.init = (token, config, name) => {
    let target = stub;
    let instanceName = name;
    if (instanceName !== undefined) {
      target = stub[instanceName] = [] as unknown as PosthogStub;
    } else {
      instanceName = "posthog";
    }
    target.people = target.people || ([] as unknown as PosthogStub["people"]);
    target.toString = (asStub?: number) => {
      let label = "posthog";
      if (instanceName !== "posthog") label += `.${instanceName}`;
      if (!asStub) label += " (stub)";
      return label;
    };
    target.people.toString = () => `${target.toString(1)}.people (stub)`;
    for (const method of POSTHOG_STUB_METHODS) {
      let holder: Record<string, unknown> = target;
      let key = method;
      const parts = method.split(".");
      if (parts.length === 2) {
        holder = target[parts[0]] as Record<string, unknown>;
        key = parts[1];
      }
      const queue = holder as unknown as QueuedCall[];
      holder[key] = (...args: unknown[]) => {
        queue.push([key, ...args]);
      };
    }
    stub._i.push([token, config, instanceName]);
  };
  stub.__SV = 1;
  stub.init(cfg.token, {
    api_host: cfg.host,
    defaults: "2026-05-30",
    capture_exceptions: true,
    before_send: scrubPosthogEvent,
    session_recording: { maskCapturedNetworkRequestFn: maskRecordedRequest },
  });
}

/**
 * Idempotent. Safe to call at module init on the client and again from a
 * remount; a second call finds the stubs (or the loaded vendors) and leaves
 * them alone, so nothing is configured or queued twice.
 */
export function installAnalyticsStubs(options: AnalyticsStubOptions): void {
  if (typeof window === "undefined") return;
  const w = window as AnalyticsWindow;
  installGtagStub(w);
  if (options.posthog) installPosthogStub(w, options.posthog);
}
