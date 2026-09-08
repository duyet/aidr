import { describe, expect, it } from "vitest";
import { parseDataTab } from "./data-tab";

describe("parseDataTab", () => {
  it("accepts known tabs and the source alias", () => {
    expect(parseDataTab("llm")).toBe("llm");
    expect(parseDataTab("source")).toBe("sources");
    expect(parseDataTab("Sources")).toBe("sources");
    expect(parseDataTab("nope")).toBeUndefined();
    expect(parseDataTab(undefined)).toBeUndefined();
  });
});
