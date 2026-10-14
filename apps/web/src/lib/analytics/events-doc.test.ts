import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DOC_PATH,
  findCallSites,
  findExtensionCallSites,
  REGENERATE,
  renderEventsDoc,
} from "../../../scripts/analytics-docs";
import { EVENTS, EXTENSION_EVENTS } from "./events";

const callSites = findCallSites();
const extensionSites = findExtensionCallSites();

describe("docs/analytics-events.md", () => {
  it("matches the registry and the call sites", () => {
    const committed = readFileSync(DOC_PATH, "utf8");
    expect(
      committed === renderEventsDoc(callSites, extensionSites),
      `docs/analytics-events.md is stale; run \`${REGENERATE}\``
    ).toBe(true);
  });

  it("has a call site for every registry event", () => {
    const unsent = Object.keys(EVENTS).filter((name) => !callSites.has(name));
    expect(unsent).toEqual([]);
  });

  it("has an extension call site for every extension event, and none unregistered", () => {
    expect([...extensionSites.keys()].sort()).toEqual(
      Object.keys(EXTENSION_EVENTS).sort()
    );
  });

  it("lists every vendor automatic event", () => {
    const committed = readFileSync(DOC_PATH, "utf8");
    for (const event of ["$pageview", "$autocapture", "$exception", "page"]) {
      expect(committed).toContain(`\`${event}\``);
    }
  });

  it("finds only registry events at the call sites", () => {
    const unknown = [...callSites.keys()].filter((name) => !(name in EVENTS));
    expect(unknown).toEqual([]);
  });
});
