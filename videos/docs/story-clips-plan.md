# Story clips: a video per AI;DR item

> **Proposal. Not implemented.** Nothing here exists yet. It needs the owner's decisions (listed at the end) before any code is written.

## Goal

When AI;DR posts a news item to a social channel, attach a short branded clip built from that item: headline, category, source, rank, date. Built automatically, with no person or model in the loop per clip.

## The constraint

A Cloudflare Worker cannot render video. Rendering needs headless Chrome and FFmpeg. So the Worker can decide *what* to render and *use* the result, but the render itself must run somewhere else.

## Where to render

| Option | For | Against |
|--------|-----|---------|
| **GitHub Actions job** | The repo already uses Actions as an ingest watchdog. No new vendor. | Scheduled workflows are routinely delayed or skipped by GitHub. Render minutes are limited. |
| HyperFrames cloud or Lambda render | No runner to maintain. | New account, credentials and cost. |
| A container | Full control. | New infrastructure to run and pay for. |

**Recommendation:** start with a GitHub Actions job. Move only if render time or reliability forces it.

## The template

One fixed project, `videos/story-clip/` (planned), driven by variables:

| Variable | Example |
|----------|---------|
| `headline` | the stored bullet text |
| `category` | `regulation` |
| `source` | the source name |
| `rank` | `3` |
| `date` | `2026-09-30` |
| `lang` | `en` or `vi` |
| `thumbnail` | the story image, or none |

Rules for the template:

- Deterministic. The same variables give the same video.
- No LLM in the render loop. Text comes from stored fields only.
- 9:16 master, plus 1:1.
- 8–12s.
- Brand spec from `videos/brand/frame.md`; motion from the `aidr-motion-designer` skill.

## Data flow

1. The Worker selects stories. Use the same selection the trending notifier already makes; do not add a second ranking.
2. The Worker writes a clip job record for each selected story and language.
3. The renderer claims a job, renders the template with that story's variables, and uploads the MP4 to object storage.
4. The notifier uses the first-party clip when it is ready. When it is not, it takes today's photo path unchanged.

## What already exists on the Telegram side

From `apps/web/ALGORITHM.md` (`worker/notify/video.ts`):

- A manifest video is preflighted with bounded Range requests, never a full download.
- It must be an MP4, at most 20 MB and at most 300 s, with size and duration known.
- A proven video-only story is sent with `sendVideo`.
- Any skip or Telegram error falls back to the photo path, then to text, so nothing double-posts.

A rendered clip would have to pass the same preflight.

## New dependency: storage

`apps/web/wrangler.toml` has no R2 bucket binding today. Storing rendered clips is a new dependency, whichever store is chosen.

## Phases

| Phase | Work | Needs |
|-------|------|-------|
| 0 | Build the template. Render a batch by hand from one day's stories. | Nothing new |
| 1 | Render in CI. Upload to storage. | Storage decision |
| 2 | Attach the clip to the Telegram post. | Phase 1, and a notify change |
| 3 | Other platforms. | API credentials that do not exist yet |
| 4 | Metrics: does a clip change engagement? | Phases 2–3 |

## Risks

- **Third-party images.** A story thumbnail inside a rendered clip is a copyright question that a linked preview is not. The template must work with no thumbnail.
- **Headline accuracy.** Use the stored bullets only. No rewriting at render time.
- **Render time and cost per clip.** Unknown until Phase 0 measures it.
- **Delay and double-posting.** A post must never wait on a clip, and a late clip must never cause a second post.

## Rule

Read `apps/web/ALGORITHM.md` before touching ingest, ranking or notify, and update it in the same change when notify behaviour changes.

## Open decisions for the owner

1. Which stories get a clip: every trending post, the daily digest only, or the top N?
2. Should a post wait a bounded time for its clip, or always post on time and use clips only on slower channels?
3. Where do rendered clips live, and for how long?
4. May a clip include the story's thumbnail, or is it text and brand only?
5. Which platforms after Telegram, and who holds those accounts?
6. Is there a music bed, and from where?
