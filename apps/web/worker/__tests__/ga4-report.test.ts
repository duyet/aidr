import { describe, expect, it } from "vitest";
import {
  ga4DateFromCompact,
  ga4RunReportUrl,
  parseGa4Report,
} from "../ga4/report.js";
import {
  buildGa4Assertion,
  GA4_SCOPE,
  parseGa4ServiceAccount,
} from "../ga4/service-account.js";

/** A structurally valid key file with a real (throwaway) RSA key, generated
 *  once per test file so the signing path is exercised for real rather than
 *  asserted against a stub. */
let cachedKey: Promise<{
  privateKey: string;
  clientEmail: string;
  publicKey: CryptoKey;
}> | null = null;

function testAccount() {
  cachedKey ??= (async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"]
    );
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    const der = new Uint8Array(pkcs8);
    let binary = "";
    for (const byte of der) binary += String.fromCharCode(byte);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----\n`;
    return {
      privateKey: pem,
      clientEmail: "reader@gcp-project.iam.gserviceaccount.com",
      publicKey: pair.publicKey,
    };
  })();
  return cachedKey;
}

function serviceAccountJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "service_account",
    project_id: "gcp-project",
    client_email: "reader@gcp-project.iam.gserviceaccount.com",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
    token_uri: "https://oauth2.googleapis.com/token",
    ...overrides,
  });
}

describe("parseGa4ServiceAccount", () => {
  it("accepts a well-formed key file", () => {
    const account = parseGa4ServiceAccount(serviceAccountJson());
    expect(account?.clientEmail).toBe(
      "reader@gcp-project.iam.gserviceaccount.com"
    );
    expect(account?.privateKey).toContain("PRIVATE KEY");
  });

  it("returns null for absent, empty, and non-JSON values", () => {
    expect(parseGa4ServiceAccount(undefined)).toBeNull();
    expect(parseGa4ServiceAccount(null)).toBeNull();
    expect(parseGa4ServiceAccount("")).toBeNull();
    expect(parseGa4ServiceAccount("   ")).toBeNull();
    expect(parseGa4ServiceAccount("{not json")).toBeNull();
    expect(parseGa4ServiceAccount("[]")).toBeNull();
  });

  it("rejects a credential file that is not a service account", () => {
    // A pasted authorized_user / external_account file parses fine but cannot
    // sign an assertion, so it must read as "not configured", not crash later.
    expect(
      parseGa4ServiceAccount(serviceAccountJson({ type: "authorized_user" }))
    ).toBeNull();
  });

  it("rejects a key file missing its email or private key", () => {
    expect(
      parseGa4ServiceAccount(serviceAccountJson({ client_email: "" }))
    ).toBeNull();
    expect(
      parseGa4ServiceAccount(
        serviceAccountJson({ client_email: "not-an-email" })
      )
    ).toBeNull();
    expect(
      parseGa4ServiceAccount(serviceAccountJson({ private_key: "nope" }))
    ).toBeNull();
    expect(
      parseGa4ServiceAccount(serviceAccountJson({ private_key: undefined }))
    ).toBeNull();
  });
});

describe("buildGa4Assertion", () => {
  it("signs a read-only assertion addressed to the Google token endpoint", async () => {
    const { privateKey, clientEmail } = await testAccount();
    const now = 1_700_000_000;
    const assertion = await buildGa4Assertion({ clientEmail, privateKey }, now);

    const [headerPart, claimsPart, signaturePart] = assertion.split(".");
    expect(headerPart).toBeTruthy();
    expect(signaturePart).toBeTruthy();

    const header = JSON.parse(
      Buffer.from(headerPart ?? "", "base64url").toString("utf8")
    );
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });

    const claims = JSON.parse(
      Buffer.from(claimsPart ?? "", "base64url").toString("utf8")
    );
    expect(claims.iss).toBe(clientEmail);
    expect(claims.scope).toBe(GA4_SCOPE);
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.exp).toBeGreaterThan(claims.iat);
    // Clock skew is subtracted so a Worker a few seconds fast still passes.
    expect(claims.iat).toBe(now - 60);
  });

  it("produces a signature that verifies against the matching public key", async () => {
    const { privateKey, clientEmail, publicKey } = await testAccount();
    const assertion = await buildGa4Assertion(
      { clientEmail, privateKey },
      1_700_000_000
    );
    const [headerPart, claimsPart, signaturePart] = assertion.split(".");
    expect(signaturePart).toMatch(/^[A-Za-z0-9_-]+$/);

    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Buffer.from(signaturePart ?? "", "base64url") as unknown as BufferSource,
      new TextEncoder().encode(
        `${headerPart}.${claimsPart}`
      ) as unknown as BufferSource
    );
    expect(verified).toBe(true);
  });
});

describe("parseGa4Report", () => {
  it("reads the documented response shape", () => {
    const table = parseGa4Report({
      dimensionHeaders: [{ name: "date" }],
      metricHeaders: [{ name: "screenPageViews", type: "TYPE_INTEGER" }],
      rows: [
        {
          dimensionValues: [{ value: "20260901" }],
          metricValues: [{ value: "3242" }],
        },
      ],
      rowCount: 1,
      kind: "analyticsData#runReport",
    });

    expect(table.dimensionHeaders).toEqual(["date"]);
    expect(table.metricHeaders).toEqual(["screenPageViews"]);
    expect(table.rows).toEqual([{ dimensions: ["20260901"], metrics: [3242] }]);
  });

  it("keeps zero as a real value", () => {
    const table = parseGa4Report({
      rows: [
        {
          dimensionValues: [{ value: "20260901" }],
          metricValues: [{ value: "0" }],
        },
      ],
    });
    expect(table.rows[0]?.metrics[0]).toBe(0);
  });

  it("nulls a non-numeric or missing metric instead of storing NaN", () => {
    const table = parseGa4Report({
      rows: [
        {
          dimensionValues: [{ value: "20260901" }],
          metricValues: [{ value: "(not set)" }, {}, { value: "12" }],
        },
      ],
    });
    expect(table.rows[0]?.metrics).toEqual([null, null, 12]);
  });

  it("survives a non-object body, a missing rows array, and junk rows", () => {
    expect(parseGa4Report(null)).toEqual({
      dimensionHeaders: [],
      metricHeaders: [],
      rows: [],
    });
    expect(parseGa4Report("nope").rows).toEqual([]);
    expect(parseGa4Report({ rows: "nope" }).rows).toEqual([]);
    expect(
      parseGa4Report({ rows: [null, 3, { dimensionValues: "x" }] }).rows
    ).toEqual([{ dimensions: [], metrics: [] }]);
  });
});

describe("ga4DateFromCompact", () => {
  it("normalises the YYYYMMDD dimension to the dashboard's date shape", () => {
    expect(ga4DateFromCompact("20260901")).toBe("2026-09-01");
    expect(ga4DateFromCompact("20261231")).toBe("2026-12-31");
  });

  it("rejects anything that is not a compact date", () => {
    expect(ga4DateFromCompact("(other)")).toBeNull();
    expect(ga4DateFromCompact("")).toBeNull();
    expect(ga4DateFromCompact("2026-09-01")).toBeNull();
    expect(ga4DateFromCompact("2026090")).toBeNull();
  });
});

describe("ga4RunReportUrl", () => {
  it("targets the v1beta property endpoint", () => {
    expect(ga4RunReportUrl("123456")).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport"
    );
  });
});
