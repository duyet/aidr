# First-submit checklist: from enrollment to "Ready for Distribution"

Goal: the first App Store review of AI;DR for iPhone (`oneni.aidr.app`) passes. Every item names the guideline or source it comes from. Source numbers are in `sources.md`. Mark an item done only after you checked the real artifact.

Run before every upload:

```bash
python3 apps/ios/AppStore/check-metadata.py --strict        # limits, banned words, plist, notes size; fails on placeholders
python3 apps/ios/AppStore/check-metadata.py --strict --online   # also GETs the three URLs
python3 apps/ios/AppStore/check-screenshots.py screenshots    # sizes, alpha, EN and VI parity
```

## 1. The ten rejection risks, ranked

Likelihood is my judgement from the forum record in sources.md. "Where" says which file or item holds the mitigation.

| # | Risk | Guideline | Likelihood | Mitigation | Where |
|---|---|---|---|---|---|
| 1 | The app reads as a news aggregator or collection of links. The guideline names "content aggregators" and "a collection of links". Forum reviewers dismissed bookmarks, share, offline and push on their own. | 4.2, 4.2.2 | High | Lead the notes with features a website cannot do: offline edition, local notification with picture, on-device share card, on-device AI. Exact taps for each. Two screen recordings. A ready reply for the first rejection. Screenshots 04 and 05 show the native work. | review-notes.md, screenshots.md, item 5.3 |
| 2 | Headlines, summaries and publisher pictures shown without proof of rights. | 5.2.1, 5.2.2 | Medium | Rights statement in the notes: headline, short model summary, thumbnail, link to the source, public source list, takedown contact. Reply template if Apple asks. No publisher photos in screenshots. | review-notes.md, screenshots.md "Fixture rule" |
| 3 | The reviewer cannot see what the notes describe: Apple Intelligence off or unsupported so Explain is hidden, a 07:00 notification nobody waits for, an empty first launch offline, a server problem, a note that names a button the build lacks. | 2.1(a), 2.5.19 | High | Notes state the device and settings needed for Explain. A recording shows it. "Send test now" button for the notification. Empty and offline first-launch states with text. Notes-to-build walk before each submit. | review-notes.md, items 3.5, 5.1, 5.2 |
| 4 | The privacy policy does not cover the app, has no deletion or consent-revocation text, and mentions analytics tools that the app does not use. The App Privacy label can then contradict it. | 5.1.1(i), 2.3 | High | Publish the iOS section (EN and VI) and the scope fix. Declare Other Usage Data, not linked, Analytics. Conditions C1 to C6 keep the label true. Policy link inside the app. | privacy.md, items 2.1, 3.4 |
| 5 | The Support URL has no contact. `https://aidr.today/support` returns 404. `/about` has no email or form. | 1.5, source 4 | High | Create `/support` with a contact email and a short FAQ before submit. | item 2.2 |
| 6 | Metadata: third-party brand names in keywords, a feature promised on a device that does not show it, third-party images in screenshots, VI and EN that differ in claims. | 2.3.1, 2.3.3, 2.3.7, 5.2.1 | Medium | `check-metadata.py` bans brand names and marketing words and counts limits. Description says Apple Intelligence needs a supported iPhone. Fixture screenshots. | metadata.*.md, screenshots.md |
| 7 | An age rating that does not match the content (a feed with headlines about abuse, violence, lawsuits) or an unanswered new questionnaire. | 2.3.6 | Medium | Answers with reasons and the expected 13+. Unrestricted Web Access decision written down. Answer every question the form shows. | review-notes.md "Age rating answers" |
| 8 | Notification permission asked on first launch, or the app needs it. Marketing wording in a reminder. | 4.5.4, 5.1.1(iv), 5.1.2(i) | Medium | Ask only when the reader turns the reminder on. The app works without it. The text of the notification is the headline, nothing promotional. | items 3.6, 5.2 |
| 9 | Foundation Models misuse or a blank result: a guardrail refusal shown as an empty screen, prompts that stray into the acceptable-use list (medical, legal, finance advice; defamation; false claims about Apple). | 2.5.1, source 22 | Low to medium | Fixed prompts for one story, no free text. Plain message on refusal. Facts only about the story. | items 3.7 |
| 10 | Upload or binary problems: missing privacy-manifest reasons, wrong SDK, crash on the reviewer's device, an iPad layout nobody tested, test launch flags left on. | 2.1(a), 2.4.1, source 6 | Medium | Manifest in privacy.md. Xcode 26. iPhone only. TestFlight on a real device first. No `-AIDR_FIXTURE` path in a release build. | items 3.1 to 3.3, 4.1 |

