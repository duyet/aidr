# aidr-daily-video (Claude Managed Agents)

Runs the `aidr-daily-news` skill end to end in an Anthropic cloud sandbox: clone the public repo, `new.mjs`, write `script.json` and `script.vi.json`, `publish.mjs` render, review, upload (YouTube Data API), attach to the day page, Telegram.

| File | Resource |
|------|----------|
| `agent.md` | Agent: `claude-opus-5-5`, agent toolset (all tools `always_allow`, web search/fetch off), system prompt in the body |
| `environment.yaml` | Cloud environment: apt `ffmpeg`, `python3`, Chrome libs, fonts; npm `pnpm`; networking `unrestricted` (reason in the file) |
| `vault.yaml` | Vault container; credentials below are added by hand |
| `deployment-daily.yaml` | Daily 09:00 `Asia/Ho_Chi_Minh`, private uploads, staging Telegram, $30 cap per run |

Requires `ant` 1.34.0 or later and `ant auth status` showing the intended org and workspace.

## Before the first run

- Merge the branch that ships `yt-upload-api.mjs`, `publish.mjs --uploader api --privacy`, and the repo-relative `sfx.dir` / `AIDR_NO_HEYGEN` changes: the sandbox clones `master` from `https://github.com/duyet/aidr` (public, no token). Nothing is pushed back, so no GitHub credential is needed.
- `AIDR_NO_HEYGEN=1` is set by the agent: HeyGen needs an interactive sign-in, so a failed ElevenLabs line fails the run instead of mixing voices.

## Credentials

One row per secret. Mint tokens for this agent; do not reuse personal ones.

| `secret_name` | Allowed host | Step | Injection |
|---------------|--------------|------|-----------|
| `ELEVENLABS_API_KEY` | `api.elevenlabs.io` | voice | header (`xi-api-key`) |
| `NEWS_ADMIN_TOKEN` | `aidr.today` | attach, telegram | header (`Authorization: Bearer`) |
| `TELEGRAM_STAGING_CHAT_ID` | `aidr.today` | telegram (staging) | body (`chat_id` in the JSON body) |
| `YOUTUBE_CLIENT_ID` | `oauth2.googleapis.com` | upload | body (form-encoded token refresh) |
| `YOUTUBE_CLIENT_SECRET` | `oauth2.googleapis.com` | upload | body |
| `YOUTUBE_REFRESH_TOKEN` | `oauth2.googleapis.com` | upload | body |

The access token the refresh returns is a real value inside the sandbox; it is short-lived and scoped to the YouTube upload scope of the OAuth client.

```sh
ant apply --dry-run -v agents/aidr-daily-video/agent.md agents/aidr-daily-video/environment.yaml agents/aidr-daily-video/vault.yaml
ant apply agents/aidr-daily-video/agent.md agents/aidr-daily-video/environment.yaml agents/aidr-daily-video/vault.yaml

VAULT_ID=$(jq -r '.resources["./agents/aidr-daily-video/vault.yaml"].id' claude-lock.json)

# One credential: paste the value at the silent prompt (nothing in shell history), then send it.
add() {  # add <SECRET_NAME> <host> <header|body>
  local v; read -rs -p "$1: " v; echo
  jq -n --arg n "$1" --arg v "$v" --arg h "$2" --arg loc "$3" '{
    display_name: $n,
    auth: {
      type: "environment_variable", secret_name: $n, secret_value: $v,
      networking: {type: "limited", allowed_hosts: [$h]},
      injection_location: {header: ($loc == "header"), body: ($loc == "body")}
    }}' | ant beta:vaults:credentials create --vault-id "$VAULT_ID"
}
add ELEVENLABS_API_KEY       api.elevenlabs.io     header
add NEWS_ADMIN_TOKEN         aidr.today            header
add TELEGRAM_STAGING_CHAT_ID aidr.today            body
add YOUTUBE_CLIENT_ID        oauth2.googleapis.com body
add YOUTUBE_CLIENT_SECRET    oauth2.googleapis.com body
add YOUTUBE_REFRESH_TOKEN    oauth2.googleapis.com body

ant beta:vaults:credentials list --vault-id "$VAULT_ID"     # 6 rows
```

## One manual run

```sh
AGENT_ID=$(jq -r '.resources["./agents/aidr-daily-video/agent.md"].id' claude-lock.json)
ENV_ID=$(jq -r '.resources["./agents/aidr-daily-video/environment.yaml"].id' claude-lock.json)
SID=$(ant beta:sessions create --agent "$AGENT_ID" --environment-id "$ENV_ID" --vault-id "$VAULT_ID" --transform id -r)
ant beta:sessions:events send --session-id "$SID" <<'EOF'
{"events":[{"type":"user.message","content":[{"type":"text","text":"Make and publish today's AI;DR Daily Brief. YouTube privacy: private. Telegram: staging chat only."}]}]}
EOF
```

Watch it in the Console. Check: `hyperframes doctor` passes, the 4K render time per cut, the four private YouTube videos, the day page, the staging Telegram post. Download outputs from `/mnt/session/outputs/`.

## Enable the schedule

Put the vault ID in `deployment-daily.yaml` (`vault_ids: [vlt_...]`), then create it paused:

```sh
ant apply --dry-run -v agents/aidr-daily-video/deployment-daily.yaml
ant apply agents/aidr-daily-video/deployment-daily.yaml &&
  DEPLOYMENT_ID=$(jq -r '.resources["./agents/aidr-daily-video/deployment-daily.yaml"].id' claude-lock.json) &&
  ant beta:deployments pause --deployment-id "$DEPLOYMENT_ID"
```

Resume after a good manual run (`ant beta:deployments resume --deployment-id "$DEPLOYMENT_ID"`). To go public, change the kickoff to `YouTube privacy: public` and `Telegram: prod`, then `ant apply`. Commit `agents/` with `claude-lock.json`.

## Write paths

`bash` (always allowed) holds every credential: it uploads to YouTube, writes the day page through the aidr admin API, and posts to Telegram. Limits: each secret reaches only its host; the kickoff picks privacy and staging vs prod; `publish.mjs` skips cuts already done within a session. Across sessions there is no `STATUS.json`, so the agent checks the day page first; a second manual run on the same day can still upload twice if that check is skipped.

## Known gaps

- The `packages` shape (`apt`, `npm`) and the sandbox's CPU, memory and session time limits are not in the docs used here; measure the 4K render time on the first run. Locally a 4K cut takes 15-25 min; four cuts in-sandbox may take over an hour.
- Fallback for slow renders: `npx hyperframes cloud render --resolution 4k` (HeyGen-hosted, billed per credit, 4K at 1.5x) with a `HEYGEN_API_KEY` credential scoped to `api.heygen.com`. `publish.mjs` does not support it yet.
