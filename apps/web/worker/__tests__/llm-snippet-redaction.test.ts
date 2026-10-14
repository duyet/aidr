import { describe, expect, it } from "vitest";
import { type LlmCallLogEntry, redactLlmCallEntry } from "../llm.js";
import { sanitizeLlmSnippet, sanitizeText } from "../telemetry-safe.js";
import {
  API_KEY,
  BEARER,
  fakeArKey,
  fakeAwsKeyId,
  fakeAwsSecret,
  fakeBase64Blob,
  fakeBody,
  fakeGithubToken,
  fakeGoogleKey,
  fakeJwt,
  fakeSkKey,
  X_API_KEY,
} from "./fake-secrets.js";

const arKey = fakeArKey();
const shortKey = `zz${fakeBody(10)}`;
const longArKey = fakeArKey(36);
const digitlessKey = "AbCd".repeat(8);
const projKey = fakeSkKey("proj");
const antKey = fakeSkKey("ant");
const orKey = fakeSkKey("or", 64);
const githubToken = fakeGithubToken();
const googleKey = fakeGoogleKey();
const awsKeyId = fakeAwsKeyId();
const awsSecret = fakeAwsSecret();
const jwt = fakeJwt();
const jwtShortSig = fakeJwt(3);
const hexToken = "9f86d081".repeat(8);
const blob = fakeBase64Blob();
const opaque = "AbCdEfGhIjKlMnOp".repeat(3);
const sessionValue = fakeBody(12);
const reqId = `req_${"01HZY8K2".repeat(3)}`;

/**
 * `llm_calls.response_snippet` keeps provider error bodies and rejected model
 * output. Each case below is a body a provider or model can return; `leaks`
 * are the substrings that must never reach D1. Cases from the #748 verifier
 * fuzz run. Secret-shaped values come from `fake-secrets.ts`.
 */
const LEAK_CASES: Record<
  string,
  { input: string; leaks: string[]; keeps?: string[] }
