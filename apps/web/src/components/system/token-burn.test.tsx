/** @vitest-environment happy-dom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LlmDayModelCount,
  LlmDayTaskCount,
  SystemLlm,
} from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { tooltipSeriesTotal } from "../dither-kit/tooltip";
import { TokenBurnSection } from "./DitherCharts";
import { TokenBurnCard } from "./TokenBurnCard";
import {
  amountsForDate,
  buildTokenBurn,
  dateAtHover,
  modelSeries,
  rowsForBurn,
} from "./token-burn";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

/** The dither canvas needs layout measurement happy-dom does not provide.
 *  These tests pin the series handed to the chart and the table under it. */
let hover: ((index: number | null) => void) | undefined;
let captured: {
  data: Record<string, unknown>[];
  config: Record<string, { label?: string }>;
} | null = null;

vi.mock("../dither-kit/bar", () => ({ Bar: () => null }));
vi.mock("../dither-kit/grid", () => ({ Grid: () => null }));
vi.mock("../dither-kit/x-axis", () => ({ XAxis: () => null }));
vi.mock("../dither-kit/y-axis", () => ({ YAxis: () => null }));
vi.mock("../dither-kit/tooltip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../dither-kit/tooltip")>();
  return {
    ...actual,
    Tooltip: (props: { labelKey?: string; showTotal?: boolean }) => (
      <div
        data-testid="chart-tooltip"
        data-label-key={props.labelKey ?? ""}
        data-show-total={props.showTotal ? "yes" : "no"}
      />
    ),
  };
});
vi.mock("../dither-kit/bar-chart", () => ({
  BarChart: ({
    data,
    config,
    onHoverChange,
    children,
  }: {
    data: Record<string, unknown>[];
    config: Record<string, { label?: string }>;
    onHoverChange?: (index: number | null) => void;
    children?: ReactNode;
  }) => {
    captured = { data, config };
    hover = onHoverChange;
    return <div data-testid="chart">{children}</div>;
  },
}));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  captured = null;
  hover = undefined;
  mockUseSystemData.mockReset();
});

function taskRow(
  date: string,
  task: string,
  tokens: number,
  calls = 1
): LlmDayTaskCount {
  return { date, task, calls, failures: 0, tokens };
}

function modelRow(
  date: string,
  model: string,
  tokens: number
): LlmDayModelCount {
  return { date, model, calls: 1, failures: 0, tokens };
}

describe("token burn buckets", () => {
  it("merges models that share a display name on the same day", () => {
    const rows = modelSeries([
      modelRow("2026-10-03", "anyrouter/auto", 10),
      modelRow("2026-10-03", "@preset/aidr", 5),
      modelRow("2026-10-04", "anyrouter/auto", 7),
      modelRow("2026-10-03", "typesafe/jev", 3),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        date: "2026-10-03",
        task: "AnyRouter",
        tokens: 15,
        calls: 2,
      }),
      expect.objectContaining({
        date: "2026-10-04",
        task: "AnyRouter",
        tokens: 7,
      }),
      expect.objectContaining({
        date: "2026-10-03",
        task: "Jev",
        tokens: 3,
      }),
    ]);
  });

  it("gives task mode and model mode different series", () => {
    const tasks = [taskRow("2026-10-03", "score", 100)];
    const models = [modelRow("2026-10-03", "typesafe/jev", 100)];
    expect(rowsForBurn("task", tasks, models).map((row) => row.task)).toEqual([
      "score",
    ]);
    expect(rowsForBurn("model", tasks, models).map((row) => row.task)).toEqual([
      "Jev",
    ]);
    expect(rowsForBurn("model", tasks, undefined)).toEqual([]);
  });

  it("keeps the full date and a total that is the sum of that day's series", () => {
    const view = buildTokenBurn([
      taskRow("2026-10-03", "score", 111),
      taskRow("2026-10-03", "translate", 10),
      taskRow("2026-10-04", "score", 500),
    ]);
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.days.map((day) => day.date)).toEqual([
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(view.days[0]?.day).toBe("10-03");
    expect(view.days[0]?.total).toBe(121);
    expect(view.days[0]?.total).toBe(
      tooltipSeriesTotal(
        Object.values(view.days[0].values).map((value) => ({ value }))
      )
    );
    expect(view.days[1]?.total).toBe(500);
    expect(view.totals.score).toBe(611);
    expect(view.totals.translate).toBe(10);
    expect(dateAtHover(view, null)).toBeNull();
    expect(dateAtHover(view, 0)).toBe("2026-10-03");
    expect(dateAtHover(view, 9)).toBeNull();
    expect(amountsForDate(view, null).score).toBe(611);
    expect(amountsForDate(view, "2026-10-03").score).toBe(111);
    expect(amountsForDate(view, "2026-10-03").translate).toBe(10);
    expect(amountsForDate(view, "2026-10-04").translate).toBe(0);
  });
});

