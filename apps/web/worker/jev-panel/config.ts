import type { Env } from "../types.js";
import {
  JEV_PANEL_MIN_MODEL_FAMILIES,
  JEV_PANEL_MIN_QUORUM,
  JEV_PANEL_MIN_ROLES,
  type JevJudgeSlot,
  type JevModelIdentity,
  type JevPanelConfig,
  type JevRole,
} from "./core.js";

/**
 * Env -> `JevPanelConfig` for the scoring call site.
 *
 * The panel is off unless `JEV_PANEL_ENABLED` is set. A config that cannot
 * supply genuine model diversity never reaches the core: a second slot
 * pointing at the same model, or at the same vendor family, is refused here
 * with a reason instead of spending judge calls that the core would reject
 * anyway.
 */

/** What happens to an item when the panel cannot reach a decision. */
export type JevPanelFailMode = "open" | "closed";

export interface JevPanelWorkflowConfig {
  readonly enabled: boolean;
  /** Null when disabled or unresolvable. Never a partially-built panel. */
  readonly panel: JevPanelConfig | null;
  /**
   * Honoured for a *runtime* panel failure (no quorum, tie, human review).
   * A config that cannot be resolved is always treated as a misconfiguration
   * and degrades open, so a typo can never reject a whole ingest run.
   */
  readonly failMode: JevPanelFailMode;
  /** Why the panel is off, or why `panel` is null while `enabled` is true. */
  readonly reason: string;
  /** Per-role model chains the transport adapter walks, in slot order. */
  readonly chains: readonly (readonly string[])[];
}

const TRUTHY = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSY = new Set(["0", "false", "no", "off", "disabled", ""]);

/** Matches the concrete-model-id rule already used by translation QA. */
const CONCRETE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/** anyrouter's own router. It is not a model, so it cannot be a judge. */
const ROUTER_ALIASES = new Set([
  "anyrouter/auto",
  "auto",
  "anyrouter/auto:free",
]);

/** Roles the scoring panel always seats. */
export const JEV_PANEL_SLOT_ROLES = ["relevance", "source_quality"] as const;

/**
 * Which call site a panel serves. `score` reviews feed scoring; `translation`
 * reviews a translated title/summary against its source.
 */
export type JevPanelPurpose = "score" | "translation";

type JevPanelModelEnvKey =
  | "JEV_PANEL_RELEVANCE_MODEL"
  | "JEV_PANEL_SOURCE_QUALITY_MODEL"
  | "JEV_PANEL_SAFETY_MODEL"
  | "JEV_PANEL_TRANSLATION_FIDELITY_MODEL";

/** Env key for each role's model chain. */
export const JEV_PANEL_ROLE_ENV_KEY: Record<JevRole, JevPanelModelEnvKey> = {
  relevance: "JEV_PANEL_RELEVANCE_MODEL",
  source_quality: "JEV_PANEL_SOURCE_QUALITY_MODEL",
  safety: "JEV_PANEL_SAFETY_MODEL",
  translation_fidelity: "JEV_PANEL_TRANSLATION_FIDELITY_MODEL",
};

/**
 * Seats per purpose. Required roles must be configured or the panel is
 * refused; an optional role joins the panel only when its model is set.
 * `safety` is an optional third judge on scoring and a required seat on
 * translation, where it is the second opinion next to fidelity.
 */
const PURPOSE_ROLES: Record<
  JevPanelPurpose,
  {
    readonly required: readonly JevRole[];
    readonly optional: readonly JevRole[];
  }
> = {
  score: { required: JEV_PANEL_SLOT_ROLES, optional: ["safety"] },
  translation: { required: ["translation_fidelity", "safety"], optional: [] },
};

