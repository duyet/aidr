import { describe, expect, it } from "vitest";
import { type LlmCallLogEntry, parseJson, redactLlmCallEntry } from "../llm.js";
import {
  canonicalLlmSnippet,
  modelOutputSnippet,
  providerErrorSnippet,
  sanitizeRunStats,
  sanitizeText,
} from "../telemetry-safe.js";
import {
  API_KEY,
  BASIC,
  BEARER,
  fakeArKey,
  fakeAwsKeyId,
  fakeAwsSecret,
  fakeBase64Blob,
  fakeBody,
  fakeGithubToken,
  fakeGoogleKey,
  fakeJwt,
  fakePem,
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
const shortValue = fakeBody(20);
const pem = fakePem();
const pemBody = pem.split("\n")[1]!;
const basicCredential = btoa(`reader:${"pw".repeat(6)}`);

/**
 * Bodies a provider or model has returned, or could. `leaks` must never
 * reach `llm_calls.response_snippet`, whichever way the text arrives.
 * Cases from the #748 and #752 verifier rounds.
 */
const LEAK_CASES: Record<string, { input: string; leaks: string[] }> = {
  bearerAr: { input: `Authorization: ${BEARER} ${arKey}`, leaks: [arKey] },
  bearerHeaderJson: {
    input: JSON.stringify({ headers: { Authorization: `${BEARER} ${arKey}` } }),
    leaks: [arKey],
  },
  apiKeyJson: {
    input: JSON.stringify({
      error: { message: "Invalid key", [API_KEY]: arKey },
    }),
    leaks: [arKey],
  },
  apiKeyJsonSpace: {
    input: `{"error":{"message":"bad", "${API_KEY}" : "${shortKey}"}}`,
    leaks: [shortKey],
  },
  xApiKey: { input: `${X_API_KEY}: ${arKey}`, leaks: [arKey] },
  xApiKeyJsonDigitless: {
    input: JSON.stringify({ [X_API_KEY]: digitlessKey }),
    leaks: [digitlessKey],
  },
  longKeyJson: {
    input: JSON.stringify({ [API_KEY]: longArKey }),
    leaks: [longArKey.slice(6, 22)],
  },
  bearerLower: {
    input: `authorization=${BEARER.toLowerCase()} abc.def.ghi`,
    leaks: ["abc.def.ghi"],
  },
  passwordColon: { input: "password = hunter2", leaks: ["hunter2"] },
  tokenEqUrlencoded: {
    input: `access_token%3D${fakeBody(12)}`,
    leaks: [fakeBody(12)],
  },
  skProj: { input: `key ${projKey} was rejected`, leaks: [projKey.slice(8)] },
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
  base64Bare: { input: `blob ${blob} end`, leaks: [blob.slice(0, 8)] },
  opaqueNoDigit: { input: opaque, leaks: [opaque.slice(0, 8)] },
  accountIds: {
    input:
      '{"error":{"message":"Insufficient credits","metadata":{"account_id":"acct_7Hc2LmQ9xZ","user_id":"user_2abcDEF","org_id":"org-123abc"}}}',
    leaks: ["acct_7Hc2LmQ9xZ", "user_2abcDEF", "org-123abc"],
  },
  bareReqId: { input: `failed (${reqId}) retry`, leaks: [reqId.slice(4, 16)] },
  setCookie: {
    input: `Set-Cookie: __session=${sessionValue}; Path=/`,
    leaks: [sessionValue],
  },
  ipv4: {
    input: "upstream 10.0.12.34:8443 connection refused",
    leaks: ["10.0.12.34"],
  },
  ipBare: { input: "connect to 10.1.2.3 failed", leaks: ["10.1.2.3"] },
  ipv6: { input: "connect to [2001:db8::1]:443 failed", leaks: ["2001:db8"] },
  clusterHost: {
    input:
      "upstream connect error to internal-llm-gw.prod.svc.cluster.local:8080",
    leaks: ["internal-llm-gw", "svc.cluster.local"],
  },
  htmlHost: {
    input:
      "<html><body>502 Bad Gateway<hr>nginx/1.25 upstream: 172.16.4.9 host: gw-internal.anyrouter.local</body></html>",
    leaks: ["172.16.4.9", "gw-internal.anyrouter.local"],
  },
  emailPlus: {
    input: "send to jane.doe+news@mail.example.co.uk please",
    leaks: ["jane.doe", "mail.example.co.uk"],
  },
  emailQuotedName: {
    input: '"Jane Doe" <jane@sub.example.org>',
    leaks: ["jane@sub.example.org"],
  },
  phoneUs: { input: "call +1 (415) 555-0132", leaks: ["555-0132", "415"] },
  phoneVn: { input: "SĐT 0912 345 678 nhé", leaks: ["0912", "345 678"] },
  phoneDots: { input: "fax 415.555.0132 today", leaks: ["415.555.0132"] },
  urlToken: {
    input: `see https://api.example.com/v1?key=${googleKey}&sig=xyz`,
    leaks: ["api.example.com", googleKey],
  },
  urlNoScheme: {
    input: `see api.example.com/v1/files?token=${fakeBody(12)}`,
    leaks: [fakeBody(12)],
  },
  flaggedInput: {
    input:
      '{"error":{"code":403,"message":"Input was flagged","metadata":{"reasons":["harassment"],"flagged_input":"Reader suggestion: call me Jane at 0912 345 678","provider_name":"OpenAI"}}}',
    leaks: ["Reader suggestion", "call me Jane", "0912"],
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
  rawKey: { input: "raw: Reader private text", leaks: ["Reader private"] },
  privateKeyJson: {
    input: JSON.stringify({ type: "service_account", private_key: pem }),
    leaks: [pemBody],
  },
  pemBlock: { input: `loaded key\n${pem}\nthen failed`, leaks: [pemBody] },
  basicAuth: {
    input: `Authorization: ${BASIC} ${basicCredential}`,
    leaks: [basicCredential],
  },
  bareArKey: {
    input: `key ${fakeArKey(10)} is invalid`,
    leaks: [fakeArKey(10).slice(6)],
  },
  queryKeyNoScheme: {
    input: `GET generativelanguage.example.com/v1/models?key=${shortValue}&alt=json`,
    leaks: [shortValue],
  },
  // Third verifier round: prefixed key names and credential words.
  envKey: {
    input: `OPENAI_${API_KEY.toUpperCase()}=${shortValue}`,
    leaks: [shortValue],
  },
  serviceKeyJson: {
    input: `{"service_${API_KEY}": "${shortValue}"}`,
    leaks: [shortValue],
  },
  serviceKeyText: {
    input: `rejected "service_${API_KEY}": "${shortValue}"`,
    leaks: [shortValue],
  },
  stripeKeyText: {
    input: `config "stripe_secret_key":"${shortValue}" missing`,
    leaks: [shortValue],
  },
  awsSecretAssign: {
    input: `aws_secret_access_key=${awsSecret}`,
    leaks: [awsSecret.slice(0, 12)],
  },
  sessionId: { input: `session_id=${shortValue}`, leaks: [shortValue] },
  credentials: { input: `credentials: ${shortValue}`, leaks: [shortValue] },
  passphrase: { input: `passphrase=${shortValue}`, leaks: [shortValue] },
  camelSecretKey: {
    input: `stripeSecretKey=${shortValue}`,
    leaks: [shortValue],
  },
};

function stored(snippet: string | null): string | null {
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
    responseSnippet: snippet,
  };
  // logLlmCall redacts, then the D1 sink redacts the same entry again.
  return redactLlmCallEntry(redactLlmCallEntry(entry)).responseSnippet;
}

const outputOf = (content: string, truncatedAtMax = false) =>
  stored(modelOutputSnippet(content, { parse: parseJson, truncatedAtMax }));

describe("provider error snippets keep allowlisted fields only", () => {
  it("OpenAI-style body: code, type and a redacted message", () => {
    const body = JSON.stringify({
      error: {
        message: `Incorrect API key provided: ${projKey}. You can find your API key at https://platform.openai.com/account/api-keys.`,
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    });
    expect(stored(providerErrorSnippet(401, body))).toBe(
      JSON.stringify({
        kind: "provider_error",
        status: 401,
        error: {
          code: "invalid_api_key",
          type: "invalid_request_error",
          message:
            "Incorrect API key provided: [redacted]. You can find your API key at [url redacted]",
        },
      })
    );
  });

  it("OpenRouter-style body: numeric code kept, metadata dropped", () => {
    const body = LEAK_CASES.flaggedInput!.input;
    expect(JSON.parse(stored(providerErrorSnippet(403, body))!)).toEqual({
      kind: "provider_error",
      status: 403,
      error: { code: 403, message: "Input was flagged" },
    });
  });

  it("keeps a long provider message readable and bounded at 120 chars", () => {
    const body = JSON.stringify({
      error: {
        message:
          "This request requires more credits, or fewer max_tokens. You requested up to 8192 tokens, but can only afford 1200. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account",
        code: 402,
      },
    });
    const { error } = JSON.parse(stored(providerErrorSnippet(402, body))!);
    expect(error.code).toBe(402);
    expect(error.message).toContain(
      "You requested up to 8192 tokens, but can only afford 1200."
    );
    expect(error.message).not.toContain("openrouter.ai");
    expect(error.message.length).toBeLessThanOrEqual(120);
  });

  it("Google-style body: status string and param name", () => {
    const body = JSON.stringify({
      error: {
        code: 400,
        message: "Invalid value at 'generation_config.max_output_tokens'",
        status: "INVALID_ARGUMENT",
        param: "generation_config.max_output_tokens",
        details: [{ reason: "API_KEY_INVALID", key: googleKey }],
      },
    });
    const out = JSON.parse(stored(providerErrorSnippet(400, body))!);
    expect(out.error).toMatchObject({
      code: 400,
      status: "INVALID_ARGUMENT",
      param: "generation_config.max_output_tokens",
    });
    expect(JSON.stringify(out)).not.toContain(googleKey.slice(0, 6));
  });

  it("drops a param that is not a field name", () => {
    for (const param of [`Dear Jane, ${shortValue}`, digitlessKey]) {
      const body = JSON.stringify({ error: { message: "bad", param } });
      const out = JSON.parse(stored(providerErrorSnippet(400, body))!);
      expect(out.error).toEqual({ message: "bad" });
    }
    const camel = JSON.stringify({ error: { param: "responseFormat" } });
    expect(JSON.parse(stored(providerErrorSnippet(400, camel))!).error).toEqual(
      { param: "responseFormat" }
    );
  });

  it("nginx HTML 502: status and the tag-free words", () => {
    const body =
      "<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n";
    expect(JSON.parse(stored(providerErrorSnippet(502, body))!)).toEqual({
      kind: "provider_error",
      status: 502,
      text: "502 Bad Gateway 502 Bad Gateway nginx",
    });
  });

  it("HTML with attributes or keyed text: status and byte count only", () => {
    const html =
      '<!DOCTYPE html><html lang="en-US"><head><title>api.example.com | 502: Bad gateway</title></head></html>';
    expect(JSON.parse(stored(providerErrorSnippet(502, html))!)).toEqual({
      kind: "provider_error",
      status: 502,
      body: `non-json error body (${html.length} bytes)`,
    });
    expect(
      JSON.parse(stored(providerErrorSnippet(429, "error code: 1015"))!)
    ).toEqual({
      kind: "provider_error",
      status: 429,
      body: "non-json error body (16 bytes)",
    });
  });

  it("plain text: kept when it is only words", () => {
    expect(
      JSON.parse(stored(providerErrorSnippet(503, "Service Unavailable\n"))!)
    ).toEqual({
      kind: "provider_error",
      status: 503,
      text: "Service Unavailable",
    });
  });

  it("counts bytes, not characters", () => {
    const body = "lỗi: máy chủ quá tải";
    expect(JSON.parse(stored(providerErrorSnippet(500, body))!).body).toBe(
      `non-json error body (${new TextEncoder().encode(body).length} bytes)`
    );
  });

  it("JSON with no error object: byte count only", () => {
    const body = JSON.stringify({ detail: "Dear Jane, not found" });
    expect(JSON.parse(stored(providerErrorSnippet(404, body))!)).toEqual({
      kind: "provider_error",
      status: 404,
      body: `json error body (${body.length} bytes)`,
    });
  });
});

describe("model output snippets store a shape, never content", () => {
  it("fenced JSON", () => {
    const content =
      '```json\n{"results":[{"id":"abc","score":0.82}],"note":"Dear Jane"}\n```';
    expect(JSON.parse(outputOf(content)!)).toEqual({
      kind: "model_output",
      len: content.length,
      startsWith: "fence",
      jsonParse: "ok",
      topKeys: ["results", "note"],
      fenced: true,
      truncatedAtMax: false,
    });
  });

  it("JSON cut off at the token limit", () => {
    const content = '{"bullets":[{"i":0,"text":"Nvidia ships Blackwell';
    expect(JSON.parse(outputOf(content, true)!)).toEqual({
      kind: "model_output",
      len: content.length,
      startsWith: "object",
      jsonParse: `error at pos ${content.length}`,
      fenced: false,
      truncatedAtMax: true,
    });
  });

  it("prose", () => {
    const content = "Dear Jane, here are the scores you asked for.";
    expect(JSON.parse(outputOf(content)!)).toEqual({
      kind: "model_output",
      len: content.length,
      startsWith: "letter",
      jsonParse: "not-json",
      fenced: false,
      truncatedAtMax: false,
    });
  });

  it("prose wrapped around JSON parses the way callers parse it", () => {
    expect(JSON.parse(outputOf('Sure! {"results":1,"b":[2]}')!)).toMatchObject({
      startsWith: "letter",
      jsonParse: "ok",
      topKeys: ["results", "*"],
    });
  });

  it("keeps the first ten keys", () => {
    const keys = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`k${i}`, i])
    );
    const out = JSON.parse(
      outputOf(JSON.stringify({ "Dear jane@x.io": 1, results: [], ...keys }))!
    );
    expect(out.topKeys).toEqual(["*", "results", ...Array(8).fill("*")]);
  });

  it("hides model-chosen key names that no aidr prompt asks for", () => {
    const secretKey = ["sk", "live", fakeBody(20)].join("_");
    const content = JSON.stringify({
      [secretKey]: 1,
      JohnSmith: 2,
      john_doe_at_example: 3,
    });
    const built = outputOf(content) ?? "";
    const forged = canonicalLlmSnippet({
      kind: "model_output",
      topKeys: [secretKey, "JohnSmith", "john_doe_at_example"],
    });
    for (const out of [built, forged ?? ""]) {
      for (const leak of [secretKey, "JohnSmith", "john_doe"]) {
        expect(out).not.toContain(leak);
      }
      expect(JSON.parse(out).topKeys).toEqual(["*", "*", "*"]);
    }
  });

  it.each([
    ["score", { results: [] }],
    ["TL;DR", { bullets_en: [], bullets_vi: [] }],
    ["weekly", { intro_en: "", intro_vi: "", stories: [] }],
    ["mail wrap", { subject: "", preheader: "", body_md: "", cta_url: "" }],
    [
      "translation review",
      {
        schema_version: 3,
        direction: "en_vi",
        verdict: "accept",
        checks: {},
        back_translation: "",
      },
    ],
  ])("keeps the keys of a %s answer", (_, answer) => {
    const out = JSON.parse(outputOf(`${JSON.stringify(answer)} trailing`)!);
    expect(out.jsonParse).toBe("ok");
    expect(out.topKeys).toEqual(Object.keys(answer));
  });

  it("never stores a word of the output", () => {
    const outputs = [
      "CANARY prose answer with no json",
      '{"text":"CANARY value"}',
      '["CANARY", "item"]',
      "```\nCANARY fenced prose\n```",
      '{"a": "CANARY", ',
      'Unexpected "CANARY" token',
    ];
    for (const content of outputs) {
      expect(outputOf(content)).not.toContain("CANARY");
    }
  });
});

