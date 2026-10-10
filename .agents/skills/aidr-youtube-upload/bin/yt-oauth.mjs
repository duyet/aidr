#!/usr/bin/env node
// One-time helper: mint the YouTube refresh token for bin/yt-upload-api.mjs.
//
//   node .agents/skills/aidr-youtube-upload/bin/yt-oauth.mjs [--port 8976] [--print]
//
// Reads YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET from the environment or the
// repo's .env.local (OAuth client type "Desktop app"), prints an auth URL,
// listens on http://127.0.0.1:<port>, exchanges the code and writes
// YOUTUBE_REFRESH_TOKEN back into .env.local (gitignored). Sign in as the
// account that owns the AI;DR channel. `--print` prints the token instead.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../../../.env.local");
// Values already in the environment win over .env.local.
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const { YOUTUBE_CLIENT_ID: clientId, YOUTUBE_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error(`set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET (env or ${ENV_FILE})`);
  process.exit(2);
}
const pi = process.argv.indexOf("--port");
const port = pi > 0 ? Number(process.argv[pi + 1]) : 0;
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"];
const b64u = (b) => b.toString("base64url");
const verifier = b64u(randomBytes(48));
const state = b64u(randomBytes(16));

const server = createServer();
await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
const redirect = `http://127.0.0.1:${server.address().port}`;
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirect,
  response_type: "code",
  scope: SCOPES.join(" "),
  access_type: "offline",
  prompt: "consent",
  state,
  code_challenge: b64u(createHash("sha256").update(verifier).digest()),
  code_challenge_method: "S256",
})}`;
console.error(`Open this URL in a browser signed in to the channel owner's Google account:\n\n${authUrl}\n\nWaiting on ${redirect} ...`);

const code = await new Promise((resolve, reject) => {
  server.on("request", (req, res) => {
    const u = new URL(req.url, redirect);
    if (u.pathname !== "/") return res.writeHead(404).end();
    const err = u.searchParams.get("error");
    if (err || u.searchParams.get("state") !== state || !u.searchParams.get("code")) {
      res.writeHead(400).end("Authorization failed. Close this tab and see the terminal.");
      return reject(new Error(err ?? "bad state or missing code"));
    }
    res.writeHead(200, { "content-type": "text/plain" }).end("Done. You can close this tab.");
    resolve(u.searchParams.get("code"));
  });
}).finally(() => server.close());

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirect,
  }),
});
const body = await res.json();
if (!res.ok || !body.refresh_token) {
  console.error(`token exchange failed: HTTP ${res.status} ${JSON.stringify(body)}`);
  process.exit(1);
}
console.error(`Granted scopes: ${body.scope}`);
const line = `YOUTUBE_REFRESH_TOKEN=${body.refresh_token}`;
if (process.argv.includes("--print")) {
  console.log(line);
} else {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const next = /^YOUTUBE_REFRESH_TOKEN=.*$/m.test(text)
    ? text.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, line)
    : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  writeFileSync(ENV_FILE, next, { mode: 0o600 });
  console.error(`Wrote YOUTUBE_REFRESH_TOKEN to ${ENV_FILE}`);
}