export function parseJevPanelChain(spec: string | undefined): string[] {
  return (spec ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

/**
 * Vendor family for the core's `minDistinctModelFamilies` gate: the segment
 * before the first `/`, lowercased. Ids with no `/` are their own family, so
 * `claude-opus-4-5` and `gpt-5.2` never collapse into one family.
 */
export function jevPanelModelFamily(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash > 0
    ? modelId.slice(0, slash).toLowerCase()
    : modelId.toLowerCase();
}

function isConcreteJudgeModel(model: string): boolean {
  return (
    CONCRETE_MODEL_ID.test(model) && !ROUTER_ALIASES.has(model.toLowerCase())
  );
}

function boundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number((raw ?? "").trim());
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** `enabled` stays true so the caller can report an unusable config. */
function unusable(
  failMode: JevPanelFailMode,
  reason: string
): JevPanelWorkflowConfig {
  return { enabled: true, panel: null, failMode, reason, chains: [] };
}

function disabled(reason: string): JevPanelWorkflowConfig {
  return {
    enabled: false,
    panel: null,
    failMode: "open",
    reason,
    chains: [],
  };
}

export function resolveJevPanelWorkflowConfig(
  env: Pick<
    Env,
    | "JEV_PANEL_ENABLED"
    | JevPanelModelEnvKey
    | "JEV_PANEL_QUORUM"
    | "JEV_PANEL_DEBATE"
    | "JEV_PANEL_FAIL_MODE"
  >,
  /**
   * Categories a judge may name. Passed in rather than imported so this
   * module stays free of an `llm.ts` cycle; a non-empty list makes an
   * off-enum category an invalid judgment instead of a bogus value.
   */
  categoryOptions: readonly string[] = [],
  purpose: JevPanelPurpose = "score"
): JevPanelWorkflowConfig {
  const flag = (env.JEV_PANEL_ENABLED ?? "").trim().toLowerCase();
  if (FALSY.has(flag)) {
    return disabled("JEV_PANEL_ENABLED is off");
  }
  if (!TRUTHY.has(flag)) {
    return disabled("JEV_PANEL_ENABLED is not set");
  }

  const failMode: JevPanelFailMode =
    (env.JEV_PANEL_FAIL_MODE ?? "").trim().toLowerCase() === "closed"
      ? "closed"
      : "open";

  const chainFor = (role: JevRole) =>
    parseJevPanelChain(env[JEV_PANEL_ROLE_ENV_KEY[role]]);
  const seats = PURPOSE_ROLES[purpose];
  const unconfigured = seats.required.find((role) => !chainFor(role)[0]);
  if (unconfigured) {
    return unusable(
      failMode,
      `${JEV_PANEL_ROLE_ENV_KEY[unconfigured]} is not configured`
    );
  }
  const roles: JevRole[] = [
    ...seats.required,
    ...seats.optional.filter((role) => chainFor(role).length > 0),
  ];
  const chains = roles.map(chainFor);
  const primary = chains.map((chain) => chain[0] ?? "");
  const nonConcrete = primary.findIndex(
    (model) => !isConcreteJudgeModel(model)
  );
  if (nonConcrete !== -1) {
    return unusable(
      failMode,
      `${JEV_PANEL_ROLE_ENV_KEY[roles[nonConcrete]]} is not a concrete model id`
    );
  }
  // A router alias or a duplicated model id would make a second vote a copy
  // of the first, which is exactly the fabricated diversity this panel exists
  // to prevent. Every seat must be its own model.
  if (new Set(primary).size !== primary.length) {
    return unusable(failMode, "two judge roles resolve to the same model id");
  }
  // The required seats must span distinct vendor families. An optional seat
  // may share a vendor with one of them (it is still a distinct model), but
  // it can never be what satisfies the family gate.
  const families = primary.map(jevPanelModelFamily);
  const required = seats.required.length;
  if (new Set(families.slice(0, required)).size < required) {
    return unusable(
      failMode,
      "two required judge roles resolve to the same model family"
    );
  }

  const prefix = purpose === "score" ? "score" : "translate";
  const panelId = `${prefix}-${[...new Set(families)].join("+")}`;
  const slots: JevJudgeSlot[] = roles.map((role, index) => ({
    id: role,
    role,
    promptKey: `${prefix}.${role}.v1`,
    model: jevPanelModelIdentity(primary[index]),
  }));

  const panel: JevPanelConfig = {
    panelId,
    judges: slots,
    quorum: boundedInt(
      env.JEV_PANEL_QUORUM,
      JEV_PANEL_MIN_QUORUM,
      JEV_PANEL_MIN_QUORUM,
      slots.length
    ),
    categoryOptions: [...categoryOptions],
    minDistinctModelFamilies: JEV_PANEL_MIN_MODEL_FAMILIES,
    minDistinctRoles: JEV_PANEL_MIN_ROLES,
    debate: {
      maxRounds: (env.JEV_PANEL_DEBATE ?? "").trim() === "1" ? 1 : 0,
      disagreementThreshold: 0.5,
    },
  };

  return { enabled: true, panel, failMode, reason: "", chains };
}

/**
 * Version label carried by both the configured identity and the identity the
 * adapter reports. The gateway exposes no separate model version, so this slot
 * names the transport instead of inventing one. It is deliberately the same
 * string on both sides: the core compares the full identity, so a mismatch
 * here would silently drop every vote. The `id` still has to match, which is
 * what makes the mismatch check meaningful.
 */
export const JEV_PANEL_MODEL_VERSION_LABEL = "anyrouter";

/**
 * Configured identity for audit. The transport adapter reports the model that
 * actually served the completion, and the core rejects the slot when the two
 * disagree — so this label is never a stand-in for an observed model.
 */
export function jevPanelModelIdentity(modelId: string): JevModelIdentity {
  return {
    family: jevPanelModelFamily(modelId),
    id: modelId,
    version: JEV_PANEL_MODEL_VERSION_LABEL,
  };
}
