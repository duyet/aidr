import { describe, expect, it } from "vitest";
import { type LlmCallLogEntry, redactLlmCallEntry } from "../llm.js";
import { sanitizeLlmSnippet, sanitizeText } from "../telemetry-safe.js";

/**
 * `llm_calls.response_snippet` keeps provider error bodies and rejected model
 * output. Each case below is a body a provider or model can return; `leaks`
 * are the substrings that must never reach D1. Cases from the #748 verifier
 * fuzz run.
 */
const LEAK_CASES: Record<
  string,
  { input: string; leaks: string[]; keeps?: string[] }
> = {
  bearerAr: {
    input: "Authorization: Bearer ar-abc123DEF456ghi789",
    leaks: ["ar-abc123DEF456ghi789"],
  },
  bearerHeaderJson: {
    input: '{"headers":{"Authorization":"Bearer ar-abc123DEF456ghi789"}}',
    leaks: ["ar-abc123DEF456ghi789"],
  },
  apiKeyJson: {
    input:
      '{"error":{"message":"Invalid key","api_key":"ar-v1-abcdef1234567890"}}',
    leaks: ["ar-v1-abcdef1234567890"],
    keeps: ["Invalid key"],
  },
  apiKeyJsonSpace: {
    input: '{"error":{"message":"bad", "api_key" : "zzshortkey99"}}',
    leaks: ["zzshortkey99"],
  },
  xApiKey: {
    input: "x-api-key: ar-v1-1a2b3c4d5e6f",
    leaks: ["ar-v1-1a2b3c4d5e6f"],
  },
  xApiKeyJson: {
    input: '"x-api-key":"ar-v1-1a2b3c4d5e6f"',
    leaks: ["ar-v1-1a2b3c4d5e6f"],
  },
  xApiKeyJsonDigitless: {
    input: '{"x-api-key":"abcdefghijklmnopqrstuvwxyzABCD"}',
    leaks: ["abcdefghijklmnopqrstuvwxyzABCD"],
  },
  longKeyJson: {
    input: '{"api_key":"ar-v1-0123456789abcdef0123456789abcdef0123"}',
    leaks: ["0123456789abcdef"],
  },
  bearerJsonSpaced: {
    input: '{"Authorization": "Bearer abcDEF"}',
    leaks: ["abcDEF"],
  },
  bearerLower: {
    input: "authorization=bearer abc.def.ghi",
    leaks: ["abc.def.ghi"],
  },
  splitNewline: { input: "api_key:\n  ar-v1-abcdef12", leaks: ["abcdef12"] },
  passwordColon: { input: "password = hunter2", leaks: ["hunter2"] },
  tokenEqUrlencoded: {
    input: "access_token%3Dabcdef123456",
    leaks: ["abcdef123456"],
  },
  skProj: {
    input: "key sk-proj-AbCdEf_12345-67890xyzXYZ was rejected",
    leaks: ["AbCdEf_12345"],
  },
  skAnt: { input: "sk-ant-api03-AAAABBBBCCCCDDDD", leaks: ["AAAABBBB"] },
  skOr: {
    input:
      "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd",
    leaks: ["0123456789abcdef"],
  },
  ghToken: {
    input: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234",
    leaks: ["ABCDEFGHIJKLMNOP"],
  },
  googleKey: {
    input: "AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI",
    leaks: ["AIzaSy"],
  },
  awsKey: {
    input:
      "AKIAIOSFODNN7EXAMPLE and secret wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    leaks: ["AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI", "bPxRfiCY"],
  },
  jwt: {
    input:
      "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    leaks: ["eyJhbGci", "SflKxwRJ"],
  },
  jwtShortSig: {
    input: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc",
    leaks: ["eyJhbGci"],
  },
  hexToken: {
    input:
      "request id 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    leaks: ["9f86d081884c7d65"],
  },
  base64Keyed: {
    input:
      "payload: dGhpcyBpcyBhIHNlY3JldCBibG9iIHdpdGggbm8gZGlnaXRzIGF0IGFsbA==",
    leaks: ["dGhpcyBp", "=="],
  },
  base64Bare: {
    input:
      "blob dGhpcyBpcyBhIHNlY3JldCBibG9iIHdpdGggbm8gZGlnaXRzIGF0IGFsbA== end",
    leaks: ["dGhpcyBp", "=="],
  },
  opaqueNoDigit: {
    input: "AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMn",
    leaks: ["AbCdEfGh"],
  },
  accountIds: {
    input:
      '{"error":{"message":"Insufficient credits","metadata":{"account_id":"acct_7Hc2LmQ9xZ","user_id":"user_2abcDEF","org_id":"org-123abc"}}}',
    leaks: ["acct_7Hc2LmQ9xZ", "user_2abcDEF", "org-123abc"],
    keeps: ["Insufficient credits"],
  },
  requestId: {
    input: "request_id: req_01HZY8K2F3G4H5J6K7L8M9N0P",
    leaks: ["01HZY8K2F3G4"],
  },
  bareReqId: {
    input: "failed (req_01HZY8K2F3G4H5J6K7) retry",
    leaks: ["01HZY8K2F3G4"],
  },
  setCookie: {
    input: "Set-Cookie: __session=abcDEF123456; Path=/",
    leaks: ["abcDEF123456"],
  },
  cookie: {
    input: "Cookie: cf_clearance=Zx9yW8vU7tS6; theme=dark",
    leaks: ["Zx9yW8vU7tS6"],
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
  urlToken: {
    input: "see https://api.example.com/v1?key=AIzaSyA1234567890abcdef&sig=xyz",
    leaks: ["api.example.com", "AIzaSyA1234567890abcdef"],
  },
  urlNoScheme: {
    input: "see api.example.com/v1/files?token=abcd1234efgh",
    leaks: ["abcd1234efgh"],
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
    input: `${"A".repeat(300)} secret sk-proj-ZZZZZZZZZZ12345 ${"B".repeat(300)}`,
    leaks: ["ZZZZZZZZZZ12345"],
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
      'upstream said "x-api-key":"ar-v1-1a2b3c4d5e6f", "api_key" : "zzshortkey99"'
    );
    expect(out).not.toContain("ar-v1-1a2b3c4d5e6f");
    expect(out).not.toContain("zzshortkey99");
  });
});
