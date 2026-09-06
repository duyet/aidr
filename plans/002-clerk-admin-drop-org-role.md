# Plan 002: Grant Clerk admin only via allowlist / publicMetadata

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4168a5..HEAD -- apps/web/worker/admin/clerk.ts apps/web/worker/__tests__/admin-clerk.test.ts`
> If those files drifted, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (may lock out a user if production currently uses org-admin
  as the only grant — check `NEWS_ADMIN_USER_IDS` before merging)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b4168a5`, 2026-09-04

## Why this matters

`isClerkAdmin` treats Clerk’s `o.rol` (active **organization** role) as site
admin. That boolean gates ingest, item push, mail send, source delete via
`checkAdminAuth`. Anyone who can activate an org with role `admin` on the
`clerk.aidr.today` instance gets the full admin API. Application admin must
be `NEWS_ADMIN_USER_IDS` and/or backend-set `publicMetadata.role`.

## Current state

`apps/web/worker/admin/clerk.ts` (excerpt):

```ts
function claimRole(payload: ClerkPayload): unknown {
  const metadata = payload.metadata as { role?: unknown } | undefined;
  if (metadata?.role !== undefined) return metadata.role;
  const publicMetadata = payload.publicMetadata as { role?: unknown } | undefined;
  if (publicMetadata?.role !== undefined) return publicMetadata.role;
  const org = payload.o as { rol?: unknown } | undefined;
  if (org?.rol !== undefined) return org.rol;
  return undefined;
}

export function isClerkAdmin(payload: ClerkPayload, env: Env): boolean {
  const allowlist = (env.NEWS_ADMIN_USER_IDS ?? "")
    .split(",").map((id) => id.trim()).filter(Boolean);
  if (allowlist.includes(payload.sub)) return true;
  return claimRole(payload) === "admin";
}
```

Test that **must change**: `apps/web/worker/__tests__/admin-clerk.test.ts`
currently expects `o.rol === "admin"` to be true (`it("is true for the shortened o.rol === 'admin' claim")`).

Conventions: vitest, `makeEnv` / `makePayload` helpers already in that file.
Issuer in tests is `https://clerk.aidr.today`.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Tests | `export PATH="/home/box/.local/node-v22.22.1-linux-x64/bin:$PATH"` then `pnpm --filter @aidr/web test -- worker/__tests__/admin-clerk.test.ts` | all pass, including the new negative `o.rol` case |
| Types | `pnpm --filter @aidr/web check-types` | exit 0 |

## Scope

**In scope**
- `apps/web/worker/admin/clerk.ts`
- `apps/web/worker/__tests__/admin-clerk.test.ts`

**Out of scope**
- Rewriting JWT verification / JWKS
- Clerk TanStack Start `clerkMiddleware` / AuthButtons
- MCP auth (`checkAuth` vs `checkAdminAuth`) — separate finding

## Git workflow

- Commit: `fix(web): do not treat Clerk org role as site admin`
- Conventional commits. No force-push.

## Steps

### Step 1: Drop `o.rol` from `claimRole`

Remove the `payload.o` branch. Keep `metadata.role` and `publicMetadata.role`.
Update the comment: org role is not application admin.

**Verify**: `rg "o\\.rol|payload\\.o" apps/web/worker/admin/clerk.ts` → no matches.

### Step 2: Flip the test

Replace the `o.rol === 'admin'` **true** case with:

- `isClerkAdmin(makePayload({ o: { rol: "admin" } }), env)` is **false**
- allowlist still true
- `publicMetadata.role === "admin"` still true
- `metadata.role === "admin"` still true

**Verify**: `pnpm --filter @aidr/web test -- worker/__tests__/admin-clerk.test.ts`

## Test plan

- New/changed case: org admin claim alone is not enough.
- Keep existing allowlist and publicMetadata tests.
- Pattern: `apps/web/worker/__tests__/admin-clerk.test.ts`.

## Done criteria

- [ ] `claimRole` does not read `o.rol`
- [ ] Test asserts `o.rol` is insufficient
- [ ] Admin-clerk tests pass
- [ ] `plans/README.md` updated

## STOP conditions

- Production currently has empty `NEWS_ADMIN_USER_IDS` and relies only on
  org-admin (check wrangler secret / `.env` **key names only**, never print
  values). If so, STOP and report; operator must set the allowlist first.

## Maintenance notes

- Session token customization in Clerk Dashboard must not reintroduce `o.rol`
  as the admin signal.
- Reviewers: confirm MCP still uses the token path; this change is REST admin
  Clerk JWT only.
