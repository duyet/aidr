# Email contributions (submit@aidr.today)

Status: implemented in code, not deployed. Owner steps at the end.

Signed-in readers can contribute by email: forward a news link, reply to a
digest or an acknowledgement with a fix, or write a comment. Mail is accepted
only from an address that belongs to an AI;DR account.

## Architecture (owner decision)

```
sender MTA ─▶ Cloudflare Email Routing (submit@aidr.today)
                 │ rule: Send to a Worker
                 ▼
     aidr-email Worker (apps/email, its own package + wrangler.toml)
       size cap → loop guard → From = envelope → Cloudflare auth result
       → account lookup → parse minimal fields → INSERT inbound_emails
       (shared `aidr` D1; no LLM, no review, no outgoing mail)
                 │
                 ▼  hourly
     aidr Worker (apps/web), pipeline step `inbound-email`
       pending rows → submitStory / submitSuggestion / comment
       → mark processed → acknowledgement from notes@ (send binding)
       → review-suggestions / review-submissions judge them in the same run
```

- `apps/email` is a separate workspace package (`@aidr/email`) with one
  dependency, `postal-mime`. It shares only the D1 database with
  `apps/web`; migrations stay in `apps/web/migrations`.
- The email Worker cannot do more than write a row. Everything that touches
  the feed or sends mail happens in the existing pipeline, through the same
  functions as the web forms.
- The cost is latency: a contribution is acted on at the next hourly run,
  not in seconds.

## Sender validation (apps/email)

Every check fails closed. Nothing is ever sent back from the email Worker
(no backscatter). Only oversize mail is rejected at SMTP time
(`setReject`), which makes the sending server, not us, tell the sender.

1. Size: `rawSize` over 1 MiB is rejected before the stream is read.
   Attachments are parsed by postal-mime but never read or stored.
2. Loop guard (`src/loop.ts`): ignore when the envelope sender is empty, is
   `MAILER-DAEMON`/`postmaster`/`noreply`-style, or is any `@aidr.today`
   address; when `Auto-Submitted` is anything but `no`; when `Precedence` is
   bulk/list/junk/auto_reply; when `List-Id`, `List-Unsubscribe`,
   `X-Autoreply`, `X-Autorespond` or `X-Auto-Response-Suppress` is set; when
   the content type is `multipart/report` (DSN/MDN).
3. Header `From` must equal the envelope sender. Forwarding services that
   rewrite the envelope (SRS) are not supported in v1.
4. Authentication (`src/auth.ts`): Email Routing already rejects mail that
   fails both SPF and DKIM, and mail that fails a DMARC reject policy. That
   is not enough: `gmail.com` publishes `p=none`, so anyone can DKIM-sign
   with their own domain and put a Gmail address in `From:`. We read the
   `Authentication-Results` header with Cloudflare's authserv-id, looking
   only above the first `Received:` line (every relay prepends one, so a
   header the sender wrote, even with Cloudflare's id, sits below it), and
   require a pass aligned with the From domain: `dkim=pass` with `header.d`
   equal to or a parent of it, or `spf=pass` with `smtp.mailfrom` in it.
   `dmarc=fail` always ignores. No such header: ignore.
5. Identity (`src/identity.ts`): the address (lowercased) must match exactly
   one live `clerk_users.email` with `email_verified = 1` (duplicates are
   ambiguous and ignored), or any address in `clerk_verified_emails` (0041)
   for exactly one live account. Those rows are the addresses Clerk already
   marks verified, rewritten on each webhook and clerk-sync. `email_verified`
   (migration 0040) is Clerk's own
   `verification.status === "verified"` for that address, written by the
   Clerk webhook and by `POST /api/admin/clerk-sync`
   (`clerkEmailVerified` in `worker/clerk-users.ts`).
6. Dedupe on a hash of `Message-ID`; at most 20 stored messages per user per
   day.

Ignored mail becomes an `inbound_emails` row with `status = 'ignored'`, the
reason and a 16-char sender hash, and nothing else: no address, no subject,
no text. At most 200 such rows are written per hour so a flood cannot fill
D1; after that, ignored mail leaves no trace at all.

## Parsed fields (pending rows)

`postal-mime` parses the message. Text is `text/plain`, else HTML converted
to text, capped at 20 000 chars before splitting. Stored:

- `sender_email` (for the ack; cleared once processed), `user_id`,
  `message_id` (for `In-Reply-To`), `subject` (≤ 300).
- `own_text` (≤ 2 000): what the user wrote above the first quote header
  (`On … wrote:`, `-----Original Message-----`, Vietnamese
  `Vào … đã viết:`), `>` quoted line, signature delimiter `-- ` or forward
  marker.
- `links`: story links in the user's own text; `forwarded_links`: story
  links in a forward's quoted part (a reply's quoted part is our own mail
  and is never kept). Links drop `mailto:`, `aidr.today`, images and
  unsubscribe/tracking/preferences URLs; `utm_*`, `fbclid`, `gclid` and the
  fragment are stripped so `submitStory`'s exact-URL dedupe works. At most
  10 of each.