> = {
  bearerAr: {
    input: `Authorization: ${BEARER} ${arKey}`,
    leaks: [arKey],
  },
  bearerHeaderJson: {
    input: JSON.stringify({ headers: { Authorization: `${BEARER} ${arKey}` } }),
    leaks: [arKey],
  },
  apiKeyJson: {
    input: JSON.stringify({
      error: { message: "Invalid key", [API_KEY]: arKey },
    }),
    leaks: [arKey],
    keeps: ["Invalid key"],
  },
  apiKeyJsonSpace: {
    input: `{"error":{"message":"bad", "${API_KEY}" : "${shortKey}"}}`,
    leaks: [shortKey],
  },
  xApiKey: { input: `${X_API_KEY}: ${arKey}`, leaks: [arKey] },
  xApiKeyJson: { input: `"${X_API_KEY}":"${arKey}"`, leaks: [arKey] },
  xApiKeyJsonDigitless: {
    input: JSON.stringify({ [X_API_KEY]: digitlessKey }),
    leaks: [digitlessKey],
  },
  longKeyJson: {
    input: JSON.stringify({ [API_KEY]: longArKey }),
    leaks: [longArKey.slice(6, 22)],
  },
  bearerJsonSpaced: {
    input: `{"Authorization": "${BEARER} abcDEF"}`,
    leaks: ["abcDEF"],
  },
  bearerLower: {
    input: `authorization=${BEARER.toLowerCase()} abc.def.ghi`,
    leaks: ["abc.def.ghi"],
  },
  splitNewline: {
    input: `${API_KEY}:\n  ${fakeArKey(8)}`,
    leaks: [fakeArKey(8).slice(6)],
  },
  passwordColon: { input: "password = hunter2", leaks: ["hunter2"] },
  tokenEqUrlencoded: {
    input: `access_token%3D${fakeBody(12)}`,
    leaks: [fakeBody(12)],
  },
  skProj: {
    input: `key ${projKey} was rejected`,
    leaks: [projKey.slice(8)],
  },
  skAnt: { input: antKey, leaks: [antKey.slice(7)] },
  skOr: { input: orKey, leaks: [orKey.slice(6, 22)] },
  ghToken: { input: githubToken, leaks: [githubToken.slice(4, 20)] },
  googleKey: { input: googleKey, leaks: [googleKey.slice(0, 6)] },
  awsKey: {
    input: `${awsKeyId} and secret ${awsSecret}`,
    leaks: [awsKeyId, awsSecret.slice(0, 12), awsSecret.slice(-12)],
  },
  jwt: { input: `token ${jwt}`, leaks: [jwt.slice(0, 8), jwt.slice(-12)] },
  jwtShortSig: { input: jwtShortSig, leaks: [jwtShortSig.slice(0, 8)] },
  hexToken: { input: `request id ${hexToken}`, leaks: [hexToken.slice(0, 16)] },
  base64Keyed: {
    input: `payload: ${blob}`,
    leaks: [blob.slice(0, 8), "=="],
  },
  base64Bare: { input: `blob ${blob} end`, leaks: [blob.slice(0, 8), "=="] },
  opaqueNoDigit: { input: opaque, leaks: [opaque.slice(0, 8)] },
  accountIds: {
    input:
      '{"error":{"message":"Insufficient credits","metadata":{"account_id":"acct_7Hc2LmQ9xZ","user_id":"user_2abcDEF","org_id":"org-123abc"}}}',
    leaks: ["acct_7Hc2LmQ9xZ", "user_2abcDEF", "org-123abc"],
    keeps: ["Insufficient credits"],
  },
  requestId: { input: `request_id: ${reqId}`, leaks: [reqId.slice(4, 16)] },
  bareReqId: {
    input: `failed (${reqId}) retry`,
    leaks: [reqId.slice(4, 16)],
  },
  setCookie: {
    input: `Set-Cookie: __session=${sessionValue}; Path=/`,
    leaks: [sessionValue],
  },
  cookie: {
    input: `Cookie: cf_clearance=${sessionValue}; theme=dark`,
    leaks: [sessionValue],
  },
  ipv4: {
    input: "upstream 10.0.12.34:8443 connection refused",
    leaks: ["10.0.12.34"],
  },
  ipv6: { input: "connect to [2001:db8::1]:443 failed", leaks: ["2001:db8"] },
  ipv6Full: {
    input: "peer 2001:0db8:85a3:0000:0000:8a2e:0370:7334 reset",
    leaks: ["85a3", "7334"],
  },
  clusterHost: {
    input:
      "upstream connect error to internal-llm-gw.prod.svc.cluster.local:8080",
    leaks: ["internal-llm-gw", "svc.cluster.local"],
  },
  htmlHost: {
    input:
      "<html><body>502 Bad Gateway<hr>nginx/1.25 upstream: 172.16.4.9 host: gw-internal.anyrouter.local</body></html>",
    leaks: ["172.16.4.9", "gw-internal.anyrouter.local"],
    keeps: ["502 Bad Gateway", "nginx/1.25"],
  },
  internalHost: {
    input: "dial tcp router-7.us-east.internal: i/o timeout",
    leaks: ["router-7.us-east.internal"],
  },
  emailPlus: {
    input: "send to jane.doe+news@mail.example.co.uk please",
    leaks: ["jane.doe", "mail.example.co.uk"],
  },
  emailUpper: {
    input: "contact JOHN_SMITH@Example.COM",
    leaks: ["JOHN_SMITH"],
  },
  emailUrlEncoded: {
    input: "to=jane.doe%40example.com&x=1",
    leaks: ["jane.doe", "example.com"],
  },
  emailQuotedName: {
    input: '"Jane Doe" <jane@sub.example.org>',
    leaks: ["jane@sub.example.org"],
  },
  phoneUs: { input: "call +1 (415) 555-0132", leaks: ["555-0132", "415"] },
  phoneVn: { input: "SĐT 0912 345 678 nhé", leaks: ["0912 345 678"] },
  phoneDots: { input: "fax 415.555.0132 today", leaks: ["415.555.0132"] },
  phoneTwoGroups: { input: "call 555-0132 now", leaks: ["555-0132"] },
  phoneLongGroup: { input: "SĐT 0912-345678 nhé", leaks: ["0912-345678"] },
  urlToken: {
    input: `see https://api.example.com/v1?key=${googleKey}&sig=xyz`,
    leaks: ["api.example.com", googleKey],
  },
  urlNoScheme: {
    input: `see api.example.com/v1/files?token=${fakeBody(12)}`,
    leaks: [fakeBody(12)],
  },
  promptEchoMessages: {
    input:
      '{"error":{"message":"Input flagged","messages":[{"role":"user","content":"Dear jane@x.io ..."}]}}',
    leaks: ["Dear", "jane@x.io"],
    keeps: ["Input flagged"],
  },
  flaggedInput: {
    input:
      '{"error":{"code":403,"message":"Input was flagged","metadata":{"reasons":["harassment"],"flagged_input":"Reader suggestion: call me Jane at 0912 345 678","provider_name":"OpenAI"}}}',
    leaks: ["Reader suggestion", "call me Jane", "0912 345 678"],
    keeps: ["Input was flagged", "harassment"],
  },
  contentKey: {
    input:
      '{"choices":[{"message":{"content":"Dear subscriber, your digest"}}]}',
    leaks: ["Dear subscriber"],
  },
  promptKey: {
    input: 'bad request "prompt": "Summarize for Jane Reader"',
    leaks: ["Jane Reader"],
  },
  inputKey: {
    input: "rejected input='Reader note: my plan is X'",
    leaks: ["Reader note"],
  },
  rawKey: { input: "raw: Reader private text", leaks: ["Reader private"] },
  longText: {
    input: `${"A".repeat(300)} secret ${projKey} ${"B".repeat(300)}`,
    leaks: [projKey.slice(8)],
  },
};

