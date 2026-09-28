/**
 * The resolver is injected so the verdicts can be exercised without a Start
 * build. The id set mirrors the shape the production bundle generates: sha256
 * hex in build, base64url in dev.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  _setServerFnResolverForTests,
  classifyServerFnPath,
  isRegisteredServerFnId,
} from "./server-fn-registry";

/**
 * The production id shape: 64 lowercase hex characters, what Start's compiler
 * emits for a built server function. Assembled rather than pasted so this file
 * carries no high-entropy literal; the real `submitStory` id is exercised
 * end-to-end against the built bundle in `server-server-fn.test.ts` and in the
 * workerd smoke.
 */
const SHA256_SHAPE_ID = "deadbeef".repeat(8);

/** A real dev id: base64url of the encoded module specifier and export name. */
const DEV_ID = Buffer.from(
  JSON.stringify({
    file: "/src/lib/submit-fn.ts",
    export: "submitStory_createServerFn_handler",
  }),
  "utf8"
).toString("base64url");

const KNOWN = new Set([SHA256_SHAPE_ID, DEV_ID]);

/** Safe charset, well-shaped, absent from the manifest. */
const UNREGISTERED = "notAFunctionId";

/** Stand in for Start's generated manifest lookup. */
function resolverOver(ids: Iterable<string>) {
  const set = new Set(ids);
  return (id: string) =>
    set.has(id)
      ? Promise.resolve({ handler: () => undefined })
      : Promise.reject(new Error(`Server function info not found for ${id}`));
}

afterEach(() => {
  _setServerFnResolverForTests(undefined);
});

describe("isRegisteredServerFnId", () => {
  it("accepts real production and dev ids", async () => {
    _setServerFnResolverForTests(resolverOver(KNOWN));
    expect(await isRegisteredServerFnId(SHA256_SHAPE_ID)).toBe(true);
    expect(await isRegisteredServerFnId(DEV_ID)).toBe(true);
  });

  it("rejects a stale or renamed id that no longer exists", async () => {
    _setServerFnResolverForTests(resolverOver(KNOWN));
    // A renamed function keeps its old id in an already-served client bundle
    // until the bundle is replaced. The manifest no longer has it.
    const staleId = "a".repeat(64);
    expect(await isRegisteredServerFnId(staleId)).toBe(false);
  });

  it("rejects Object.prototype members by own-property check, not by throw", async () => {
    // These keys satisfy the id charset, and the generated resolver reads
    // `manifest[id]`, so each one passes its "not found" guard and only fails
    // later on `importer()`. The verdict here must be the resolver never being
    // consulted at all, so it cannot depend on how that lookup is written.
    let consulted = false;
    _setServerFnResolverForTests(() => {
      consulted = true;
      return Promise.reject(new Error("should not be reached"));
    });

    for (const id of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString",
      "__proto__",
    ]) {
      expect(Object.hasOwn(Object.prototype, id)).toBe(true);
      expect(await isRegisteredServerFnId(id)).toBe(false);
      expect(await classifyServerFnPath(`/_serverFn/${id}`)).toBe("unknown");
    }
    expect(consulted).toBe(false);
  });

  it("declines to answer when the resolver is unavailable", async () => {
    _setServerFnResolverForTests(null);
    expect(await isRegisteredServerFnId(SHA256_SHAPE_ID)).toBe(null);
  });
});

describe("classifyServerFnPath", () => {
  it("reports ok for registered ids", async () => {
    _setServerFnResolverForTests(resolverOver(KNOWN));
    expect(await classifyServerFnPath(`/_serverFn/${SHA256_SHAPE_ID}`)).toBe(
      "ok"
    );
    expect(await classifyServerFnPath(`/_serverFn/${DEV_ID}`)).toBe("ok");
  });

  it("reports unknown for well-formed ids outside the manifest", async () => {
    _setServerFnResolverForTests(resolverOver(KNOWN));
    expect(await classifyServerFnPath(`/_serverFn/${"b".repeat(64)}`)).toBe(
      "unknown"
    );
    // A well-shaped segment the manifest does not hold.
    expect(await classifyServerFnPath(`/_serverFn/${UNREGISTERED}`)).toBe(
      "unknown"
    );
  });

  it("reports malformed without consulting the resolver", async () => {
    let consulted = false;
    _setServerFnResolverForTests(() => {
      consulted = true;
      return Promise.resolve(undefined);
    });
    for (const path of [
      "/_serverFn/",
      "/_serverFn//",
      "/_serverFn/abc/extra",
      "/_serverFn/..%2f..%2fadmin",
      "/_serverFn/%2e%2e%2fadmin",
      `/_serverFn/${"a".repeat(201)}`,
    ]) {
      expect(await classifyServerFnPath(path)).toBe("malformed");
    }
    expect(consulted).toBe(false);
  });

  it("defers to Start when the resolver cannot answer", async () => {
    // A registry that cannot be loaded must never turn a working RPC call
    // into a 404, so a real id stays unchecked.
    _setServerFnResolverForTests(null);
    expect(await classifyServerFnPath(`/_serverFn/${SHA256_SHAPE_ID}`)).toBe(
      "unchecked"
    );
  });

  it("reports malformed for the bare base with or without its slash", async () => {
    // Neither carries an id. They must not fall through to Start, which would
    // answer the exact base as an ordinary unknown route and hand back a
    // document for a request that claimed to be RPC.
    _setServerFnResolverForTests(resolverOver(KNOWN));
    expect(await classifyServerFnPath("/_serverFn")).toBe("malformed");
    expect(await classifyServerFnPath("/_serverFn/")).toBe("malformed");
  });

  it("defers for paths that are not the transport at all", async () => {
    _setServerFnResolverForTests(resolverOver(KNOWN));
    expect(await classifyServerFnPath("/deadbeef")).toBe("unchecked");
    expect(await classifyServerFnPath("/_serverFnx/abc")).toBe("unchecked");
    expect(await classifyServerFnPath("/_serverFnx")).toBe("unchecked");
  });
});
