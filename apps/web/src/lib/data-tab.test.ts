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
  it("keeps pins only while switching to the Trends tab", () => {
    const current = { tab: "runs" as const, track: "agent,llm" };
    expect(dataTabSearch("trends", current)).toEqual({
      tab: "trends",
      track: "agent,llm",
    });
    expect(dataTabSearch("runs", current)).toEqual({ tab: "runs" });
    expect(dataTabSearch("overview", current)).toEqual({});
    expect(dataTabSearch("trends", {})).toEqual({ tab: "trends" });
  });
});