Also watched: 4.3(b) spam wording was tightened in June 2026 (source 2b). It names dating, flashlight, simple timers and similar categories, not news. Low risk, but "AI news app" is a crowded idea, so the notes and subtitle say what is different. 5.1.2(i) (third-party AI disclosure) does not apply: Foundation Models runs on the device and nothing is sent.

## 2. Cross-lane items (things outside apps/ios/AppStore that must happen)

I did not touch these. Each is a blocker or a bug to hand to its owner.

| # | Item | Owner | Blocks submit? |
|---|---|---|---|
| X1 | Create `https://aidr.today/support`: contact email, how to report a wrong summary, how to ask for a source or picture to be removed, link to the privacy policy. (1.5, source 4) | web | **Yes** |
| X2 | Publish the iOS section and Vietnamese policy from privacy.md. Fix gaps G1 to G9 in the policy page. | web | **Yes** |
| X3 | **Suggest a story does nothing for most app users.** `docs/decisions/email-contributions.md` says mail is accepted only from an address tied to an AI;DR account. The privacy policy says mail from an address with no account keeps no content. The v1 app has no accounts. A reader's suggestion is dropped. Choose one: (a) let the email worker accept mail from any sender into a held queue, update policy G6, or (b) remove the feature from v1. Until then it is not in the description or screenshots, and the notes describe only the mail handoff. | email + app | No, but it is a bug a user would hit |
| X4 | App features the notes and privacy answers rely on: Settings > Language, Settings > Privacy Policy, Settings > About with the "summaries can contain errors" line, Daily reminder > Send test now, list thumbnails through `/api/thumb` and the picture-source split in condition C3 matching the policy sentence, no `POST /api/read` (C1), `-AIDR_FIXTURE appstore` loader for screenshots (never in release), plain message on a Foundation Models refusal, an explained empty state on first offline launch. | app lanes | **Yes** (notes name them) |
| X5 | Label parity: tab and button names in the app equal the names in metadata.*.md, screenshots.md and the policy (Hôm nay, Tóm tắt nhanh, Giải thích đơn giản, Vì sao đáng chú ý, Đọc nguồn, Share as image). | app lanes | Yes |
| X6 | `apps/ios/project.yml` (on `feat/ios-app`, commit d703aa1a) already has `PRODUCT_BUNDLE_IDENTIFIER: oneni.aidr.app`, `BGTaskSchedulerPermittedIdentifiers: [oneni.aidr.app.refresh]`, `TARGETED_DEVICE_FAMILY: "1"`, `ITSAppUsesNonExemptEncryption: false`. Keep them. Add `ASSETCATALOG_COMPILER_APPICON_NAME` and a real icon (it is empty now). | app lane | Yes (icon) |
| X7 | Bundle id: the operator chose `oneni.aidr.app`. Every file in this pack uses it, and `check-metadata.py` fails if the old id appears. Check `plans/ios-app.md` and `apps/ios/CHANGELOG.md` for the old id. | plan owner | No |
| X8 | Vietnam: the privacy and age tables have a Vietnam section, and Apple publishes a game-licence rule for Vietnam (source 25). I found no rule for news apps and no source that settles whether a news aggregator needs a Vietnamese licence. Confirm with someone who knows Vietnamese rules for news sites before you sell in the Vietnam storefront. If unsure, release without Vietnam first and add it later. This is not an Apple guideline and I cannot verify it. | operator | Unknown |

## 3. Binary and repo (before the first upload)

