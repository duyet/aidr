/**
 * #189 review — the Models used panel must not assert a cause it cannot
 * know.
 *
 * #197 introduced the pre-identity label, but derived it from `stats.tokens`
 * alone. That meant a run whose attempt lookup had *failed* (`error`),
 * was *unsupported* (`unavailable`), or was still in flight (`loading` /
 * `idle`) was told its calls predate run-id tracking — an invented cause,
 * and a direct contradiction of the Attempts panel below it, which was
 * correctly reporting the real lookup state.
 *
 * These tests pin all five states in EN and VI, and check the two panels
 * never disagree.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { RunRow } from "./RunRow";

/** A run that reported tokens but has no run-id-attributed calls. */
const preIdentityRun: WorkflowRunRow = {
  id: "288329e9-2c0b-4abc-9d76-f9fdcc633d84",
  started_at: 1_790_349_075,
  finished_at: 1_790_349_120,
  items_fetched: 178,
  items_new: 18,
  error: null,
  stats: {
    tokens: 13_733,
    bySource: { hn: 20 },
    steps: [
      { name: "fetch", action: "178 items from 20 sources" },
      { name: "score", action: "scored 18 items" },
    ],
  },
};

/** Default is the state the runs tab renders: a completed lookup that
 * returned zero rows for this run id. */
function render(
  run: WorkflowRunRow,
  lang: "en" | "vi",
  extra: Record<string, unknown> = {}
) {
  return renderToStaticMarkup(
    createElement(RunRow, {
      run,
      lang,
      maxDuration: 60,
      expanded: true,
      attemptsState: "empty",
      attempts: [],
      onToggle: () => undefined,
      ...extra,
    })
  );
}

function attempt(overrides: Partial<LlmCallRow> = {}): LlmCallRow {
  return {
    ts: 1_790_349_076_000,
    runId: "attributed-run",
    task: "score",
    model: "anyrouter/auto",
    ok: true,
    tokens: 1_000,
    durationMs: 4_200,
    promptChars: 900,
    promptTokens: 800,
    completionTokens: 200,
    cachedTokens: 0,
    error: null,
    errorCode: null,
    errorStatus: null,
    ...overrides,
  };
}

/** The Models used panel only, so an assertion cannot pass on copy that
 * belongs to a different panel. */
function modelsPanel(html: string, lang: "en" | "vi") {
  const start = html.indexOf(lang === "vi" ? "Mô hình" : "Models used");
  const end = html.indexOf(
    lang === "vi" ? "Lỗi / fallback" : "Errors / fallback"
  );
  return html.slice(start, end);
}

/** The LLM attempts panel only. */
function attemptsPanel(html: string, lang: "en" | "vi") {
  const start = html.indexOf(
    lang === "vi" ? "Các lần gọi LLM" : "LLM attempts"
  );
  return start === -1 ? "" : html.slice(start, html.indexOf("</fieldset>"));
}

const UNAVAILABLE_EN =
  "Model attribution unavailable — per-call model data could not be read for this run.";
const UNAVAILABLE_VI =
  "Không xác định được mô hình — không đọc được dữ liệu mô hình theo từng lần gọi của lần chạy này.";