describe("stored snippets never carry a leak", () => {
  for (const [name, { input, leaks }] of Object.entries(LEAK_CASES)) {
    it(name, () => {
      const variants = [
        providerErrorSnippet(400, input),
        providerErrorSnippet(
          400,
          JSON.stringify({ error: { message: input } })
        ),
        providerErrorSnippet(400, JSON.stringify({ error: input })),
        modelOutputSnippet(input, { parse: parseJson, truncatedAtMax: false }),
      ];
      for (const variant of variants) {
        const out = stored(variant) ?? "";
        for (const leak of leaks) expect(out).not.toContain(leak);
      }
    });
  }
});

describe("canonicalLlmSnippet", () => {
  it("stores nothing for text that is not a snippet descriptor", () => {
    expect(stored("upstream said no to jane@x.io")).toBeNull();
    expect(stored('{"error":"raw provider body"}')).toBeNull();
    expect(stored(JSON.stringify({ kind: "other", text: "x" }))).toBeNull();
  });

  it("rebuilds a descriptor from allowlisted fields", () => {
    const forged = JSON.stringify({
      kind: "provider_error",
      status: 400,
      error: { message: `call jane@x.io ${shortValue}`, raw: "Dear Jane" },
      text: `key ${shortValue}`,
      prompt: "Dear Jane",
    });
    const out = canonicalLlmSnippet(forged) ?? "";
    expect(out).not.toContain("jane@x.io");
    expect(out).not.toContain(shortValue);
    expect(out).not.toContain("Dear Jane");
    expect(JSON.parse(out)).toEqual({
      kind: "provider_error",
      status: 400,
      error: { message: "call * *" },
    });
  });

  it("rejects a model shape with content in its fields", () => {
    const forged = JSON.stringify({
      kind: "model_output",
      len: 5,
      startsWith: "Dear Jane",
      jsonParse: "Unexpected token 'D', \"Dear Jane\" is not valid JSON",
      topKeys: ["ok", "Dear Jane"],
      fenced: "yes",
      truncatedAtMax: false,
      content: "Dear Jane",
    });
    expect(canonicalLlmSnippet(forged)).not.toContain("Dear Jane");
  });

  it("is idempotent on every snippet the builders produce", () => {
    for (const { input } of Object.values(LEAK_CASES)) {
      for (const snippet of [
        providerErrorSnippet(400, input),
        providerErrorSnippet(
          400,
          JSON.stringify({ error: { message: input } })
        ),
        modelOutputSnippet(input, { parse: parseJson, truncatedAtMax: true }),
      ]) {
        expect(canonicalLlmSnippet(snippet)).toBe(snippet);
      }
    }
  });

  it("is idempotent when the 120-char cut lands inside a value", () => {
    for (let pad = 90; pad <= 120; pad++) {
      const message = `${"a".repeat(pad)} input_token: 512 used, password=hunter2 then`;
      const snippet = providerErrorSnippet(
        400,
        JSON.stringify({ error: { message } })
      );
      expect(snippet).not.toContain("hunter2");
      expect(canonicalLlmSnippet(snippet)).toBe(snippet);
    }
  });
});