/** Ordinary provider and model text that must come through as written. */
const READABLE: string[] = [
  "Run 2026-10-14T12:30:45Z finished at 12:30:45 on 2026-10-14.",
  "HTTP 502 from nginx/1.25 after 30s",
  "served by google/gemini-2.5-flash and anthropic/claude-sonnet-4",
  "OpenAI raised $1,250,000 in 2025-2026 funding.",
  "state-of-the-art-open-weights-reasoning-model-release-notes",
  "The model scored 85 92 77 on three benchmarks, version 1.2.3.",
  "OpenAI released a new model that beats the benchmark by 12 points.",
  '{"results":[{"id":"abc123","score":0.82,"tags":["ai","chips"]}]}',
  '{"bullets":[{"i":0,"text":"Nvidia ships Blackwell Ultra to 3 clouds."}]}',
  "Expected ',' or '}' after property value in JSON at position 512",
  "OpenAI công bố 372 kết quả vào ngày 14/10.",
  '{"error":{"message":"Model is overloaded, retry later","code":503}}',
  "Giá 15.000.000 đồng, vốn 1.500.000.000 VND, quỹ 12 500 000 USD.",
  "Lương 10.000-20.000 USD, at 2026-10-14 12:30 UTC.",
];

function viaEntry(raw: string): string | null {
  const entry: LlmCallLogEntry = {
    ts: 0,
    task: "score",
    model: "m",
    ok: false,
    tokens: 0,
    promptTokens: null,
    completionTokens: null,
    cachedTokens: null,
    durationMs: 1,
    error: "anyrouter bad output",
    promptChars: 1,
    responseSnippet: raw,
  };
  return redactLlmCallEntry(entry).responseSnippet;
}

describe("sanitizeLlmSnippet", () => {
  for (const [name, { input, leaks, keeps = [] }] of Object.entries(
    LEAK_CASES
  )) {
    it(`redacts ${name}`, () => {
      const out = sanitizeLlmSnippet(input) ?? "";
      for (const leak of leaks) expect(out).not.toContain(leak);
      // The provider's own diagnosis is what the snippet is for.
      for (const keep of keeps) expect(out).toContain(keep);
      expect(viaEntry(input)).toBe(out);
      // The D1 sink redacts again; a second pass must not change the row.
      expect(sanitizeLlmSnippet(out)).toBe(out);
    });
  }

  for (const text of READABLE) {
    it(`keeps readable text: ${text.slice(0, 40)}`, () => {
      expect(sanitizeLlmSnippet(text)).toBe(text);
    });
  }

  it("redacts a whole bare base64 token, padding included", () => {
    expect(sanitizeLlmSnippet(LEAK_CASES.base64Bare!.input)).toBe(
      "blob [redacted] end"
    );
  });
});

describe("sanitizeText quoted keys", () => {
  it("redacts a secret value after a quoted key in non-JSON text", () => {
    const out = sanitizeText(
      `upstream said "${X_API_KEY}":"${arKey}", "${API_KEY}" : "${shortKey}"`
    );
    expect(out).not.toContain(arKey);
    expect(out).not.toContain(shortKey);
  });
});
