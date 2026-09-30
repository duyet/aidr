# Series

Each series has a spec in `videos/specs/`. A spec is a brief template: copy it into a new project as the starting `BRIEF.md`.

## Launch

- **Purpose:** introduce AI;DR. Too much AI news; AI;DR ranks it down to the eight stories that matter, every day, in English and Vietnamese.
- **Length:** 30s.
- **Direction:** One Semicolon. Ink on full-bleed yellow, large letterforms, the semicolon as the hinge of every scene. Mixed in: Marker Pass, Two Tongues, New Tab.
- **Language:** English, with one Vietnamese moment.
- **Formats:** 16:9, 9:16, 1:1.
- **Inputs:** live capture of aidr.today, the day's `bullets_en` and `bullets_vi`, the logo paths.
- **Status:** in progress at `videos/aidr-launch/`.
- **Spec:** `specs/launch.md`.

## Launch, Vietnamese cut

- **Purpose:** the same film for the Vietnamese audience (Telegram `@aihomnay`).
- **Length:** 30s.
- **Formats:** same three.
- **Inputs:** the approved launch storyboard; on-screen copy from `bullets_vi`; a capture of `https://aidr.today/?lang=vi`.
- **Reuse:** the launch storyboard, frames and music. Change copy and faces only: EB Garamond and Source Sans 3 both ship Vietnamese subsets, and Be Vietnam Pro (`apps/web/public/fonts/`) is available for heavier Vietnamese headlines. The bilingual beat flips: Vietnamese leads, English is the one other-language moment.
- **Status:** planned.
- **Spec:** `specs/launch-vi.md`.

## Feature release

- **Purpose:** announce one new feature. One feature per video.
- **Length:** 15–20s.
- **Formats:** 16:9 and 9:16; 1:1 when it will be posted to a feed.
- **Inputs:** the changelog entry for the feature, and a capture of the page where the feature lives.
- **Reuse:** brand spec, the semicolon open and the lockup close from the launch film, the music bed.
- **Status:** planned.
- **Spec:** `specs/feature-release.md`.

## New source

- **Purpose:** announce a newly added source, such as arXiv.
- **Length:** 10–15s.
- **Formats:** 9:16 and 1:1 first; 16:9 if needed.
- **Inputs:** the source's entry under `apps/web/worker/sources/`, and sample headlines from that source taken from the live site.
- **Reuse:** brand spec, ranked-row motif, lockup close.
- **Status:** planned.
- **Spec:** `specs/new-source.md`.

## Story clip

- **Purpose:** a short clip per news item, attached to the social post for that item.
- **Length:** 8–12s.
- **Formats:** 9:16 master, plus 1:1.
- **Inputs:** one story's stored fields (headline, category, source name, rank, date, language, thumbnail).
- **Reuse:** one fixed template project, driven by variables. No per-clip design work.
- **Status:** planned. Nothing is built. The proposal and open decisions are in [`story-clips-plan.md`](story-clips-plan.md).
- **Spec:** `specs/story-clip.md`.
