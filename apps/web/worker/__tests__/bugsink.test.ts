import { describe, expect, it } from "vitest";
import { bugsinkEnvelope } from "../bugsink";

describe("bugsink envelope", () => {
  it("posts a delivery failure to the project envelope endpoint", () => {
    const built = bugsinkEnvelope(
      "https://public-key@duyet.bugsink.com/2",
      "telegram digest failed",
      { channel: "telegram" }
    );
    expect(built?.url).toBe("https://duyet.bugsink.com/api/2/envelope/");
    expect(built?.key).toBe("public-key");
    const lines = built?.body.split("\n") ?? [];
    expect(JSON.parse(lines[1] ?? "").type).toBe("event");
    const event = JSON.parse(lines[2] ?? "");
    expect(event.message.formatted).toBe("telegram digest failed");
    expect(event.tags.channel).toBe("telegram");
    expect(built?.body).not.toContain("public-key");
  });

  it("ignores a DSN that is not a URL", () => {
    expect(bugsinkEnvelope("not a dsn", "x", {})).toBeNull();
  });
});
