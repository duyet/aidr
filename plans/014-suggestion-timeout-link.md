# Plan 014: A suggestion that is still reviewing links to the contributions list

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/src/components/suggest/SuggestForm.tsx`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/410

## Why this matters

When instant review does not finish in 45 seconds, the form says the result is in "your contributions" and links to `/submit`. `/submit` redirects to `/contribute/new`, which is the empty story form. The list headed as the reader's contributions is `/contribute` (`ContributeShell mode="list"`). The reader never sees the row where the verdict lands.

## Current state

```tsx
// apps/web/src/components/suggest/SuggestForm.tsx:102-110
  if (status === "timeout") {
    return (
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {vi
          ? "Vẫn đang duyệt. Xem kết quả ở "
          : "Still reviewing. See the result in "}
        <a href="/submit" className="underline underline-offset-2">
          {vi ? "đóng góp của bạn" : "your contributions"}
        </a>
```

`apps/web/src/routes/contribute.index.tsx` mounts `ContributeShell mode="list"` at `/contribute`. `apps/web/src/routes/submit.tsx` is a 301 to `/contribute/new`. Leave that redirect in place.

`lang` is already in scope in this component (`const vi = lang === "vi"`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run src/components/suggest/SuggestForm.test.tsx` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/src/components/suggest/SuggestForm.tsx src/components/suggest/SuggestForm.test.tsx` | exit 0 |

Do not run the full web test suite or `check-types`. If no SuggestForm test file exists, create `src/components/suggest/SuggestForm.timeout.test.tsx`.

## Scope

**In scope**:
- `apps/web/src/components/suggest/SuggestForm.tsx`
- one new or existing test file under `apps/web/src/components/suggest/`

**Out of scope**:
- `submit.tsx`, `contribute.new.tsx`, the review timeout duration.

## Git workflow

- Branch: `advisor/014-suggestion-timeout-link`
- Commit: `fix(web): link a slow suggestion review to the contributions list`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Point the link at /contribute

Change the timeout anchor `href` from `/submit` to the contributions list with the current language. Use `withLang("/contribute", lang)` from `apps/web/src/lib/locale-url.ts` so `?lang=` matches the rest of the site. Keep the visible words.

**Verify**: `pnpm exec biome lint apps/web/src/components/suggest/SuggestForm.tsx` → exit 0

### Step 2: Test the href

Render the timeout state, or export the href if rendering the whole form is heavier than the existing suggest tests. Look at `SignInToSuggest.test.tsx` for the render setup before inventing a new harness. Expect the anchor's `href` to be `/contribute?lang=vi` when `lang` is `vi`, and `/contribute?lang=en` when `lang` is `en`. Expect it not to be `/submit`.

If the timeout branch cannot be reached without a timer, export a one-line `suggestionTimeoutHref(lang)` and use it as the `href`. The test calls that function.

**Verify**: the targeted vitest command exits 0.

## Test plan

The assertion is the href string, not a navigation. Do not follow the redirect.

## Done criteria

- [ ] The timeout link href is `/contribute?lang=vi` or `/contribute?lang=en`
- [ ] `/submit` remains a redirect elsewhere and is not the timeout href
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the touched files exits 0

## STOP conditions

- The timeout excerpt does not match.
- `/contribute` is no longer the list route. Stop.
- The targeted test fails twice.

## Maintenance notes

`/submit` stays the legacy URL for shared links. Do not retarget it in this plan.
