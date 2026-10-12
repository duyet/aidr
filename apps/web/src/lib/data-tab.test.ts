import { describe, expect, it } from "vitest";
import { dataTabSearch, parseDataTab } from "./data-tab";

describe("parseDataTab", () => {
  it("accepts known tabs and the source alias", () => {
    expect(parseDataTab("llm")).toBe("llm");
    expect(parseDataTab("source")).toBe("sources");
    expect(parseDataTab("Sources")).toBe("sources");
    expect(parseDataTab("  admin  ")).toBe("admin");
    expect(parseDataTab("AUDIENCE")).toBe("audience");
    expect(parseDataTab("Trends")).toBe("trends");
    expect(parseDataTab("nope")).toBeUndefined();
    expect(parseDataTab(["admin", "overview"])).toBeUndefined();
    expect(parseDataTab(undefined)).toBeUndefined();
  });
});

describe("dataTabSearch", () => {
  it("keeps pins across a round trip through another tab", () => {
    const onRuns = dataTabSearch("runs", { track: "agent,llm" });
    expect(onRuns).toEqual({ tab: "runs", track: "agent,llm" });
    expect(dataTabSearch("trends", onRuns)).toEqual({
      tab: "trends",
      track: "agent,llm",
    });
    expect(dataTabSearch("overview", onRuns)).toEqual({ track: "agent,llm" });
    expect(dataTabSearch("trends", {})).toEqual({ tab: "trends" });
  });
});