- [ ] 3.1 Built with Xcode 26 and the iOS 26 SDK (required since 28 Apr 2026, source 6). Deployment target iOS 26.0. Version and build set in `project.yml`.
- [ ] 3.2 iPhone only, portrait only (`TARGETED_DEVICE_FAMILY: "1"`). If iPad is added: 13 inch screenshots become required and the layout must be tested on iPad (2.4.1, source 17).
- [ ] 3.3 `PrivacyInfo.xcprivacy` from privacy.md is in the app target. Run the three `rg` checks in privacy.md. Product > Archive > Generate Privacy Report lists the same APIs. (source 6, 11)
- [ ] 3.4 Privacy Policy row in Settings opens `https://aidr.today/privacy` (5.1.1(i), source 1).
- [ ] 3.5 Every tap path in review-notes.md exists in this build: Settings > Language, Daily reminder > Send test now, Share > Share as image, Explain simply, Why it matters, Calendar, Weeks, Privacy Policy, About. Walk them on a real iPhone, not only the simulator. (source 27: a note that named a missing button caused a rejection)
- [ ] 3.6 Notification permission is requested when the reader switches the reminder on. Launch shows no system prompt. With permission denied, the rest of the app works (4.5.4, 5.1.1(iv), 5.1.2(i), source 1).
- [ ] 3.7 Foundation Models: fixed prompts that take one story and the reader's language, no free text. Gate on `SystemLanguageModel.default.availability`. On a guardrail refusal or unavailable model show a plain line, never a blank view. Facts only; do not rewrite claims about Apple or named people into stronger ones (source 22, items 5, 9, 12, 14, 20).
- [ ] 3.8 App icon 1024 x 1024 with no alpha. Asset catalog name set. No placeholder art (2.1(a)).
- [ ] 3.9 Read source opens SFSafariViewController, visible and unobscured (5.1.1(vii)). No `WKWebView` for browsing, no URL field (supports the Unrestricted Web Access "No" in review-notes.md).
- [ ] 3.10 Release build ignores `-AIDR_FIXTURE`. No debug menu, no test hooks except Send test now (2.5.19: no hidden or undocumented features).
- [ ] 3.11 No private API, no third-party SDK. `packages:` in `project.yml` lists only `AIDRKit` (2.5.1, privacy condition C2).
- [ ] 3.12 First launch with no network and no cache shows text and a Retry action, in both languages. First launch with network shows content within a few seconds. A reviewer on a quiet or slow connection must still see a full screen (2.1(a); source 27, HackerNoon: a reviewer saw no content).
- [ ] 3.13 `aidr.today` is up and the edition is not empty on submit day: `.agents/skills/verify-aidr/bin/verify-aidr doctor`.

## 4. Enrollment and account (operator only)

