# Plan 032: Characterization tests for requireClerkUser

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/src/lib/clerk-auth-fn.ts`
> On a mismatch with the excerpt, STOP. Do not change `requireClerkUser` unless a test proves the catch drops a cookie session that had a userId. If you think the catch is wrong, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/428

## Why this matters

`requireClerkUser` is the identity check for votes, story submissions, translation suggestions, and contributor-email changes. No test imports it. A thrown `auth()` falls through to a Bearer token or `"Sign in required"`. A cookie session must win and must not call `verifyClerkToken`.

## Current state

```ts
// apps/web/src/lib/clerk-auth-fn.ts:39-65
export async function requireClerkUser(): Promise<{
  userId: string;
  userName: string;
}> {
  try {
    const { auth } = await import("@clerk/tanstack-react-start/server");
    const session = await auth();
    if (session.userId) {
      const claims = (session.sessionClaims ?? {}) as ClerkPayload;
      return {
        userId: session.userId,
        userName: displayName({ ...claims, sub: session.userId }),
      };
    }
  } catch {
    // No Clerk request context (tests, non-Start callers) — try Bearer.
  }

  const token = bearerToken();
  if (!token) throw new Error("Sign in required");
  // verifyClerkToken follows
}
```

Votes and suggestions call this function. Do not edit those callers.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run src/lib/clerk-auth-fn.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/src/lib/clerk-auth-fn.test.ts` | exit 0 |

Do not run the full web suite or `check-types`.

## Scope

**In scope**:
- `apps/web/src/lib/clerk-auth-fn.test.ts` (create)

**Out of scope**:
- `clerk-auth-fn.ts`, unless the STOP condition says the excerpt moved and the test cannot import the function. Do not "fix" the catch.

## Git workflow

- Branch: `advisor/032-require-clerk-user-tests`
- Commit: `test(web): cover requireClerkUser cookie and bearer paths`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Mock the two auth paths

Create the test file. Mock `@clerk/tanstack-react-start/server` `auth` and `../../worker/admin/clerk.js` `verifyClerkToken`. Cover:

1. `auth()` resolves `{ userId: "user_1", sessionClaims: { username: "ada" } }`. Expect `{ userId: "user_1", userName: "ada" }` and `verifyClerkToken` not called.
2. `auth()` throws, and there is no Authorization header. Expect a throw whose message is `Sign in required`. `verifyClerkToken` not called.
3. `auth()` throws, Authorization is `Bearer not-a-jwt`, and `verifyClerkToken` resolves null. Expect `Sign in required`.
4. `auth()` throws, Bearer is present, `verifyClerkToken` resolves a payload with `sub`. Expect that `sub` as `userId`.

Read `displayName` in the same file so the username expectation matches it. If username is not what `displayName` returns for `{ username: "ada", sub: "user_1" }`, expect what `displayName` actually returns. Do not change `displayName`.

**Verify**: `pnpm --filter @aidr/web exec vitest run src/lib/clerk-auth-fn.test.ts` → all pass.

## Test plan

Import `requireClerkUser` from `./clerk-auth-fn`. The mocks replace Clerk. The test does not reimplement the function.

## Done criteria

- [ ] Four cases above exist and pass
- [ ] A cookie `userId` never calls `verifyClerkToken`
- [ ] `clerk-auth-fn.ts` is unmodified
- [ ] Biome lint on the test file exits 0

## STOP conditions

- The excerpt does not match.
- Mocking the dynamic `import("@clerk/tanstack-react-start/server")` does not intercept `auth`. Try `vi.mock` with the module id the source imports. If that cannot intercept a dynamic import, STOP and report the vitest error.
- You believe the catch should change. Stop. This plan is tests only.

## Maintenance notes

A change to cookie-vs-bearer order should fail case 1. Do not weaken that case to accept either path.
