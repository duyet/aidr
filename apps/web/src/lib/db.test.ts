import { describe, expect, it, vi } from "vitest";
import { readSession } from "./db";

function fakeReader(tag: string) {
  return {
    prepare: vi.fn((sql: string) => ({ tag, sql })),
    batch: vi.fn(async () => []),
  };
}

describe("readSession", () => {
  it("returns the withSession() handle so reads hit the session", () => {
    const session = fakeReader("session");
    const raw = fakeReader("raw");
    const db = {
      ...raw,
      withSession: vi.fn(() => session),
    } as unknown as D1Database;

    const reader = readSession(db);
    expect(reader).toBe(session);
    expect(db.withSession).toHaveBeenCalledTimes(1);

    reader.prepare("SELECT 1");
    expect(session.prepare).toHaveBeenCalledWith("SELECT 1");
    expect(raw.prepare).not.toHaveBeenCalled();
  });

  it("falls back to the raw db when withSession is absent", () => {
    // Older/test-fake bindings may not implement withSession — read
    // paths must still work against the plain binding.
    const raw = fakeReader("raw");
    const db = raw as unknown as D1Database;

    const reader = readSession(db);
    expect(reader).toBe(db);

    reader.prepare("SELECT 1");
    expect(raw.prepare).toHaveBeenCalledWith("SELECT 1");
  });

  it("falls back when withSession is present but not callable", () => {
    const raw = fakeReader("raw");
    const db = {
      ...raw,
      withSession: undefined,
    } as unknown as D1Database;

    expect(readSession(db)).toBe(db);
  });
});
