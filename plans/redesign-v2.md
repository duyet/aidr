# Redesign v2

Approved by the owner on 2026-11-16. Reference prototype: `plans/redesign-v2/reference.html` (open it in a browser; also at https://anyrouter.dev/a/LcBwCXK3Mi98Fewf, private). It has a tab per page and the layout, language, mode, accent and customize controls are live. The prototype is throwaway. This file is the spec.

Rebuild the web app's UI to this design, using ui-sdk (`@ui-sdk/react`, already installed in `apps/web`; follow `.agents/skills/ui-sdk` and read `node_modules/@ui-sdk/react/docs/llms.txt` plus only the component pages you use). Do not change ingest, ranking, prompts, admin, MCP or notify code. Keep every existing feature and URL. Keep tests green; update tests only where behavior or markup the test pins changed on purpose.

## Hard rules

- EN and VI columns never fall back to each other (AGENTS.md). Bilingual mode shows both languages from their own columns. If one language is missing, show only the other. Never fill one from the other.
- Do not deploy, write to remote D1, or sync secrets. No commits unless the owner asks.
- Build secret-shaped test fixtures from string parts (see apps/web/src/lib/no-secret-literals.test.ts).
- Tokens live in packages/ui/tokens.css, a byte copy in apps/extension/css/tokens.css (`pnpm --filter @aidr/ui sync-tokens`), and matching blocks in apps/web/src/styles.css. packages/ui/tokens.test.mjs fails on drift. contrast tests (apps/web/src/lib/contrast-tokens.test.ts, category-contrast.test.ts) must pass.
- New analytics events and prefs go through apps/web/src/lib/analytics/events.ts (strict registry; regenerate docs with `pnpm --filter @aidr/web analytics:docs`).
- Never run a production build inside parallel agents. Run narrow vitest files and `pnpm exec biome lint <path>`. The coordinator runs check-types and the full suite once after each wave.
- Own only your files (see waves). If you need a change in a file you do not own, say so in your report instead of editing it.

## Visual system

- **Type.** Inter 400 to 700 is the default for headlines and body. The reader serif stays an option in Customize (headlines and body separately). Scale, about 8% and then 7% smaller than today: page and story headline 34.5px/1.15 (26/24 phone), compact lead headline 21, summary 16.5/1.65, row title 13.5/1.4 (13 compact), body 13 to 14, meta and labels 12.5, section label 12.5 caps +0.07em. Keep tabular numbers.
- **Color.** Warm neutrals. Light: canvas #FAF9F5, panel #FFFFFF, sunk #F0EEE6, foreground #1F1E1D, body #3D3D3A, muted #6B6A64, hairline rgba(31,30,29,.10), input rgba(31,30,29,.20), primary #1F1E1D on #FFFFFF. Dark: canvas #1F1E1D, panel #262624, sunk #30302E, foreground #F5F4EE, body #D6D4CC, muted #A19F96, primary #F5F4EE on #1F1E1D. Yellow #F5C518 stays the brand mark and the dark-mode accent; light-mode accent text stays #8F4300. Gray and black reader backgrounds stay options. Keep every contrast test green; adjust a value only as far as a test requires and note it.
- **Accent option.** yellow (default), blue, green, rose, violet. Changes the mark, links and focus ring only.
- **Topic color.** Use the app's existing category colors (CategoryLabel, category-contrast.test.ts). They tint the dot on each row, chip and tag, and color key names as plain text (no underline, no background). Text uses the darker ink shade in light mode so it keeps 4.5:1. Setting: highlight by topic (default), one color, or off.
- **Buttons.** Three styles. Primary is one filled action per area. Secondary is a soft fill (--muted) with no border. Link is accent-colored text with an icon. 32px high, 13px text, fully rounded, same focus ring. Most secondary actions (copy, share, show more, read source, follow) are links. Chips, segmented switches, the search box and inputs use the soft fill. Icons come from lucide-react at 15px, 2px stroke, always beside a label except the layout switch and the header Aa.
- **Lines.** No divider lines between rows, sections, header or footer. Spacing and a hover tint separate things. Exceptions: the AI;DR card keeps its production look including its hairlines, form controls keep outlines only where needed for 3:1, and focus rings.
- **Home spacing is relaxed.** Section gaps about 32px, rows 15px vertical, rail gap 36px (tighter on phone).

## Layouts (new pref `layout`)

`compact` is the default, `comfortable` is the roomier list, `newspaper` is the print look (serif masthead "AI;DR" with the date strip, serif headlines, justified text with a drop cap on the story summary, 2 or 3 columns for the ranked list, square corners, no rules). A three-icon switch (compact, comfortable, newspaper) sits in the menu bar on every page at 700px and wider. Below 700px it lives in Customize. The choice persists.

## Home

1. Menu bar: logo, nav (Hôm nay/Today, Tuần/Weeks, Lịch/Calendar, each with an icon), search, Aa, layout switch, VI/EN, and one primary button with the logo mark and the text "AI;DR" (no "Nhận", no "Get"). Phone: logo, Aa, AI;DR button, search, plus a bottom tab bar (Today, Weeks, Calendar, AI;DR with the logo mark).
2. Day header with prev/next, then one row of topic chips (dot + localized name + count, soft fill, selected chip is foreground/background inverted). Selecting a chip filters the AI;DR card and the feed.
3. **AI;DR card: keep today's production design, full width of the content area.** Big day number, "AI;DR" label with the date line, the image/text toggle, the 8/12/16 pills, a numbered list of stories with topic tag and thumbnail, "Show more", and the stories/updated footer. New: a columns pref (1, 2 or 3, default 2; 1 below 760px). Clicking an item opens the existing StoryDialog.
4. Under the card: left column has the lead story (topic, headline, two lines, primary "Đọc tiếp", link "Đọc bài gốc", source) then "Tin xếp hạng hôm nay" rows (number, two-line title, topic dot, source, time, 52px thumb; source link on hover; hide the vote column while every count is zero). Right rail: Đang nổi (trending), the daily email field plus a Telegram link (@aihomnay for VI, @aidr_today for EN), This week.
5. **Customize: hide the ranked list** (existing `sections.days`) and **show more days**: initial days 1, 3 or 7, and an infinite-scroll mode that loads older days when the end of the feed scrolls into view (keep the "Ngày cũ hơn" button as the fallback and for keyboard users). Show a loading row while fetching.
6. Footer: icons and localized links (Giới thiệu/About, Phát hành/Release, Dữ liệu/Data, Quyền riêng tư/Privacy).

## Story page and dialog

Grid, three rows by two columns. Row 1, left: topic dot and label, date and source count, headline, "Từ <source>" line. Row 2, left: "AI;DR" label, summary, key points. Row 2, right (300px): the image with its credit, level with the summary. Row 3, left: actions (primary "Đọc bài gốc", links "Chép bản tóm tắt" and "Chia sẻ"), source chips, a single muted line "Xếp cao vì N nguồn cùng đưa tin" / "Ranked high because N outlets covered it" (replaces the collapsible score and token detail), then the end card with the email field and the Telegram link. Row 3, right: "Đọc tiếp" list, sticky (top 72px) so it holds while the left column scrolls. Below 900px: title, image, summary, actions, end card, read next in one column. The top block (headline to image) must be clean to screenshot: no sticky bar over it. Newspaper layout adds the drop cap and justified text.

## Language

Switch is VI, EN, and VI+EN. Bilingual shows the leading language at full size and the other under it, smaller and muted, for headlines, titles, summaries, bullets, chips, buttons and labels. A pref chooses which language leads. Wording: "Nhận AI;DR" becomes "AI;DR"; email buttons say "Đăng ký" (EN "Subscribe"/"Join"); the heading is "Bản tin mỗi sáng"; "MCP server" stays English in VI; category names are Vietnamese in VI mode (Chính sách, Sản phẩm, Model, Ngành, Nghiên cứu, Chip, Gọi vốn, Tác nhân, Dữ liệu; reuse the extension's existing translations where they exist). Footer and menu labels are translated as listed above.

## Customize panel (replaces PrefsPanel and ThemeTab visuals)

Sections: quick looks (Compact, Newspaper, Night desk, Bilingual), layout, language and which language leads, mode (auto, light, dark), background (paper, gray, black), accent, topic highlight, headline font, body font, text size, newspaper columns (2, 3), show toggles (AI;DR, AI;DR items 8/12/16, AI;DR columns 1/2/3, AI;DR as image or text, trending, thumbnails, summaries under titles, topic chips, ranked list, days shown 1/3/7/infinite), reset. It saves to the existing `news_prefs` storage with the new keys added and validated in loadPrefs. A drawer on desktop, a bottom sheet on phone. Built from ui-sdk preferences, segmented-control, switch and dialog/drawer.

## Other pages

Weeks, Calendar, Subscribe (email first, Telegram promoted, then Facebook, Chrome, MCP/RSS as cards with a link and an icon), Data (localized labels, same language switch), MCP (install buttons first, 3D figure below), Release (list with the algorithm log on its own tab, entries collapsed), About (six-step row, long data paragraph folded), Privacy, Terms, sign-in/up, submit/contribute, mail, extension, brand. Restyle with the same tokens, buttons, icons and no-lines rule. Follow the matching tab in the reference.

## Waves

- **Wave 0 (foundation, one agent).** tokens (+ extension copy, styles.css, DESIGN.md, contrast tests), `lib/prefs.ts` new prefs and validation, analytics registry for the new prefs, `__root.tsx` data attributes, global CSS for layouts, accents, highlight modes, buttons and icons helpers, localized category names helper.
- **Wave 1 (parallel, disjoint files).** A header and menus (HeaderBar, header/*, LangToggle, GetAIDRMenu, PhoneMenu, NewsFooter). B home feed (StoryRow, DaySection, FeedDays, CategoryNav, TrendingChips, StoryThumb, KeywordText, CategoryLabel, FeedSkeleton, HomeSections, routes/index.tsx home composition). C AI;DR card (TldrSection, TldrBulletList, TldrBulletRow, TldrSection tests). D Customize panel (PrefsPanel, prefs/*). E story (StoryPage, story-page/*, StoryDialog, story-dialog/*, StoryDetail, story/*, ReadNext).
- **Wave 2 (parallel).** F weeks, calendar, week routes and WeeklyPaper, calendar/*. G subscribe, mail, EmailSubscribeForm, mcp/*, extension, brand. H data and system pages, release and ReleaseArticle, about, privacy, terms, auth pages, submit/contribute/suggest, search/*, SearchBox.
- **Wave 3.** Coordinator: check-types, full vitest, biome, `.agents/skills/verify-aidr` on a local dev server, screenshots against the reference, fix list.

## Wave 0 results (done) and decisions

Wave 0 landed the tokens, prefs, analytics registry, root attributes and global CSS. Read the end of apps/web/src/styles.css, apps/web/DESIGN.md, apps/web/src/lib/prefs.ts, apps/web/src/lib/topic.ts and apps/web/src/components/Bi.tsx before you start.

- **Attributes on .app-shell** (readerDataAttrs): data-reader-bg, data-layout (compact | comfortable | newspaper), data-accent, data-highlight, data-head-font, data-tldr-cols, data-news-cols, data-thumbs, data-summaries, data-bilingual.
- **CSS custom properties:** --row-pad, --list-title-size, --thumb-size, --lead-title-size, --chip-h, --headline-size, --summary-size, --home-section-gap, --home-col-gap, --home-rail-gap, --home-row-pad, --home-thumb-size, --rail-width, --tldr-cols, --news-cols.
- **Classes:** .btn-primary, .btn-soft, .btn-link, .chip (+ .chip-count, aria-pressed for selected), .topic-ink, .topic-dot, .row-thumb, .row-summary, .tldr-grid, .np-only, .np-hide, .np-masthead (+ -title, -date), .np-columns, .np-justify, .drop-cap, .bi-second.
- **Helpers:** topicLabel(category, lang) and topicStyle(category) in lib/topic.ts; Bi in components/Bi.tsx.
- **Prefs:** layout, accent, highlight, headFont, bilingual (boolean), bilingualFirst, tldrCols, tldrView, newsCols, thumbs, summaries, feedDays (1 | 3 | 7), infiniteDays, plus the existing font, fontSize, density, bg, sections, tldrCount, bilingualDialog.
- **Bilingual mode.** `prefs.bilingual` shows the other language under the leading one (`prefs.bilingualFirst`). Use `<Bi vi={...} en={...} />` (add `inline` for short labels) for UI text. For story data, render each language from its own column, leading one full size and the other with the `bi-second` class. A missing language renders nothing. The language switch is VI | EN | VI+EN: VI and EN set `bilingual` false and call onLangChange; VI+EN sets `bilingual` true and the language to `bilingualFirst`.

Decisions made while reading Wave 0's report:
1. Category names stay English in the UI for now (keep categoryLabel and the existing lang.test.ts regression that protects search and filter matching). The prototype showed Vietnamese names. The owner decides later; use topicLabel only if a task here says so.
2. tldrView defaults to "image" (stored in prefs, replacing TldrSection's local state).
3. feedDays defaults to 3 (today's home behavior).
4. Keep the old density pref and bilingualDialog for now. Do not delete them in this wave. Customize does not show density.
5. Breakpoint for the phone layout is 700px for new work. The header may keep its current switch point until wave A decides.
6. Dialogs and popovers render outside .app-shell. Anything inside them that needs layout, accent or highlight must read the prefs from context and set data attributes on its own root.
