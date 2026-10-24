# @aidr/email

Email Worker (`aidr-email`) for `submit@aidr.today`. Cloudflare Email Routing hands each message to `email()` in `src/index.ts`. The Worker checks the sender, parses a few fields, and inserts one row into `inbound_emails` in the shared `aidr` D1 database. It sends no mail and calls no LLM. The `inbound-email` step of the ingest workflow in `apps/web` turns stored rows into submissions and suggestions.

Design and owner steps are in [`docs/decisions/email-contributions.md`](../../docs/decisions/email-contributions.md).

## Entrypoints

| File                                                           | Role                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/index.ts`                                                 | `email()` handler. Rejects oversize mail at SMTP time.            |
| `src/intake.ts`                                                | `receiveEmail` runs the ordered checks, then the insert.          |
| `src/loop.ts`, `src/auth.ts`, `src/identity.ts`, `src/body.ts` | Loop guard, Cloudflare auth result, account lookup, body parsing. |

## Commands

```bash
pnpm --filter @aidr/email test
pnpm --filter @aidr/email check-types
pnpm --filter @aidr/email lint
pnpm --filter @aidr/email deploy
```

The routing rule (`submit@aidr.today` to this Worker) lives in the Cloudflare dashboard, not in `wrangler.toml`.

## Gotchas

- Every check fails closed. Never log an address, subject, or body.
- The `inbound_emails` table and its migrations belong to `apps/web/migrations`, not to this package.
- The only dependency is `postal-mime`.