- [ ] 4.1 Apple Account with two-factor authentication on. Enroll as an **individual**: age of majority, personal legal name, 99 USD per year, your own card charged in USD. The legal name is shown as the seller. An alias, nickname or "AI;DR" is not accepted for an individual (source 19). To show "AI;DR" as the seller you need an organization enrollment, which needs a legal entity (the page I read did not list a D-U-N-S rule; check Apple's organization page).
- [ ] 4.2 Wait for the confirmation email. Apple says to contact Developer Support if there is none within 24 hours (source 19).
- [ ] 4.3 Declare **Digital Services Act trader status** in App Store Connect > Business > Agreements > Compliance. You must answer even if you do not sell in the EU. A free app with no income and no business purpose is usually "not a trader". Apple will not decide for you. If you declare trader, your address, phone and email are shown publicly on EU product pages (source 20). Keep real values out of git.
- [ ] 4.4 Free app: no banking or tax forms are needed for a free app with no in-app purchase (general knowledge, not on a page I read). Accept the Free Apps agreement if the site asks.
- [ ] 4.5 Add the secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` to GitHub Actions so the TestFlight job can run (plan Phase 3). Do not paste them into chat or git.

## 5. App Store Connect record

- [ ] 5.1 Register the explicit App ID `oneni.aidr.app` in Certificates, Identifiers & Profiles. It is permanent once the app record exists. Add the Notifications capability only if you add push later; v1 uses local notifications.
- [ ] 5.2 New app: platform iOS, name from `metadata.en.md`, primary language English (U.S.), bundle id `oneni.aidr.app`, SKU `aidr-ios`. If the name is taken, change the English name first and rerun the check script. Add the Vietnamese localization.
- [ ] 5.3 Paste both metadata files. Name, subtitle, promotional text, description, keywords, support URL, marketing URL. Copyright field: year and the account holder's legal name. "What's New" is not shown for the first version; it is ready for 1.0.1 (source 4).
- [ ] 5.4 Category: primary News, no secondary. A category that does not fit can cause rejection (2.3.5, source 5).
- [ ] 5.5 Price: free, no in-app purchase. 2.1(b) then has nothing to check.
- [ ] 5.6 App Privacy: the answers in privacy.md. Privacy Policy URL set. Publish.
- [ ] 5.7 Age rating: the answers in review-notes.md. Check the computed rating per region. Answer every question the form shows, including any added after 16 Nov 2026 (date from a search summary, not confirmed on Apple's pages; sources 7, 8, 10).
- [ ] 5.8 Export compliance: `ITSAppUsesNonExemptEncryption = NO` is in the binary. If the form still asks, use the answers in review-notes.md (source 15).
- [ ] 5.9 Accessibility Nutrition Labels: optional for now, "required over time" (source 21). Claim only a label you tested end to end: VoiceOver, Larger Text, Dark Interface, Reduced Motion are likely. Skip the rest in v1.
- [ ] 5.10 Screenshots: upload both size sets in both languages after `check-screenshots.py` passes (source 17). Upload order is shot order.
- [ ] 5.11 App Review Information: contact name, phone with country code, email; sign-in required **off**; paste the Notes block; attach the two recordings (source 4). Release: manual.

## 6. TestFlight

- [ ] 6.1 CI uploads build 1 (plan Phase 3) or Xcode > Distribute App > App Store Connect. Wait for processing. Bump the build number for every upload (source 27: Apple will not re-review the same build id).
- [ ] 6.2 **Internal group** (up to 100 App Store Connect users, no beta review, source 18). Install on a real iPhone and run item 3.5, 3.12 and the review recordings. Test at least: iPhone with Apple Intelligence, an older iPhone without it, Vietnamese and English device language, Airplane Mode, notifications denied.
- [ ] 6.3 **External group** (up to 10,000 testers, needs an internal group first). In Test Information give a feedback email and contact; What to Test: the five features of the notes. The first build of a version gets a full Beta App Review, so Apple reads the binary before the real review (sources 18, 18b). Use it as a rehearsal: a reject here costs a day, not a store review. At most one build per version in review at once.
- [ ] 6.4 Optional public link, filtered to iOS 26 and later, limit 100. Testers you do not know are anonymous in the list (source 18b).
- [ ] 6.5 Fix anything testers or Beta App Review raise. Upload a new build number.

## 7. Submit

- [ ] 7.1 Last run of the three scripts with `--strict`. No operator placeholder is left anywhere in the pack (the strict run fails on one).
- [ ] 7.2 Select the TestFlight-tested build for version 1.0. Confirm the build is the one the recordings were made on.
- [ ] 7.3 Read the review notes once more against the build (item 3.5). Then Add for Review > Submit for Review. Expect two to four business days for a first review, and up to two weeks if something is flagged (a vendor guide, source 27; not Apple's number).
- [ ] 7.4 Watch the status (source 29): Waiting for Review, In Review, then **Pending Developer Release** (approved, release is manual). Press Release this Version. After a short delay it shows **Ready for Distribution** and the store page appears.
- [ ] 7.5 After release: open the listing in both storefront languages and check name, subtitle, screenshots, privacy label and age rating on the live page. Install from the store on a clean iPhone. Run `.agents/skills/verify-aidr/bin/verify-aidr doctor`. Then the aidr-release flow (release page and film) from CLAUDE.md.

## 8. If it is rejected

- [ ] 8.1 Read the exact guideline number and text in Resolution Center. Metadata Rejected only needs a metadata edit and a reply; no new build (source 29).
- [ ] 8.2 4.2 or 4.2.2: send the reply from review-notes.md once, with the recordings. A second rejection with the same text: one appeal to the App Review Board, with the same facts (sources 26).
- [ ] 8.3 5.2.x: send the rights reply. Never claim permissions you do not hold. Offer to remove the named source (sources 26).
- [ ] 8.4 2.1 crash or missing content: reproduce on TestFlight, fix, bump the build number, resubmit with a note of what changed.
- [ ] 8.5 Keep a short log of each rejection and the fix in `apps/ios/CHANGELOG.md`.

## 9. Later, not v1

- iPhone Duo screenshots when the project moves to the iOS 27.1 SDK (from April 2027, source 17).
- Accessibility labels: claim more as you test them (source 21).
- Accounts (plan Phase 5) bring 4.8 Sign in with Apple and 5.1.1(v) in-app account deletion (source 1). Not in v1 and not in this pack.
- The privacy answers and the policy change again if the app starts sending anything of its own to a server.
