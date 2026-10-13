import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DOC_PATH,
  findCallSites,
  REGENERATE,
  renderEventsDoc,
} from "../../../scripts/analytics-docs";
import { EVENTS } from "./events";

const callSites = findCallSites();

describe("docs/analytics-events.md", () => {
  it("matches the registry and the call sites", () => {
    const committed = readFileSync(DOC_PATH, "utf8");
    expect(
      committed === renderEventsDoc(callSites),
      `docs/analytics-events.md is stale; run \`${REGENERATE}\``
    ).toBe(true);
  });

  it("has a call site for every registry event", () => {
    const unsent = Object.keys(EVENTS).filter((name) => !callSites.has(name));
    expect(unsent).toEqual([]);
  });

  it("finds only registry events at the call sites", () => {
    const unknown = [...callSites.keys()].filter((name) => !(name in EVENTS));
    expect(unknown).toEqual([]);
  });
});
