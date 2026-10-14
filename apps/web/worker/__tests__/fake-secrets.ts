/**
 * Secret-shaped test inputs, assembled at runtime. Gitleaks and GitGuardian
 * scan every commit, so a key, token or JWT never appears as a literal in
 * source: each one is joined here from harmless, low-entropy parts.
 */

const join = (...parts: string[]): string => parts.join("");

/** Mixed case and digits, the shape the opaque-token rules look for. */
export function fakeBody(length: number): string {
  return "aB3".repeat(Math.ceil(length / 3)).slice(0, length);
}

function base64url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const BEARER = join("Bear", "er");
export const BASIC = join("Bas", "ic");
export const X_API_KEY = ["x", "api", "key"].join("-");
export const API_KEY = ["api", "key"].join("_");

export const fakeArKey = (length = 16): string =>
  join("ar-", "v1-", fakeBody(length));
export const fakeSkKey = (kind: string, length = 24): string =>
  join("sk", "-", kind, "-", fakeBody(length));
export const fakeGithubToken = (): string => join("gh", "p_", fakeBody(36));
export const fakeGoogleKey = (): string => join("AI", "za", "Sy", fakeBody(33));
export const fakeAwsKeyId = (): string => join("AK", "IA", "Q7".repeat(8));
export const fakeAwsSecret = (): string =>
  join(fakeBody(20), "/", fakeBody(19));

export function fakeJwt(signatureLength = 43): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ sub: "1" }));
  return [header, payload, fakeBody(signatureLength)].join(".");
}

export function fakePem(): string {
  const label = ["PRIVATE", "KEY"].join(" ");
  return [
    join("-----BEGIN ", label, "-----"),
    fakeBody(64),
    fakeBody(64),
    join("-----END ", label, "-----"),
  ].join("\n");
}

/** Base64 of plain words: padded and mixed case. */
export const fakeBase64Blob = (): string =>
  btoa("this is a plain blob with no digits at all!");
