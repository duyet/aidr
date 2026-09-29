import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
}));

import type { HealthIssue } from "../health.js";
import {
  AIDR_REPO,
  type AlertContext,
  ANYROUTER_REPO,
  buildIssueBody,
  dailySummaryKey,
  fileGithubIssues,
  fingerprint,
  formatAlertDm,
  formatDailySummary,
  MAX_GITHUB_WRITES_PER_RUN,
  notifyOwner,
  routeRepo,
  sendOwnerDm,
  shouldSendDailySummary,
} from "../owner-alerts.js";

const NOW = Date.UTC(2026, 8, 29, 7, 0, 0);
const llmIssue: HealthIssue = {
  key: "llm-failure-rate",
  severity: "error",
  title: "LLM calls failing",
  detail: "6/8 LLM attempts failed this run",
};
const quietIssue: HealthIssue = {
  key: "telegram-quiet:telegram",
  severity: "warning",
  title: "Telegram channel quiet",
  detail: "telegram: no post for 9h",
};
const ctx: AlertContext = {
  runId: "run-1",
  nowMs: NOW,
  models: [
    { model: "gpt-x", total: 5, failed: 5, statuses: { "404": 5 } },
    { model: "glm", total: 3, failed: 1, statuses: { "502": 1 } },
  ],
  telegramQuietHours: { telegram: 9 },
};

type Call = { url: string; method: string; body?: unknown };

function mockFetch(handler: (c: Call) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call = {
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const out = handler(call);
      if (out instanceof Error) throw out;
      return new Response(JSON.stringify(out ?? {}), { status: 200 });
    })
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("routing and fingerprint", () => {
  it("sends LLM failures to anyrouter and the rest to aidr", () => {
    expect(routeRepo(llmIssue)).toBe(ANYROUTER_REPO);
    expect(routeRepo(quietIssue)).toBe(AIDR_REPO);
  });

  // The fingerprint must name the broken model+status so one outage maps to
  // one issue across runs, instead of a new issue every hour.
  it("fingerprints LLM issues by the worst model and its status", () => {
    expect(fingerprint(llmIssue, ctx)).toBe("llm:model=gpt-x:status=404");
    expect(fingerprint(quietIssue, ctx)).toBe("aidr:telegram-quiet:telegram");
  });
});

describe("formatting", () => {
  it("DM names the problem, evidence, run link and issue URL", () => {
    const text = formatAlertDm([llmIssue, quietIssue], ctx, {
      "llm-failure-rate": "https://github.com/duyet/anyrouter/issues/7",
    });
    expect(text).toContain("needs help");
    expect(text).toContain("gpt-x: 0/5 ok (404×5)");
    expect(text).toContain("telegram: 9h since last post");
    expect(text).toContain("https://aidr.today/data?tab=runs&amp;run=run-1");
    expect(text).toContain("issues/7");
  });

  it("escapes HTML in the DM", () => {
    const text = formatAlertDm([{ ...quietIssue, detail: "<script>&" }], ctx);
    expect(text).toContain("&lt;script&gt;&amp;");
  });

  it("issue body has marker, evidence table, run link and next step", () => {
    const fp = fingerprint(llmIssue, ctx);
    const body = buildIssueBody(llmIssue, ctx, fp);
    expect(body).toContain(`<!-- aidr-alert:${fp} -->`);
    expect(body).toContain("| gpt-x | 0 | 5 | 404×5 |");
    expect(body).toContain("https://aidr.today/data?tab=runs&run=run-1");
    expect(body).toContain("Next step:");
  });

  it("daily summary lists runs, posts, model success and top warnings", () => {
    const text = formatDailySummary({
      date: "2026-09-29",
      runsOk: 23,
      runsFailed: 1,
      itemsNew: 140,
      telegramPosts: { telegram: 6, "telegram-en": 5 },
      models: [{ model: "glm", total: 10, failed: 1, statuses: {} }],
      warnings: { "step-failed": 2, "llm-failure-rate": 1 },
    });
    expect(text).toContain("23 ok, 1 failed");
    expect(text).toContain("New items: 140");
    expect(text).toContain("telegram 6, telegram-en 5");
    expect(text).toContain("glm: 90% (9/10)");
    expect(text).toContain("step-failed ×2, llm-failure-rate ×1");
  });
});

