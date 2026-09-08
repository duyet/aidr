import { describe, expect, it } from "vitest";
import { llmsTxt, llmsTxtResponse } from "./llms-txt";
import { SITE_URL } from "./site";

describe("llmsTxt", () => {
  it("names aidr.today and how agents consume, submit, and suggest", () => {
    const body = llmsTxt();
    expect(body).toContain("aidr.today");
    expect(body).toContain(`${SITE_URL}/api/public`);
    expect(body).toContain(`${SITE_URL}/api/mcp`);
    expect(body).toContain(`${SITE_URL}/submit`);
    expect(body).toContain('"via": "agent"');
    expect(body).toContain("item_id");
    expect(body).toContain("suggestion");
    expect(body).toContain("Do not scrape HN");
  });
});

describe("llmsTxtResponse", () => {
  it("returns 200 plain text", async () => {
    const res = llmsTxtResponse();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(80);
    expect(text).toContain("aidr.today");
  });
});
