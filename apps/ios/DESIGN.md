# AI;DR for iPhone: design guide

The reference every lane follows. Plan: [plans/ios-app.md](../../plans/ios-app.md). Pipeline facts: [apps/web/ALGORITHM.md](../web/ALGORITHM.md). Audit of the five lanes: [docs/audit-2026-11-28.md](docs/audit-2026-11-28.md). Raw backend measurements: [docs/backend-measurements-2026-11-28.md](docs/backend-measurements-2026-11-28.md).

Goal: a first-class Apple news reader people open every day. Instant, offline-first, always fresh, honest about how fresh, simple.

Sources are tagged like [H1] (HIG), [A1] (Apple developer docs), [W1] (WWDC), [R1] (other). Full links in [Sources](#sources). A claim with no tag is a measurement of our own backend (labelled "measured") or a design judgment (labelled "judgment").

Method notes. The ios-design and ui-taste skills and their references were read in full. The optional Uizze reference connection returned no tool in this session, so it was skipped. Findings about Artifact, Particle and Hacker News clients are not included, because the pages could not be fetched.

## 1. Principles

1. **Open to content.** The first frame after launch is yesterday's edition from disk, never a spinner or a splash. The launch screen matches the first screen and has no text or branding. [H3] "Launch instantly", "Restore the previous state"; [H2] "Show something as soon as possible".
2. **Say how old it is.** Every screen that shows edition content says how long ago it was confirmed current, and says so again when offline. Never present a saved edition as live. [H10] "Consider integrating status feedback into your interface"; [R6] NYT "clearly indicates when the content was last updated" (third-party review).
3. **Cache first, network second.** Paint from disk, revalidate in the background, swap in new data without moving what the reader is looking at. This is stale-while-revalidate. [R1] RFC 5861; [R3] Reeder keeps your position and lets new items fill in above it.
4. **Native structure, glass on the system layer only.** Tab bar for peers, navigation stack for drill-down, sheets for bounded tasks, system search. Custom glass only on a few controls, never in the content layer. [H1], [H12], [H13] "Don't use Liquid Glass in the content layer", [A23] "Reduce your use of custom backgrounds".
5. **Calm by default.** One optional notification a day, at a time the reader chose, with honest copy. No badges, no streak threats, no re-engagement pings, no marketing. [H5] "Build trust by accurately representing the urgency"; [H6] "Avoid sending multiple notifications for the same thing"; [R2] guideline 4.5.4.
6. **Content before chrome.** The first headline starts in the top third of Today. One accent colour (the AI;DR yellow). Controls that change the view live in a menu, not in a row of icons. [H19]; ui-taste "one accent, locked".
7. **Everything scales.** Text styles through accessibility sizes, VoiceOver labels on every icon-only control, 44 pt targets, Reduce Motion and Increase Contrast honoured, light and dark both real. [H15], [H16], [H14], [W5] reading-app accessibility.
8. **Two editions, no fallback.** VI and EN never stand in for each other. Every state string exists in both. Offline, empty and error copy are localized, not translated at runtime.
9. **Prove it on the real surface.** A lane is done when the CI screenshot shows the state, in the appearance it claims (see the audit: five lanes captured "dark" screenshots that are light).

## 2. Freshness and offline architecture

### 2.1 What the backend does today (measured 2026-11-28)

Raw headers are in [docs/backend-measurements-2026-11-28.md](docs/backend-measurements-2026-11-28.md). Summary, and two corrections to the working assumptions.

| Endpoint | No `?lang=` | With `?lang=en` (or `vi`) |
|---|---|---|
| `/api/feed?days=3` | `private, no-store`, ETag present, `Vary: Cookie, Accept-Language` | `public, max-age=60, s-maxage=120, stale-while-revalidate=300`, ETag, edge HIT/MISS |
| `/api/public` | `private, no-store`, ETag | `public, max-age=120, s-maxage=300, swr=600`, ETag |
| `/api/story/:id` | `private, no-store`, no ETag | `public, max-age=300, s-maxage=600, swr=3600`, no ETag |
| `/api/week/:week` | `public, max-age=60, s-maxage=300, swr=600` (open week), no ETag | same, language-neutral |
| `/api/feed/freshness` | `public, max-age=60, s-maxage=120`, 164 bytes | same |
| `/api/thumb/:id` | needs `?u=<image_url>`, else 404 `no-store` | with `u`: 302 to the publisher image, `public, max-age=300` (resize did not happen for 2 of 2 samples) |

Corrections.

- **The no-store behaviour is not inherent.** The server downgrades to `private, no-store` only when the URL has no single explicit `lang` (`localeCacheControl` in `apps/web/src/lib/locale-url.ts`). The app should always send `?lang=`. Then URLCache can store the JSON and the Cloudflare edge serves it.
- **ETag exists on feed and public, and 304 works.** `If-None-Match` on `?lang=en` returned 304 (0 bytes). But the tag changes on every cache fill because `getFeed` puts `updatedAt: Date.now()` in the body (`feed-queries.ts:585`). On the default URL two calls a second apart give different tags. Measured: `/api/feed?days=3&lang=en` and `&lang=vi` differ only in `lang` and `updatedAt`. `/api/story/:id` differs only in `permalink`.
- **Therefore `Feed.updatedAt` is the server's response time, not an edition time.** Do not show it as "updated". Edition time comes from `/api/feed/freshness` (`latestRun.finishedAt`). At measurement time the newest run had finished 25 min earlier while `lastFetchedAt` (newest item ingested) was 56 min old. Units differ: `updatedAt` is milliseconds, `lastFetchedAt` and run times are seconds.
- Payload sizes (measured, br/zstd): feed `days=1` 25 KB, `days=3` 106 KB (343 KB raw), `days=7` 277 KB, public 10 KB (29 KB raw), freshness 164 B. 153 items in 3 days, 130 with `image_url` on 20+ publisher hosts.
- Cadence: a run starts every 30 minutes with a 25 minute coalesce (ALGORITHM.md). A reader gains nothing from polling faster than the edge TTL of 120 s.

### 2.2 One cache for everything: ContentCache

Replace `SnapshotStore` with these types in `apps/ios/AIDRKit/Sources/AIDRKit/Content/`. Migrate every caller (TodayStore and each new lane store) in the same change, then delete `SnapshotStore`. Do not keep two caches that can disagree.

```swift
public enum ContentKey: Hashable, Sendable {
  case feed                       // /api/feed?days=3&lang=en  one entry, both languages inside
  case publicEdition(Lang)        // /api/public
  case story(id: String, Lang)    // /api/story/:id  (differs per language only in permalink)
  case week(String)               // "2026-W48"
  case freshness                  // /api/feed/freshness
}

public struct ContentRecord: Codable, Sendable {
  public var key: String          // stable string form of ContentKey
  public var fetchedAt: Date      // bytes last downloaded
  public var validatedAt: Date    // server last confirmed these bytes are current (200, 304, or unchanged probe)
  public var editionAt: Date?     // latestRun.finishedAt when known
  public var newestItemAt: Date?  // lastFetchedAt
  public var etag: String?
  public var schema: Int          // bump to drop incompatible entries
}

public actor ContentCache {       // disk + small memory layer
  public init(directory: URL = ContentCache.defaultDirectory)
  public func read(_ key: ContentKey) -> (data: Data, record: ContentRecord)?
  public func write(_ data: Data, record: ContentRecord, for key: ContentKey) throws
  public func markValidated(_ key: ContentKey, at: Date, edition: Date?)
  public func evict(now: Date)    // see 2.7
  public func clear()             // Settings: Clear cache
}

public actor ContentLoader {      // the only thing a screen talks to
  public func updates<T: Decodable & Sendable>(_ key: ContentKey, as: T.Type)
      -> AsyncStream<ContentState<T>>
  public func refresh(_ key: ContentKey, trigger: RefreshTrigger) async -> RefreshOutcome
}
public enum RefreshTrigger { case launch, foreground, pullToRefresh, retry, pathRestored, background }
public struct ContentState<T: Sendable>: Sendable {
  public var value: T?            // decoded from cache first, then from network
  public var record: ContentRecord?
  public var phase: Phase         // .idle, .refreshing, .failed(FetchFailure)
  public var freshness: Freshness // .fresh, .aging, .stale, .old (see 2.3)
}
```

Rules.

- Store the server's bytes untouched (exact replay, ETag stays valid). Decode on a background actor. Never decode in `body`.
- `APIClient` gains `get(_:query:ifNoneMatch:)` returning `.notModified` or `.body(Data, etag)`. Always add `?lang=en` to feed (one shared entry for both languages) and `?lang=<reader>` to story and public (permalink and stories are localized).
- Single flight per key. A pull to refresh that arrives while a foreground refresh is running joins it.
- Files. JSON in Application Support (survives low-disk purges, needed for the offline promise); images in Caches (regenerable). Set `isExcludedFromBackup` on both, every time you write [A22]. Use `.completeUntilFirstUserAuthentication` file protection so a background refresh can read and write after the first unlock [A21].
- Why not SwiftData: the payload is server bytes keyed by URL, replayed exactly, with no queries. Read state and saved stories are user data with queries; they may use SwiftData later (judgment; [A17], [W10]).
- The cache directory is injectable. If widgets ship, moving it to an App Group container is a one-line change. Free Apple IDs used with Sideloadly may not get App Groups, so decide at Phase 4 (judgment).
- `NetworkMonitor` (one `NWPathMonitor` wrapper, `@Observable`, started at launch) [A12]. Use it to (a) show the offline state, (b) trigger one refresh when the path returns to satisfied, (c) skip discretionary prefetch on constrained or expensive paths [A10], [A11]. Do not use it to veto a request; try the request and let it fail, then show the cache (judgment; [A9] documents the failure the app will see).

### 2.3 When to refetch (TTL per endpoint)

The edge TTL is 120 s and an edition lands every 30 min. Policy is three bands per key. "Probe" means `GET /api/feed/freshness` (164 bytes, edge-cached).

| Key | Fresh (no network) | Aging (silent revalidate) | Stale (label + visible refresh) | Notes |
|---|---|---|---|---|
| `feed` | validated under 2 min ago | 2 to 35 min | over 35 min | "Old edition" notice over 24 h. Keep the entry forever until replaced. |
| `freshness` | under 60 s | n/a | n/a | matches `max-age=60` |
| `publicEdition` | under 5 min | 5 to 35 min | over 35 min | Used by background refresh, notification, widgets. 10 KB instead of 106 KB. |
| `story` | under 10 min | on open, if over 10 min | n/a | Paint from the feed item first, then enrich from `/api/story`. |
| `week` | closed week: forever; `provisional: true`: under 5 min | on open | n/a | 12 KB |

How to refresh the feed (launch, foreground, pull, path restored):

1. If fresh, do nothing but update the label. Done.
2. Probe. If `latestRun.id` and `lastFetchedAt` equal what the record stored, call `markValidated` and stop. No 106 KB download. (The run id changes every 30 min even when no new item arrives, so ranking and TL;DR changes are not missed.)
3. Otherwise `GET /api/feed?days=3&lang=en` with `If-None-Match`. 304 means validated. 200 means store and publish.
4. If the probe fails, fall through to step 3 once. If that fails too, keep the cache and set the failure phase.

Until the backend makes the tag stable (ask B1), 304 only hits inside the 120 s edge window. The probe is what saves the bytes.

### 2.4 Background refresh

- Use `BGAppRefreshTaskRequest` with id `oneni.aidr.app.refresh` (already in `project.yml`) and the SwiftUI `.backgroundTask(.appRefresh(_:))` scene modifier [A6], [W2]. The system gives up to 30 seconds [A1]. It does not guarantee a start time, only "not before" `earliestBeginDate` [A3].
- Budget is not published. The system aligns refresh with app usage history: frequently used apps are more likely to be scheduled [W1]. Low Power Mode disables background refresh [A7]. So the app must be fully correct with zero background runs. Launch refresh is the primary path, background is a bonus.
- Schedule on every move to background and at the start of each handler (a new submit replaces the old one [A2]). `earliestBeginDate`: if the daily notification is on, the next (notification time minus 30 min); otherwise 60 min from now.
- Handler work, time-boxed to about 20 s: probe, `publicEdition` (10 KB), feed only if the probe says changed, top-N image prefetch, then `NotificationPlanner.replan` and `WidgetCenter.reloadAllTimelines()`. Save after each step. Stop at once on cancellation: observe it with `withTaskCancellationHandler` [A6].
- Do not use `BGProcessingTask` (for heavy, deferrable work [A1]) or a background `URLSession` (for large transfers [A1]). The payloads are small.
- Settings shows a one-line hint only when `backgroundRefreshStatus == .denied`. Never when `.restricted` [A7].
- To test on a device: the private `_simulateLaunchForTaskWithIdentifier` debugger call [A5]. Never ship it.
- Later, silent push removes the guessing: `content-available: 1`, `apns-priority: 5`, `apns-push-type: background`, rate limited above 3 per hour [A1]. The 30 minute cadence (2 per hour) fits. See backend ask B6.

### 2.5 Images

Measured: 130 of 153 items carry an `image_url` on more than 20 publisher hosts, some over 1 MB. `/api/thumb` currently redirects to the publisher.

Conflict to resolve. The plan says "images in a 200 MB URLCache". URLCache follows each publisher's headers, which vary and are often no-store, so it is not a reliable offline store [A8]. Decision: an app-owned `ImageStore` in AIDRKit.

- `ImageStore` actor. Key = SHA-256 of the URL plus a tier. Tiers: `row` (240 px longest side), `hero` (1200 px), `share` (original, memory only). Downsample at decode with ImageIO `kCGImageSourceThumbnailMaxPixelSize` [A20] so a 1 MB hero never becomes a 1200x800 bitmap in a row. Store the downsampled JPEG (q 0.8).
- Budget: 150 MB on disk, LRU by last access, 30 day max age. Memory: 40 MB `NSCache`. At the tier sizes that is roughly 600 heroes or 10,000 rows (estimate, not measured).
- Prefetch after each successful feed refresh: the 8 digest hero images and the first 20 row thumbs, 3 at a time, at most 6 MB per cycle. Skip on Low Data Mode and expensive paths unless the reader turned on "Download images on cellular" (default off) [A10], [A11]. User-initiated loads always go.
- A failed or missing image shows a category-coloured placeholder with the same aspect ratio. No layout shift. Never a black tile (see audit).
- Notification attachment: the `hero` tier file, copied to a temp URL. Limit for images is 10 MB [A13]. An invalid attachment makes the system drop the whole request, so on any attachment error schedule text-only [A13].
- Aspect. Most `image_url` values are link-preview cards (about 1.91:1, often with baked-in headline text). Never centre-crop them into a square. Rows use a 16:9 box or no image; the hero uses the image's own aspect ratio, capped at 60% of screen height.

### 2.6 Retry and backoff

- User-initiated (pull, "Try again"): one attempt, 15 s timeout, no hidden retry. Failure shows inline and keeps the cache.
- Automatic (launch, foreground, path restored): attempts at 0 s, 10 s, 60 s, 5 min, then stop until the next trigger. Add 20% jitter. Reset on success or on a fresh foreground. Honour `Retry-After` on 429 and 503.
- A 304 and a probe-unchanged both count as success.
- Treat NSURLErrorNotConnectedToInternet and NetworkConnectionLost as "offline", everything else as "couldn't refresh" [A9].
- Background path never retries; the next scheduled task is the retry.

### 2.7 Eviction

| Store | Keep | Evict when |
|---|---|---|
| feed | 1 entry | replaced; never expires (offline promise) |
| publicEdition | 1 per language | replaced |
| story | 300 most recently opened, 30 MB | LRU, checked once a day |
| week | 60, 1 MB | LRU by week |
| images | 150 MB | LRU by last access, over 30 days |
| everything | | `schema` bump, or Settings: Clear cache |

Run `evict(now:)` at most once a day on a low-priority task after launch. iOS may also purge Caches while the app is not running [A8]; images must be re-fetchable.

### 2.8 Freshness UX

Two timestamps, never confused.

- **Checked** = `validatedAt`. The last time the server confirmed the content is current. This drives the visible label, because it is the claim the app can honestly make.
- **Edition** = `editionAt` (latest run finish) and **newest story** = `newestItemAt`. Shown only in the details popover.

Strings (RelativeDateTimeFormatter, abbreviated unit style, locale from the reader language) [A27]. Tick once a minute with `TimelineView(.everyMinute)`.

| Where | EN | VI |
|---|---|---|
| Today, under the date title | 36 stories · Updated 3m ago | 36 tin · Cập nhật 3 phút trước |
| Tap the label (popover) | Checked 3m ago. Edition built 25m ago. Newest story 56m ago. | Đã kiểm tra 3 phút trước. Bản tin tạo 25 phút trước. Tin mới nhất 56 phút trước. |
| Refresh just ran, nothing new | Up to date (label shows this for 3 s, then the time) | Đã là mới nhất |
| Offline, cache exists | Offline · Saved 2h ago | Ngoại tuyến · Đã lưu 2 giờ trước |
| Refresh failed, online | Couldn't refresh. Showing the edition from 3h ago. Try again | Không làm mới được. Đang hiển thị bản tin từ 3 giờ trước. Thử lại |
| Stale over 24 h | This edition is from yesterday. Pull to refresh. | Bản tin này của hôm qua. Kéo xuống để làm mới. |
| Edition looks delayed (no run finished for 75 min) | Newer stories are delayed. | Tin mới đang chậm. |
| First launch, offline, no cache | Connect once to load today's edition. [Try again] | Kết nối một lần để tải bản tin hôm nay. [Thử lại] |

Where it shows.

| Screen | Freshness |
|---|---|
| Today | Label under the date title. Offline or failed state is one banner row directly under the masthead, not a second label. |
| Story | Nothing while online. When offline: a quiet "Saved copy" tag next to the source line. Links that need network open Safari and fail there. |
| Brief | Cover page shows "Edition of 28 Nov · 8 stories · 2 min". End page shows "Updated 3m ago. Next check when you open the app." |
| Calendar, Weeks, Day, Week | Past editions are immutable. No freshness label. Current month and open week show the Today label. |
| Settings | Row: "Last checked", row: "Stored on this iPhone: 38 MB. Clear". |
| Widget | "Updated 07:32" via `Text(date, style: .time)`. Never hide stale content behind a placeholder [H17]. |

New-stories pill. A refresh result never moves the list under a reader's finger.

- Compare ids of the new feed with the displayed one. If the reader is within the first screen and not scrolling, apply it silently with no animation for unchanged rows.
- Otherwise keep the old list, store the new one as pending, and show a pill under the nav area: "↑ 3 new stories" / "↑ 3 tin mới". Tap: scroll to top and apply. It disappears when the reader reaches the top. Same idea as Reeder, where new items "fill in above" the saved position [R3].
- No count when it is a re-rank of the same ids.
- Pull to refresh uses `.refreshable` [A16]. The system spinner is the only progress indicator [H9]. One light haptic only if new stories arrived; none otherwise. Haptics supplement the visible change, never replace it.

Loading and empty states.

- Never a skeleton when a cache exists. A skeleton only on first-ever launch, shaped like the final rows [H2].
- Never `ProgressView` on a full-screen white page.
- Empty or failed with no cache uses `ContentUnavailableView` [A28] with one action.
- VI never falls back to EN. A day with no Vietnamese TL;DR shows "Chưa có bản tiếng Việt cho ngày này" with a link to the story list, not English bullets.

### 2.9 How each screen reads the cache

| Screen | Reads | Cold start | Refresh trigger |
|---|---|---|---|
| Today | `updates(.feed)` | cache or first-run state | launch, foreground, pull, path restored |
| Story | feed item first, then `updates(.story)` | instant from feed item | on open if over 10 min |
| Day (calendar, weeks) | `.feed` if within 3 days, else the day page JSON the archive lane owns | cache | on open |
| Week | `updates(.week)` | cache | on open if provisional |
| Brief | `.feed` (tldr bullets, images) | cache | same as Today |
| Widget | `.publicEdition` from disk only | last snapshot | app reloads timelines after each refresh |
| Notification planner | `.publicEdition` | n/a | after every successful refresh |

## 3. Backend asks

Small, concrete, no change made by this work. Each ties to a measurement above.

- **B1. Stable ETag per edition.** Remove `updatedAt: Date.now()` from the hashed body, or set it to the edition time. Then the same edition gives the same bytes, so `If-None-Match` returns 304 for the whole 30 minutes, not just inside a 120 s edge window. `apps/web/src/lib/feed-queries.ts:585`; same check for `servePublicApi`.
- **B2. ETag on story and week.** Wrap `/api/story/:id` and `/api/week/:week` in the existing `withEtag` (`apps/web/src/lib/etag.ts`).
- **B3. Make the explicit-lang variant the documented client contract.** The day page already uses it. Document "native clients send `?lang=`" in the API notes, and keep `Vary` unchanged.
- **B4. Freshness endpoint.** Today: `{lastFetchedAt, latestRun:{id, startedAt, finishedAt, failed, degraded}}`. Ask for an `editionAt` (time of the latest `tldr_snapshots` upsert, which is what readers see) and an ETag. The app uses `latestRun.id` and `lastFetchedAt` as the change token until then. Note `degraded: true` was set at measurement time; the app must not show an error for it.
- **B5. Thumbnails.** `/api/thumb/:id?u=` answered 302 to the publisher for 2 of 2 samples, so the 144 px resize did not run in production. Investigate the `IMAGES` binding. Ask for fixed variants (`w=240`, `w=1200`) and a `thumb_url` field on feed items so the app does not rebuild the URL. Today rows and the notification attachment rely on a small image.
- **B6. Push later.** Silent push (`content-available`) at each new edition, and an alert push with `mutable-content` plus a Notification Service Extension to attach the image (30 s limit) [A14]. This closes the known gap that a local notification carries what the last refresh saw. Needs a device-token table, a privacy-manifest line, and no account.
- **B7 (optional). Smaller default.** Today only needs about 2 days. A `days=2` default for the app would cut the payload; measured `days=1` is 25 KB and `days=3` 106 KB compressed.

## 4. Screen patterns

Each block is the rule, then do and don't. The lanes own the code. Audit findings are in the audit file.

### Today

Do: masthead with the date as the title (not the app name [H19]); one freshness line; categories as one chip row; system search via `.searchable` and a Search tab role [A25], [H8], [W6]; layout and count in one `Menu` in the toolbar; ranked list with source, category colour and age; read stories dim to secondary; restore scroll position when returning within 30 minutes.
Don't: stack more than three rows of chrome above the first headline; show unlabeled icon segments ("=" and "≡"); put the app name as a nav title; show a count the reader cannot explain; mutate the list while scrolling; show black or centre-cropped thumbnails.

### Story

Do: system navigation bar or a standard back button so edge-swipe back works; content scrolls under the bar with the system scroll edge effect [A24]; headline, source and time, hero at its own aspect ratio, AI;DR summary, one primary action "Read the source" (Safari view), one Share menu (link, copy AI;DR text, image), sources list. Paint from the feed item at once.
Don't: let body text pass under the status bar or a floating button; show "Suggest a story" on every story (it belongs in Settings or the overflow menu); duplicate the headline in a cropped hero.

### Calendar and Weeks

Do: month grid where intensity shows the number of stories and today has a ring; week rows link to the week page; day list below with the first headline; month arrows with a 44 pt hit area; Weeks as a plain list of issue number, date range, intro line.
Don't: draw dashed outlines for 14 empty cells (use no fill); rely on colour alone for the heat scale (also expose the count to VoiceOver); mix a freshness label in (archives are immutable).

### AI;DR brief

Do: a finite edition. Cover shows date, story count and reading time. One story per page, vertical swipe. Ends on "You're all caught up". Presented as a full screen cover with an explicit Close, because it is immersive and modal [ui-taste navigation law 2]. Gradient backgrounds when the image is a text card.
Don't: use an OG text card as a full-bleed background under white text (measured contrast of the counter against the image: 1.4:1); show a video from another day inside today's brief; show a flame streak with loss framing (see §5); hide the tab bar and leave an unlabeled icon as the only way out.

### Settings

Do: a sheet with Done [H12]. Sections: Language; Text (size, appearance, font); Notifications (toggle, time, permission state with "Open Settings" when denied, background refresh hint); Offline and storage (last checked, stored size, Clear cache, Download images on cellular); About.
Don't: show "Send a test now" to everyone (debug build or when authorized only); put marketing copy inside a control card; ask for notification permission before the reader turns the toggle on [H4].

### Share card

Do: render with `ImageRenderer` at the output size, not the preview size; the preview and the export share one layout; hero at natural aspect ratio; three ratios (4:5, 1:1, 9:16) all verified in CI; the footer always shows the wordmark and aidr.today.
Don't: clip the card in the preview at 9:16; crop the hero (the card shows half a line of the image today); truncate the summary mid-word (end on a sentence or ellipsis at a word).

### Notifications

Do: one local request id `daily`, rebuilt after every successful refresh. Content rule: if the edition was validated within 2 h before the fire time, title is the top headline and the attachment is its image. Otherwise generic ("Today's AI;DR is ready", no image), because a saved headline from yesterday must not be delivered as today's. Interruption level Active; never Time Sensitive [H5], [A19]. Tapping opens Today at the top, or the brief if the notification said so. Foreground delivery is silent (the app already shows it) [H6].
Don't: add action buttons that only open the app [H6]; badge; send a second notification when the first was ignored; include private data [H6].

### Widgets (Phase 4)

Do: small and medium show the top 1 and top 3 headlines, with "Updated 07:32". A timeline entry per edition, entries at least 5 min apart, `.after(nextEditionBoundary + 5 min)`. The app calls `reloadAllTimelines` after each refresh. A typical budget is 40 to 70 reloads a day, and reloads while the app is in the foreground are free [A15]. Support tinted mode: `widgetAccentable`, `widgetAccentedRenderingMode` (liquid-glass-design skill). The widget reads the cache; it does not call the API.
Don't: ship a Live Activity. They are for ongoing tasks, not news [H18].

### App Shortcuts

Do: three verbs in a dedicated intents module [H11]. "Open today's AI;DR" (Today), "Read the brief" (opens the brief), "What's new" (answers with the top 3 headlines from the cache, works offline). Short, natural phrases, one per intent plus a variant. Add `AppEntity` only for stories if Spotlight needs it later (ios-app-intents skill).
Don't: mirror the tab bar as intents; add a parameter nobody will say aloud.

## 5. Daily habit loop

A reader returns because there is a short, finite, trustworthy edition at the time they expect it. Nothing else.

- **Time.** Default 07:00 local, set by the reader. The daily notification is opt-in from a quiet card on Today after the reader has opened the app on 3 different days, or from the Settings toggle. Ask at most twice, 14 days apart. No onboarding screens [H4], no permission prompt at first launch.
- **Content.** One headline, one image when fresh (§4 Notifications). Sentence case, complete sentence, no emoji, no urgency words, no "don't miss".
- **Continue reading.** Keep the last opened story id and its scroll fraction. Show one dismissible "Continue: <title>" row on Today when the story was opened in the last 7 days and scrolled past about 5%. Same rule Readwise Reader uses for its "Continue reading" view: started in the past week and not archived [R4].
- **Read state.** A local set of read story ids, pruned at 30 days. Read titles use the secondary text colour. No unread counts and no badges. Reeder drops unread counts entirely and records position instead [R3]. Optional "Mark all as read" in the menu.
- **Finish line.** The brief ends. That is the feature. Techmeme shows the river in reverse-chronological order and stops [R5]; AI;DR stops at 8, 12 or 16 and says so.
- **Streak.** Keep a quiet "Read 3 of the last 7 days" dot row. No flame, no "streak" word, no loss message when a day is missed, no notification about it, no streak freeze. The dark-pattern literature lists nagging and manipulative engagement; do not build near it [R7] (linked, not quoted).
- **Avoid.** Badges, re-engagement after N idle days, "X people are reading", artificial scarcity, a second notification for the same edition, a fake "new" dot, marketing in notifications (needs explicit opt-in and is never Time Sensitive [H5], [R2]).

## 6. Accessibility checklist

Run on every screen before a lane is called done. CI screenshots cover only the visible items; the rest need a device or simulator session.

- [ ] Text uses styles or `.inter(...)` and `.headline(...)` tokens only; scales to accessibility sizes. Capture one screenshot at AX3 per screen [H16], [H15], [A26]. The Settings size choices up to xxxLarge are fine; System must keep the full range.
- [ ] Layout switches at `dynamicTypeSize >= .accessibility1` (stack instead of side by side; drop thumbnails) [A26].
- [ ] Every icon-only control has a label and a hint: Aa, layout, count, back, close, share, month arrows, brief exit.
- [ ] Targets at least 44 x 44 pt, including the Calendar chevrons.
- [ ] Contrast 4.5:1 for text, 3:1 for controls, in light and dark, with Increase Contrast on [H14], [H15]. Measured failures today: brief counter 1.4:1; Settings switch track against its card 1.6:1.
- [ ] Reduce Motion: brief page changes cross-fade, no parallax [H15]. Reduce Transparency: glass falls back to opaque [A23].
- [ ] Colour is never the only signal (category dots also carry text; heat cells expose their count).
- [ ] Reading order: headline, source, time, summary, actions. Row = one VoiceOver element: "01, Anthropic, headline, 2 hours ago, unread".
- [ ] Long text: the story body is a native `Text` with selection on, so line navigation and Speak Screen work [W5].
- [ ] Dark appearance is a real dark render in CI. Add a luminance check to the screenshot step (mean under 80 for files named dark).
- [ ] VI and EN screenshots for every state, including offline.

## 7. Performance checklist

Targets are goals to measure, not measurements. Follow measure, change, measure again (ios-design state-and-performance reference; [W3], [W4]).

- [ ] Signpost launch to first painted content. Target: under 400 ms on an iPhone 15 class device, release build, cold start, cache present. Record device, build, dataset.
- [ ] Decode feed JSON (343 KB, 153 items) off the main actor, once per refresh. Build view-model arrays outside `body`.
- [ ] Stable ids (the story id) in every `ForEach`. `LazyVStack` for lists. No `GeometryReader` in rows.
- [ ] Images always downsampled to the tier size (§2.5). No `AsyncImage` in lists (no control over cache or downsampling; judgment).
- [ ] Memory: instrument a 30 screen navigation loop; no growth after eviction.
- [ ] Network: a foreground refresh with nothing new costs one 164 byte probe. Check in Charles or the Network instrument.
- [ ] Battery: a background refresh finishes under 20 s and 200 KB without images.
- [ ] Glass: one `GlassEffectContainer` per group; no glass in rows [A23].
- [ ] Animations only for state change; none on scroll, tab switch or push.

## Sources

HIG (fetched 2026-11-28 from the DocC JSON behind these pages)
- [H1] Tab bars https://developer.apple.com/design/human-interface-guidelines/tab-bars
- [H2] Loading https://developer.apple.com/design/human-interface-guidelines/loading
- [H3] Launching https://developer.apple.com/design/human-interface-guidelines/launching
- [H4] Onboarding https://developer.apple.com/design/human-interface-guidelines/onboarding
- [H5] Managing notifications https://developer.apple.com/design/human-interface-guidelines/managing-notifications
- [H6] Notifications https://developer.apple.com/design/human-interface-guidelines/notifications
- [H7] Lists and tables https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- [H8] Searching https://developer.apple.com/design/human-interface-guidelines/searching
- [H9] Progress indicators https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- [H10] Feedback https://developer.apple.com/design/human-interface-guidelines/feedback
- [H11] App Shortcuts https://developer.apple.com/design/human-interface-guidelines/app-shortcuts
- [H12] Sheets https://developer.apple.com/design/human-interface-guidelines/sheets
- [H13] Materials https://developer.apple.com/design/human-interface-guidelines/materials
- [H14] Dark Mode https://developer.apple.com/design/human-interface-guidelines/dark-mode
- [H15] Accessibility https://developer.apple.com/design/human-interface-guidelines/accessibility
- [H16] Typography https://developer.apple.com/design/human-interface-guidelines/typography
- [H17] Widgets https://developer.apple.com/design/human-interface-guidelines/widgets
- [H18] Live Activities https://developer.apple.com/design/human-interface-guidelines/live-activities
- [H19] Toolbars https://developer.apple.com/design/human-interface-guidelines/toolbars

Apple developer documentation
- [A1] Choosing background strategies https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app
- [A2] Using background tasks to update your app https://developer.apple.com/documentation/uikit/using-background-tasks-to-update-your-app
- [A3] earliestBeginDate https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate
- [A4] BGAppRefreshTask https://developer.apple.com/documentation/backgroundtasks/bgapprefreshtask
- [A5] Starting and terminating tasks during development https://developer.apple.com/documentation/backgroundtasks/starting-and-terminating-tasks-during-development
- [A6] backgroundTask(_:action:) https://developer.apple.com/documentation/swiftui/scene/backgroundtask(_:action:)
- [A7] backgroundRefreshStatus https://developer.apple.com/documentation/uikit/uiapplication/backgroundrefreshstatus
- [A8] URLCache https://developer.apple.com/documentation/foundation/urlcache
- [A9] waitsForConnectivity https://developer.apple.com/documentation/foundation/urlsessionconfiguration/waitsforconnectivity
- [A10] allowsExpensiveNetworkAccess https://developer.apple.com/documentation/foundation/urlrequest/allowsexpensivenetworkaccess
- [A11] allowsConstrainedNetworkAccess https://developer.apple.com/documentation/foundation/urlrequest/allowsconstrainednetworkaccess
- [A12] NWPathMonitor https://developer.apple.com/documentation/network/nwpathmonitor
- [A13] UNNotificationAttachment https://developer.apple.com/documentation/usernotifications/unnotificationattachment
- [A14] Modifying content in newly delivered notifications https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications
- [A15] Keeping a widget up to date https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date
- [A16] refreshable(action:) https://developer.apple.com/documentation/swiftui/view/refreshable(action:)
- [A17] SwiftData https://developer.apple.com/documentation/swiftdata
- [A19] UNNotificationInterruptionLevel https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel
- [A20] kCGImageSourceThumbnailMaxPixelSize https://developer.apple.com/documentation/imageio/kcgimagesourcethumbnailmaxpixelsize
- [A21] completeUntilFirstUserAuthentication https://developer.apple.com/documentation/foundation/fileprotectiontype/completeuntilfirstuserauthentication
- [A22] isExcludedFromBackupKey https://developer.apple.com/documentation/foundation/urlresourcekey/isexcludedfrombackupkey
- [A23] Adopting Liquid Glass https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- [A24] scrollEdgeEffectStyle(_:for:) https://developer.apple.com/documentation/swiftui/view/scrolledgeeffectstyle(_:for:)
- [A25] TabRole https://developer.apple.com/documentation/swiftui/tabrole
- [A26] DynamicTypeSize https://developer.apple.com/documentation/swiftui/dynamictypesize
- [A27] RelativeDateTimeFormatter https://developer.apple.com/documentation/foundation/relativedatetimeformatter and TimelineView https://developer.apple.com/documentation/swiftui/timelineview
- [A28] ContentUnavailableView https://developer.apple.com/documentation/swiftui/contentunavailableview

WWDC (transcripts read for [W1], [W2], [W5]; the rest are titles verified on the session pages, not summarized)
- [W1] WWDC25 227 Finish tasks in the background https://developer.apple.com/videos/play/wwdc2025/227/ ("The system aligns these tasks with app usage history. Frequently used apps have an increased chance of being scheduled.")
- [W2] WWDC22 10142 Efficiency awaits: Background tasks in SwiftUI https://developer.apple.com/videos/play/wwdc2022/10142/
- [W3] WWDC25 306 Optimize SwiftUI performance with Instruments https://developer.apple.com/videos/play/wwdc2025/306/
- [W4] WWDC23 10160 Demystify SwiftUI performance https://developer.apple.com/videos/play/wwdc2023/10160/
- [W5] WWDC26 219 Enhance the accessibility of your reading app https://developer.apple.com/videos/play/wwdc2026/219/
- [W6] WWDC26 292 Design intuitive search experiences https://developer.apple.com/videos/play/wwdc2026/292/
- [W7] WWDC26 277 WidgetKit foundations https://developer.apple.com/videos/play/wwdc2026/277/
- [W8] WWDC25 219 Meet Liquid Glass https://developer.apple.com/videos/play/wwdc2025/219/ and 356 Get to know the new design system https://developer.apple.com/videos/play/wwdc2025/356/ and 323 Build a SwiftUI app with the new design https://developer.apple.com/videos/play/wwdc2025/323/
- [W9] WWDC22 10078 Reduce networking delays for a more responsive app https://developer.apple.com/videos/play/wwdc2022/10078/
- [W10] WWDC23 10187 Meet SwiftData https://developer.apple.com/videos/play/wwdc2023/10187/ and WWDC26 275 Code-along: Add persistence with SwiftData https://developer.apple.com/videos/play/wwdc2026/275/
- [W11] App Intents and Shortcuts: WWDC22 10169 Design App Shortcuts https://developer.apple.com/videos/play/wwdc2022/10169/, WWDC25 244 Get to know App Intents https://developer.apple.com/videos/play/wwdc2025/244/, WWDC26 310 What's new in Shortcuts https://developer.apple.com/videos/play/wwdc2026/310/

Other
- [R1] RFC 5861, stale-while-revalidate and stale-if-error https://httpwg.org/specs/rfc5861.html
- [R2] App Review Guidelines 4.5.4 Push Notifications https://developer.apple.com/app-store/review/guidelines/#push-notifications
- [R3] MacStories on Reeder: "no concept of an article that's been read or unread", position kept, new items "fill in above" https://www.macstories.net/reviews/reeder-a-new-approach-to-following-feeds/
- [R4] Readwise Reader default views, "Continue reading", "New in Feed" https://docs.readwise.io/reader/guides/filtering/default-views
- [R5] Techmeme About, River view in reverse chronological order https://www.techmeme.com/about
- [R6] NYT offline behaviour, third-party review (low authority) https://uxcam.com/blog/new-york-times-offline-strategy/
- [R7] FTC, Bringing Dark Patterns to Light (2022), linked not quoted https://www.ftc.gov/system/files/ftc_gov/pdf/P214800+Dark+Patterns+Report+9.14.2022+-+FINAL.pdf
- Apple News offline mode for News+ appears in the iPhone User Guide table of contents only, so no behaviour is claimed: https://support.apple.com/guide/iphone/get-started-with-news-iph0a16d1e29/ios
- Repo skills read: ios-design (with references), liquid-glass-design, ui-taste, swiftui-ui-patterns, swiftui-liquid-glass, swiftui-performance-audit, foundation-models, ios-app-intents.