describe("TokenBurnSection", () => {
  const rows = [
    taskRow("2026-10-03", "score", 111),
    taskRow("2026-10-03", "translate", 10),
    taskRow("2026-10-04", "score", 500),
  ];

  it("puts the date on the tooltip and totals the hovered bucket", () => {
    render(
      <TokenBurnSection
        data={rows}
        emptyLabel="empty"
        formatValue={(n) => String(n)}
      />
    );
    const tooltip = screen.getByTestId("chart-tooltip");
    expect(tooltip.getAttribute("data-label-key")).toBe("date");
    expect(tooltip.getAttribute("data-show-total")).toBe("yes");
    expect(captured?.data[0]).toMatchObject({
      date: "2026-10-03",
      day: "10-03",
      score: 111,
      translate: 10,
    });
    expect(captured?.data[1]).toMatchObject({ date: "2026-10-04", score: 500 });
    expect(screen.getByText("Last 14 days")).toBeTruthy();
    expect(screen.getByText("611")).toBeTruthy();

    act(() => hover?.(0));
    expect(screen.getByText("2026-10-03")).toBeTruthy();
    expect(screen.getByText("111")).toBeTruthy();
    expect(screen.queryByText("611")).toBeNull();

    act(() => hover?.(null));
    expect(screen.getByText("Last 14 days")).toBeTruthy();
    expect(screen.getByText("611")).toBeTruthy();
  });
});

describe("TokenBurnCard", () => {
  function llm(): SystemLlm {
    return {
      llmCallsPerDay: [
        taskRow("2026-10-03", "score", 111),
        taskRow("2026-10-04", "translate", 40),
      ],
      llmTokensByModel: [
        modelRow("2026-10-03", "typesafe/jev", 80),
        modelRow("2026-10-04", "anyrouter/auto", 20),
      ],
      tokens: { total: 0, avgPerItem: 0, perDay: [] },
    };
  }

  it("switches the chart series between task and model", () => {
    mockUseSystemData.mockReturnValue({ data: llm(), error: false });
    render(<TokenBurnCard />);

    const byTask = screen.getByRole("button", { name: "By Task" });
    const byModel = screen.getByRole("button", { name: "By Model" });
    expect(byTask.getAttribute("aria-pressed")).toBe("true");
    expect(byModel.getAttribute("aria-pressed")).toBe("false");
    expect(byTask.className).toContain("min-h-11");
    expect(byTask.className).toContain("bg-background");
    expect(byModel.className).not.toContain("bg-background");
    expect(Object.keys(captured?.config ?? {})).toEqual(["score", "translate"]);
    expect(screen.getByText("score")).toBeTruthy();

    fireEvent.click(byModel);
    expect(byModel.getAttribute("aria-pressed")).toBe("true");
    expect(byTask.getAttribute("aria-pressed")).toBe("false");
    expect(Object.keys(captured?.config ?? {}).sort()).toEqual([
      "AnyRouter",
      "Jev",
    ]);
    expect(screen.getByText("Jev")).toBeTruthy();
    expect(screen.queryByText("score")).toBeNull();
    expect(
      screen.getByText("Tokens per day by model, stacked (14 days)")
    ).toBeTruthy();
  });
});
