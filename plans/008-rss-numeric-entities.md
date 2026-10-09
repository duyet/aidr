# Plan 008: Decode numeric character references in RSS text

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/sources/rss.ts apps/web/worker/__tests__/rss.test.ts`
> On a mismatch with the excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/404

## Why this matters

RSS titles and descriptions often contain numeric character references (`&#8217;`, `&#x27;`) and a few named references (`&nbsp;`, `&rsquo;`, `&hellip;`). `decodeXml` only replaces `&lt;`, `&gt;`, `&quot;`, `&apos;`, and `&amp;`. Those titles are stored and shown to readers with the raw reference. Telegram later escapes HTML, so this is a display bug, not an injection bug. Do not add a second decode after HTML is stripped in a way that turns entities into tags that survive `stripHtml`.

## Current state

- `apps/web/worker/sources/rss.ts` — `decodeXml` is private. `parseRssItems` is the public entry the tests call.
- `apps/web/worker/__tests__/rss.test.ts` — pattern for `parseRssItems` cases.
- `apps/web/worker/mail/content.ts` has a different `parseRssItems`. Do not edit it.

```ts
// apps/web/worker/sources/rss.ts:67-76
function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
```

`&amp;` must stay last so a double-encoded `&amp;lt;` becomes `&lt;` and not `<`.

There is a second `parseRssItems` in `apps/web/worker/mail/content.ts`. Leave it alone.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/rss.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/sources/rss.ts apps/web/worker/__tests__/rss.test.ts` | exit 0 |

Do not run the full web test suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/sources/rss.ts`
- `apps/web/worker/__tests__/rss.test.ts`

**Out of scope**:
- `apps/web/worker/mail/content.ts`
- `apps/web/scripts/verify-source-feeds.ts`

## Git workflow

- Branch: `advisor/008-rss-numeric-entities`
- Commit: `fix(web): decode numeric entities in RSS titles`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Decode numeric and a short named set

Extend `decodeXml` after the named replacements and before the final `&amp;` replacement:

- Decimal `&#8217;` and hex `&#x2019;` / `&#X27;` become the corresponding Unicode character.
- Reject code points outside 0x0–0x10FFFF, and surrogates, by leaving the reference unchanged.
- Also map these named references once: `&nbsp;` to a normal space, `&rsquo;` to ’, `&lsquo;` to ‘, `&ldquo;` to “, `&rdquo;` to ”, `&mdash;` to —, `&ndash;` to –, `&hellip;` to ….
- Do not run the replacement in a loop that re-decodes the output (one pass).

Keep CDATA unwrapping first and `&amp;` last.

**Verify**: `pnpm exec biome lint apps/web/worker/sources/rss.ts` → exit 0

### Step 2: Test through parseRssItems

Add a `parseRssItems` test whose `<title>` is `AT&amp;T&#8217;s model &#x26; more`. Expect the title `AT&T’s model & more`. Add a case whose description contains `&nbsp;` and expect a normal space, not the letters `nbsp`.

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/rss.test.ts` → all pass.

## Test plan

Call `parseRssItems` from `worker/sources/rss.ts`. Do not export `decodeXml` only to unit-test it, unless the title assertion cannot see the character. The title assertion is enough.

## Done criteria

- [ ] Numeric decimal and hex references in a title survive `parseRssItems` as characters
- [ ] `&amp;` is still decoded after the other entities, once
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0
- [ ] `mail/content.ts` is untouched

## STOP conditions

- `decodeXml` in `rss.ts` does not match the excerpt.
- A test requires editing `mail/content.ts`.
- The targeted test fails twice.

## Maintenance notes

Feeds that put literal `&amp;lt;` in a title should still display `&lt;`, not `<`. Reviewers should check the `&amp;` replacement remains last.
