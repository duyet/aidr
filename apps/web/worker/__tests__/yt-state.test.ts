import { describe, expect, it } from "vitest";
import { ytDelete, ytGet, ytPut } from "../yt-state.js";
import { ytStore } from "./yt-state-fake.js";

const NOW = Date.UTC(2026, 10, 25, 12);

describe("yt-state", () => {
  // Defect: a cached access token or a nonce read after its TTL, which KV
  // dropped on its own and a plain table does not.
  it("reads a row only until its expiry", async () => {
    const { db } = ytStore();
    await ytPut(db, "yt:access", "token", NOW, 60);
    expect(await ytGet(db, "yt:access", NOW + 59_999)).toBe("token");
    expect(await ytGet(db, "yt:access", NOW + 60_000)).toBeNull();
  });

  it("keeps a row without a TTL and overwrites in place", async () => {
    const { db, data } = ytStore();
    await ytPut(db, "yt:refresh", "one", NOW);
    await ytPut(db, "yt:refresh", "two", NOW + 1);
    expect(await ytGet(db, "yt:refresh", NOW + 365 * 24 * 3600 * 1000)).toBe(
      "two"
    );
    expect(data.values()).toEqual(["two"]);
    expect(data.expiresAt("yt:refresh")).toBeNull();
  });

  // Defect: expired nonces and dedupe marks piling up, as KV never did.
  it("deletes expired rows on write", async () => {
    const { db, data } = ytStore();
    await ytPut(db, "yt:link:a", "1", NOW, 10);
    await ytPut(db, "yt:status", "{}", NOW);
    await ytPut(db, "yt:other", "x", NOW + 11_000);
    expect(data.has("yt:link:a")).toBe(false);
    expect(data.has("yt:status")).toBe(true);
  });

  // Defect: one single-use nonce passing twice when two callbacks race.
  it("lets exactly one of two racing deletes win", async () => {
    const { db } = ytStore();
    await ytPut(db, "yt:state:n", "1", NOW, 900);
    const [a, b] = await Promise.all([
      ytDelete(db, "yt:state:n", NOW),
      ytDelete(db, "yt:state:n", NOW),
    ]);
    expect([a, b].sort()).toEqual([false, true]);
  });

  it("does not burn an expired nonce as if it were valid", async () => {
    const { db } = ytStore();
    await ytPut(db, "yt:state:n", "1", NOW, 900);
    expect(await ytDelete(db, "yt:state:n", NOW + 900_000)).toBe(false);
  });
});