describe("sanitizeText for step reasons", () => {
  it("redacts prefixed and compound secret key names", () => {
    for (const { input, leaks } of [
      LEAK_CASES.envKey!,
      LEAK_CASES.serviceKeyText!,
      LEAK_CASES.stripeKeyText!,
      LEAK_CASES.awsSecretAssign!,
      LEAK_CASES.sessionId!,
      LEAK_CASES.credentials!,
      LEAK_CASES.passphrase!,
      LEAK_CASES.camelSecretKey!,
    ]) {
      const out = sanitizeText(input) ?? "";
      for (const leak of leaks) expect(out).not.toContain(leak);
    }
  });

  it("redacts prefixed secret keys in JSON reasons and run stats", () => {
    const json = sanitizeText(
      `{"service_${API_KEY}":"${shortValue}","stripe_secret_key":"${shortValue}","input_tokens":512}`
    );
    expect(json).not.toContain(shortValue);
    expect(JSON.parse(json ?? "{}").input_tokens).toBe(512);
    expect(
      sanitizeRunStats({
        stripeSecretKey: shortValue,
        session_id: shortValue,
        max_tokens: 4096,
        input_token: "512",
      })
    ).toEqual({
      stripeSecretKey: "[redacted]",
      session_id: "[redacted]",
      max_tokens: 4096,
      input_token: "512",
    });
  });

  it("redacts a numeric secret but keeps token counts", () => {
    expect(sanitizeText("password=123456")).not.toContain("123456");
    const longDigits = "4".repeat(24);
    expect(sanitizeText(`session_token=${longDigits}`)).not.toContain(
      longDigits
    );
    expect(sanitizeText("input_token: 512, output_token: 128")).toBe(
      "input_token: 512, output_token: 128"
    );
  });

  it.each([
    "cost_per_token: 0.000002",
    "num_token: 12",
    "cache_read_token: 50",
    "max_new_token=4096",
    "time_to_first_token=412",
  ])("keeps the counter %s", (text) => {
    expect(sanitizeText(text)).toBe(text);
  });

  it.each([
    ["bot-token=123456", "123456"],
    ["reset-token=1234567", "1234567"],
    ["verify-token=1234567.123456789", "1234567.123456789"],
    ["failed push-token: 1234567", "1234567"],
    ['{"note":"verify-token=123456"}', "123456"],
  ])("redacts the hyphenated token key in %s", (text, value) => {
    expect(sanitizeText(text)).not.toContain(value);
  });

  it("still redacts a short number after a credential token key", () => {
    for (const key of ["access_token", "refresh_token", "id_token"]) {
      expect(sanitizeText(`${key}=123456`)).not.toContain("123456");
    }
  });

  it("keeps query params that only end in a key word", () => {
    expect(sanitizeText("see /buy?fruit=1&monkey=banana")).toBe(
      "see /buy?fruit=1&monkey=banana"
    );
  });

  it("keeps DOIs, arXiv ids, long decimals and scores", () => {
    for (const text of [
      "doi:10.48550/arXiv.2410.12345 cited",
      "score 0.8271828182845904 and 1234567.891",
      "scores 85 92 77 on three benchmarks",
    ]) {
      expect(sanitizeText(text)).toBe(text);
    }
  });

  it("redacts a secret value after a quoted key in non-JSON text", () => {
    const out = sanitizeText(
      `upstream said "${X_API_KEY}":"${arKey}", "${API_KEY}" : "${shortKey}"`
    );
    expect(out).not.toContain(arKey);
    expect(out).not.toContain(shortKey);
  });

  it("redacts prefixed token keys and the Basic credential", () => {
    const out = sanitizeText(
      `retry with session_token=${shortValue} and Authorization: ${BASIC} ${basicCredential}`
    );
    expect(out).not.toContain(shortValue);
    expect(out).not.toContain(basicCredential);
  });
});