describe("daily summary once per day", () => {
  const run = (alerts: string[]) => ({ startedAtMs: NOW, steps: [], alerts });
  it("sends in the morning window when today's key is absent", () => {
    expect(shouldSendDailySummary(9, "2026-09-29", [])).toBe(true);
    expect(shouldSendDailySummary(8, "2026-09-29", [])).toBe(false);
    expect(shouldSendDailySummary(12, "2026-09-29", [])).toBe(false);
  });
  it("skips when an earlier run already recorded today's key", () => {
    const history = [run([dailySummaryKey("2026-09-29")])];
    expect(shouldSendDailySummary(10, "2026-09-29", history)).toBe(false);
    expect(
      shouldSendDailySummary(10, "2026-09-30", [
        run(["daily-summary:2026-09-29"]),
      ])
    ).toBe(true);
  });
});

describe("side effects", () => {
  it("does nothing without secrets", async () => {
    const calls = mockFetch(() => ({}));
    expect(await sendOwnerDm({}, "hi")).toBe(false);
    expect(await fileGithubIssues({}, [llmIssue], ctx)).toEqual({});
    await notifyOwner({}, [llmIssue], ctx);
    expect(calls).toEqual([]);
  });

  it("creates a labelled issue in the routed repo when none is open", async () => {
    const calls = mockFetch((c) =>
      c.method === "GET"
        ? []
        : {
            number: 1,
            html_url: "https://github.com/duyet/anyrouter/issues/1",
            title: "t",
          }
    );
    const urls = await fileGithubIssues(
      { GITHUB_ALERT_TOKEN: "t" },
      [llmIssue],
      ctx
    );
    expect(urls["llm-failure-rate"]).toContain("anyrouter/issues/1");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe(
      "https://api.github.com/repos/duyet/anyrouter/issues"
    );
    expect(post?.body).toMatchObject({ labels: ["aidr-alert"] });
  });

  it("comments on an existing open issue instead of creating one", async () => {
    const fp = fingerprint(llmIssue, ctx);
    const calls = mockFetch((c) => {
      if (c.url.includes("/comments") && c.method === "GET") return [];
      if (c.method === "GET")
        return [
          {
            number: 7,
            html_url: "u7",
            title: "x",
            body: `<!-- aidr-alert:${fp} -->`,
          },
        ];
      return {};
    });
    const urls = await fileGithubIssues(
      { GITHUB_ALERT_TOKEN: "t" },
      [llmIssue],
      ctx
    );
    expect(urls["llm-failure-rate"]).toBe("u7");
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toContain("/issues/7/comments");
  });

  it("does not comment twice within 24h", async () => {
    const fp = fingerprint(llmIssue, ctx);
    const calls = mockFetch((c) => {
      if (c.url.includes("/comments"))
        return [{ body: `<!-- aidr-alert:${fp} -->` }];
      return [
        {
          number: 7,
          html_url: "u7",
          title: "x",
          body: `<!-- aidr-alert:${fp} -->`,
        },
      ];
    });
    await fileGithubIssues({ GITHUB_ALERT_TOKEN: "t" }, [llmIssue], ctx);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("caps GitHub writes per run", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...quietIssue,
      key: `k${i}`,
    }));
    const calls = mockFetch((c) =>
      c.method === "GET" ? [] : { number: 1, html_url: "u", title: "t" }
    );
    await fileGithubIssues({ GITHUB_ALERT_TOKEN: "t" }, many, ctx);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(
      MAX_GITHUB_WRITES_PER_RUN
    );
  });

  it("swallows GitHub and Telegram failures and still tries the DM", async () => {
    const calls = mockFetch(() => new Error("network down"));
    await expect(
      notifyOwner(
        {
          GITHUB_ALERT_TOKEN: "t",
          TELEGRAM_BOT_TOKEN: "b",
          TELEGRAM_OWNER_CHAT_ID: "1",
        },
        [llmIssue],
        ctx
      )
    ).resolves.toBeUndefined();
    expect(calls.some((c) => c.url.includes("api.telegram.org"))).toBe(true);
  });

  it("never puts the tokens in a request body", async () => {
    const calls = mockFetch((c) =>
      c.method === "GET" ? [] : { number: 1, html_url: "u", title: "t" }
    );
    await notifyOwner(
      {
        GITHUB_ALERT_TOKEN: "ghp_secret",
        TELEGRAM_BOT_TOKEN: "b",
        TELEGRAM_OWNER_CHAT_ID: "1",
      },
      [llmIssue],
      ctx
    );
    for (const c of calls)
      expect(JSON.stringify(c.body ?? "")).not.toContain("ghp_secret");
  });
});