describe("models disclosure follows the lookup state (#189 review)", () => {
  it("claims pre-identity only after a completed lookup returns zero rows", () => {
    const en = render(preIdentityRun, "en");
    expect(modelsPanel(en, "en")).toContain("No per-run model data.");
    // The Attempts panel may explain the same thing, because both are gated
    // on the same completed-lookup state.
    expect(attemptsPanel(en, "en")).toContain("no per-attempt rows");
  });

  it("says unavailable, not pre-identity, when the lookup is unsupported", () => {
    const en = render(preIdentityRun, "en", { attemptsState: "unavailable" });
    const models = modelsPanel(en, "en");
    expect(models).toContain(UNAVAILABLE_EN);
    expect(models).not.toContain("No per-run model data.");
    expect(models).not.toContain("No model data available.");
    // No cause asserted anywhere.
    expect(en).not.toContain("before per-attempt run identity shipped");
    // The two panels agree.
    expect(attemptsPanel(en, "en")).toContain(
      "Attempt details are unavailable."
    );
  });

  it("says unavailable, not pre-identity, when the lookup failed", () => {
    const en = render(preIdentityRun, "en", { attemptsState: "error" });
    const models = modelsPanel(en, "en");
    expect(models).toContain(UNAVAILABLE_EN);
    expect(models).not.toContain("No per-run model data.");
    expect(models).not.toContain("No model data available.");
    expect(en).not.toContain("before per-attempt run identity shipped");
    expect(attemptsPanel(en, "en")).toContain(
      "Could not load attempt details."
    );
  });

  it("shows a pending state while the lookup is still in flight", () => {
    const en = render(preIdentityRun, "en", { attemptsState: "loading" });
    const models = modelsPanel(en, "en");
    expect(models).toContain("Loading models used…");
    expect(models).not.toContain("No per-run model data.");
    expect(models).not.toContain("No model data available.");
    expect(models).not.toContain(UNAVAILABLE_EN);
    expect(en).not.toContain("before per-attempt run identity shipped");
  });

  it("shows a pending state before any lookup has been attempted", () => {
    const en = render(preIdentityRun, "en", { attemptsState: "idle" });
    expect(modelsPanel(en, "en")).toContain("Loading models used…");
    expect(en).not.toContain("No per-run model data.");
  });

  it("keeps every unavailable and pending state in VI", () => {
    const unavailable = render(preIdentityRun, "vi", {
      attemptsState: "unavailable",
    });
    expect(modelsPanel(unavailable, "vi")).toContain(UNAVAILABLE_VI);
    expect(modelsPanel(unavailable, "vi")).not.toContain(
      "Chưa có dữ liệu mô hình theo lần chạy."
    );
    expect(unavailable).not.toContain("trước khi có định danh lần gọi");

    const loading = render(preIdentityRun, "vi", { attemptsState: "loading" });
    expect(modelsPanel(loading, "vi")).toContain("Đang tải mô hình đã dùng…");
    expect(loading).not.toContain("trước khi có định danh lần gọi");
  });

  it("prefers real models over every state explanation", () => {
    for (const state of ["unavailable", "error", "loading", "idle"] as const) {
      const en = render(preIdentityRun, "en", {
        attemptsState: state,
        attempts: [attempt({ model: "typesafe/jev" })],
      });
      expect(modelsPanel(en, "en")).toContain("typesafe/jev");
      expect(modelsPanel(en, "en")).not.toContain(UNAVAILABLE_EN);
      expect(modelsPanel(en, "en")).not.toContain("No per-run model data.");
    }
  });

  it("prefers run-summary models even while the lookup is loading", () => {
    const attributed: WorkflowRunRow = {
      ...preIdentityRun,
      llm: {
        calls: 4,
        failures: 0,
        tokens: 20_000,
        cachedTokens: null,
        durationMs: 9_000,
        models: ["typesafe/jev"],
        attempts: [],
      },
    };
    for (const state of ["loading", "unavailable", "error"] as const) {
      const en = render(attributed, "en", { attemptsState: state });
      expect(modelsPanel(en, "en")).toContain("typesafe/jev");
      expect(modelsPanel(en, "en")).not.toContain(UNAVAILABLE_EN);
    }
  });

  it("keeps the honest empty state for a run with no LLM activity", () => {
    const noLlm: WorkflowRunRow = {
      ...preIdentityRun,
      stats: { tokens: 0, bySource: { hn: 178 } },
    };
    const en = render(noLlm, "en");
    expect(modelsPanel(en, "en")).toContain("No model data available.");
    expect(modelsPanel(en, "en")).not.toContain("No per-run model data.");
    expect(modelsPanel(en, "en")).not.toContain(UNAVAILABLE_EN);
  });
});

describe("attempt truncation notice (#189 review)", () => {
  it("flags a capped attempt list rather than implying completeness", () => {
    const en = render(preIdentityRun, "en", {
      attemptsState: "ready",
      attempts: [attempt()],
      attemptsTruncated: true,
    });
    expect(attemptsPanel(en, "en")).toContain(
      "Showing the first 2,000 calls for this run."
    );
  });

  it("omits the truncation note when the list is complete", () => {
    const en = render(preIdentityRun, "en", {
      attemptsState: "ready",
      attempts: [attempt()],
      attemptsTruncated: false,
    });
    expect(attemptsPanel(en, "en")).not.toContain(
      "Showing the first 2,000 calls"
    );
  });

  it("keeps the truncation note in VI", () => {
    const vi = render(preIdentityRun, "vi", {
      attemptsState: "ready",
      attempts: [attempt()],
      attemptsTruncated: true,
    });
    expect(attemptsPanel(vi, "vi")).toContain(
      "Chỉ hiển thị 2.000 lần gọi đầu tiên của lần chạy này."
    );
  });
});