- `is_forward` (`Fwd:`-style subject or forwarded-message marker),
  `is_reply` (`Re:`-style subject).
- `story_ref` / `story_lang`: from the `submit+<id8>[.en]@` subaddress, else
  a `[aidr:<id8>[:en]]` subject marker (kept by "Re:" replies), else exactly
  one aidr.today story link in the user's own text.

A message with no own text and no links is ignored as `empty` (for example a
reply that only quotes the digest).

## Processing (apps/web, step `inbound-email`)

Runs after `qa-translations` and before `review-suggestions`, so new rows
are reviewed in the same run. A dry run only classifies the pending batch
and records what it would do: no row is claimed or written and no mail is
sent. `steps: ["inbound-email"]` runs it alone. Up to 25 rows per run, each
claimed (`pending` → `processing`, conditional UPDATE) so two runs never
handle one row twice; stale claims return to `pending` after an hour.

Fixed rules (`worker/email-intake/classify.ts`), no LLM:

1. Story reference + own text → suggestion on that story (`submitSuggestion`,
   item resolved by id prefix among published items, `lang` = `vi` unless the
   reference carries `en`). A first line `title:` / `summary:` (or
   `tiêu đề:` / `tóm tắt:`) makes it a fixed-field edit; otherwise it is a
   free-form `auto` suggestion and the reviewer decides what it changes.
   Unknown story or refused suggestion (for example an English summary edit)
   → kept as a comment with the reason.
2. Forward with exactly one link (own links first, then forwarded links) →
   story submission (`submitStory`; title from the cleaned subject, own text
   as the note).
3. New message (not a reply, not a forward) whose own text is one link plus
   at most 280 chars → submission. A reply with a link is an opinion about
   our mail, so it stays a comment.
4. Anything else → comment: the row keeps `own_text` (or, for an ambiguous
   forward, only its links) for the owner to read.

The row becomes `processed` with `outcome_kind`, `outcome_id`
(submission/suggestion id), `item_id` and `reason`; `sender_email` is
cleared, and `own_text` too unless it is a comment.

### Acknowledgement

Sent by the step from `notes@aidr.today` to the stored, validated address
(never to a `Reply-To` the sender chose):

- `Reply-To: submit@aidr.today` (`SUBMIT_EMAIL` in `src/lib/site.ts`), so a
  reply comes back to the intake;
- `In-Reply-To`/`References` set to the user's `Message-ID`;
- `Auto-Submitted: auto-replied`, so the user's auto-responder stays quiet;
- subject `Re: <subject> [aidr:<id8>]` when a story is known, so a reply
  threads back to the same story.

A responder that ignores `Auto-Submitted` can loop at most 20 times a day
(the per-user cap). Text echoed back is HTML-escaped and cut to 300 chars.
Verdicts are not mailed; they show on `/contribute` (follow-up).

### Digest Reply-To

`SubscriberMail.replyTo` (`worker/mail/send.ts`). Subscriber mail
(digest, confirm, welcome, campaigns) sends `Reply-To: submit@aidr.today`
unless `EMAIL_REPLY_TO` overrides it. Acks use the same address.

## Extra addresses

`/contribute` lists the addresses Clerk has already verified for the signed-in
account (`ContributorEmails`, `fetchContributorEmails`). There is no second
confirmation mail. The email Worker accepts a non-primary address only when
`clerk_verified_emails` names exactly one live account. Adding another address
is done in the Clerk account; the next webhook or `POST /api/admin/clerk-sync`
rewrites that table.

## Prompt injection

The email Worker makes no LLM call and only writes `pending` rows. The step
makes no LLM call and never sets a status beyond `pending` on what it
creates. Text reaches a model only through the existing review gates
(`buildSubmissionReviewPrompt` with `escapePromptPayload`; the suggestion
fidelity + safety gate, which can only lower ratings, and the output guard).
Commands in a body ("approve", "ignore previous instructions") are plain
text. Field and story selection are fixed rules, never a model.

## Privacy and retention

- Raw MIME is never stored or logged. The email Worker logs only
  `inbound-email pending|ignored <reason>`.
- Pending rows hold the fields above. Processed rows drop the address
  immediately and the text unless it is a comment.
- The step purges each run: ignored rows after 30 days, comment text after
  90 days, all rows after 365 days.
- Verified addresses are replaced from Clerk on each account upsert. A
  soft-deleted account no longer matches, because the lookup joins
  `clerk_users.deleted_at IS NULL`.

## Deploy

1. Apply the migration: `pnpm --filter @aidr/web d1:migrate`
   (`0040_email_contributions.sql`, then `0041_clerk_verified_emails.sql`)
   before the web deploy (the Clerk upsert writes `email_verified` and
   replaces `clerk_verified_emails`), then run `POST /api/admin/clerk-sync`
   once so existing accounts get their verified addresses.
2. Deploy `aidr` (CI on push to master). It must be live before mail arrives
   so the `inbound-email` step exists, though rows simply wait otherwise.
3. Deploy the email Worker: `pnpm --filter @aidr/email deploy`
   (`wrangler deploy`, config `apps/email/wrangler.toml`, Worker
   `aidr-email`, D1 binding `DB` to `aidr`). No secrets.
4. CI follow-up (not built): a job in `.github/workflows/` that runs on
   changes under `apps/email/**` → `pnpm install --frozen-lockfile`,
   `pnpm --filter @aidr/email test`, `pnpm --filter @aidr/email check-types`,
   then `pnpm --filter @aidr/email deploy` with the same
   `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets the web deploy
   uses (token needs Workers Scripts:Edit; D1 is bound, not written, at
   deploy).

## Owner steps (manual, not applied)

1. Email Routing for aidr.today: Dashboard → aidr.today → Email → Email
   Routing → enable (adds MX `route1/2/3.mx.cloudflare.net` and an SPF TXT
   on the apex). Check first that no other inbound mail provider holds the
   apex MX. Email Sending (`send_email`) does not need these and coexists.
   CLI: `pnpm exec wrangler email routing enable aidr.today`.
2. Routing rule: Email Routing → Routing rules → Create: custom address
   `submit@aidr.today`, action "Send to a Worker", Worker `aidr-email`.
   For `submit+<id>@` story addresses also enable Settings → Subaddressing;
   without it the subject marker and story links still work.
3. Send one real message from Gmail and one from a custom domain, then
   `pnpm exec wrangler tail aidr-email`. Check the raw headers: Cloudflare
   must write a plain `Authentication-Results` header above its first
   `Received:` line, with an authserv-id matching `CLOUDFLARE_AUTHSERV` in
   `apps/email/src/auth.ts`. If it uses another id, writes it below
   `Received:`, or only writes `ARC-Authentication-Results`, every message is
   ignored as `unauthenticated` (fail closed) until `auth.ts` is adjusted.
   `SELECT status, reason, COUNT(*) FROM inbound_emails GROUP BY 1, 2`
   shows the outcomes.

## Owner decisions

1. Account emails count only when Clerk marks them verified (stored as
   `clerk_users.email_verified`).
2. SRS forwarders (envelope differs from header From) are ignored in v1.
3. Subscriber mail and acks use `Reply-To: submit@aidr.today`
   (`EMAIL_REPLY_TO` overrides the digest).
4. No admin UI for comments now. Verdicts are not mailed back; they show on
   `/contribute`.

## Follow-ups

- `src/components/system/RunWorkflowGraph.tsx` groups pipeline steps for the
  /data graph; `inbound-email` is not in a group yet.
- CI job for `apps/email` (see Deploy).
