# Sources

Read on 2026-11-28. Numbers are cited in the other files as "source N". "Read" says what the fetch actually returned. Several Apple documentation pages are rendered by script, and the fetch tool returned only the page title for them, then filled in from its own general knowledge. Those are marked **title only** and are not evidence. Nothing in the pack depends on them alone.

## Apple, App Review and App Store Connect

| # | URL | What I read | Used for |
|---|---|---|---|
| 1 | https://developer.apple.com/app-store/review/guidelines/ | Full text of 1.1, 1.2, 1.4, 1.5, 2.1, 2.3 (2.3.1 to 2.3.14), 2.4.1, 2.5.1, 2.5.19, 4.1, 4.2 (4.2.1 to 4.2.7), 4.3, 4.5.1, 4.5.4, 4.8, 5.1.1 (i to x), 5.1.2, 5.2 (5.2.1 to 5.2.5). The captured page cut off inside 5.2.5, so section 5.6 and the page's last-updated date were not seen. | All risk rows |
| 2 | https://developer.apple.com/news/?id=ey6d8onl | "Updated App Review Guidelines now available", 13 Nov 2025: 1.2.1(a), 4.1(c), 5.1.2(i) third-party AI wording and others | 5.1.2(i), 4.1(c) |
| 2b | https://macrumors.com/2026/06/09/app-store-guidelines-low-quality-apps/ | June 2026 change to 4.3(b), spam and low-quality apps. Secondary source. | "also watched" note |
| 2c | https://developer.apple.com/news?id=vvzx6cul | 16 Oct 2026 news: 1.2 non-consensual imagery, 2.5.19 bait-and-switch, section 5 child exploitation. It does **not** mention age-rating dates. | 2.5.19 |
| 4 | https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information | Limits: promotional text 170, description 4000, keywords 100 bytes (each over two characters), What's New 4000 (not for the first version), support URL "must lead to actual contact information", App Review notes up to 4000 bytes, contact phone in international format. Name and subtitle limits are not on this page. | check-metadata.py, 1.5 |
| 5 | https://developer.apple.com/app-store/product-page/ | Name up to 30, subtitle up to 30, promo text 170, keywords "100 characters", the list of metadata that gets rejected, first one to three screenshots show in search, dark mode shot advice. Note: this page says characters, source 4 says bytes. The check script enforces bytes, which satisfies both. | metadata, screenshots |
| 6 | https://developer.apple.com/news/upcoming-requirements/ | Xcode 26 and iOS 26 SDK required from 28 Apr 2026. Age ratings updated 31 Jan 2026. Privacy manifests and required-reason reasons required since 1 May 2024. It does **not** list 16 Nov 2026 or 12 Jan 2027. | binary checks |
| 7 | https://developer.apple.com/news/?id=ks775ehf | 24 Jul 2025: new 13+, 16+, 18+ ratings, new questions, "consider how AI assistants and chatbot functionality" affect sensitive content, deadline 31 Jan 2026 | age rating |
| 8 | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions | Descriptor list, tier table, Unrestricted Web Access and Age Assurance definitions. Cut off in the Brazil table, so the **Vietnam and Korea tables were not read**. | age rating |
| 9 | https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating | Steps, Made for Kids, override, API. It states no deadline. | age rating |
| 10 | https://developer.apple.com/news?id=tlur8uvi | 9 Jul 2026: social media capability question, Time Allowances, mandatory from September 2026 | Social Media answer |
| 11 | https://gist.github.com/mironal/9169633fb09c06c2f8f781ebe01644b7 | A **third-party copy** of Apple's required-reason table: categories and reason codes (CA92.1, C617.1, 3B52.1, DDA9.1, 0A2A.1, E174.1, 85F4.1, 7D9E.1, 35F9.1 and others). Apple's own page https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api is script-rendered and came back as title only. Re-check the codes there. | privacy.md, the plist check |
| 12 | https://developer.apple.com/documentation/bundleresources/privacy-manifest-files | **Title only.** The manifest keys (NSPrivacyTracking, NSPrivacyTrackingDomains, NSPrivacyCollectedDataTypes, NSPrivacyAccessedAPITypes) come from the tool's general knowledge and from my own familiarity with the format. | privacy.md |
| 13 | https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy | Steps, "Yes, we collect data" flow, privacy policy URL required. | privacy.md |
| 14 | https://developer.apple.com/app-store/app-privacy-details/ | Verbatim definitions of "collect", tracking, linked to the user, optional disclosure (four criteria), the Usage Data, Diagnostics, Identifiers and Search History types, and that data processed only on the device is not collected. | privacy.md |
| 15 | https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance | Scope, the two paths, France note, responsibility for the claim. It does not name `ITSAppUsesNonExemptEncryption`. | export compliance |
| 16 | https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations | **Title only.** The HTTPS-is-exempt statement and the key are standard practice from general knowledge. Confirm on the live page. | export compliance |
| 17 | https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications | Fetched twice, once as raw HTML. The "required device sizes" line names iPhone with Dynamic Island (medium display). Full size table for every class. 1 to 10 shots, png or jpg, no alpha. iPad 13 inch if the app runs on iPad. iPhone Duo from April 2027. | screenshots.md |
| 18 | https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview | 100 internal, 10,000 external, first build of a group reviewed, 90 day expiry, Test Information | checklist 6 |
| 18b | https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers | Internal group first, Test Information, one build per version in review, public link, 1 to 10,000 limit | checklist 6 |
| 19 | https://developer.apple.com/help/account/membership/program-enrollment | Individual: 2FA, age of majority, legal name shown as seller, 99 USD, own card, ID only if enrollment is delayed | checklist 4 |
| 20 | https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements | Trader or not, what individuals provide, where to declare | checklist 4.3 |
| 21 | https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels | Voluntary now, required over time, the nine labels | checklist 5.9 |
| 22 | https://developer.apple.com/support/terms/acceptable-use-requirements-for-the-foundation-models-framework/ | The 20 prohibited uses | checklist 3.7 |
| 29 | https://developer.apple.com/help/app-store-connect/reference/app-information/app-and-submission-statuses | The 16 version statuses and meanings | checklist 7.4 |

## Apple Intelligence and region

| # | URL | What I read | Used for |
|---|---|---|---|
| 23 | https://9to5mac.com/2025/11/11/ios-26-1-brings-apple-intelligence-to-these-eight-new-languages/ | Search summary: Vietnamese added to Apple Intelligence in iOS 26.1. Secondary source. | description wording |
| 24 | https://developer.apple.com/forums/thread/805378 | Search summary only: Foundation Models needs the device language to be supported. A developer report, not documentation. | review notes, risk 3 |
| 25 | https://developer.apple.com/news/?id=06h4gf33 and https://www.pocketgamer.biz/apple-shares-compliance-steps-following-vietnams-new-app-store-game-licensing-rules | Search summary only: Vietnam requires a licence for games. Nothing found on news apps. | cross-lane X8 |

## Forum and practitioner evidence

| # | URL | What it showed |
|---|---|---|
| 26 | https://developer.apple.com/forums/thread/82714 | 4.2.2 for several apps. A tech-news reader (xPodcasts) failed with thumbnails, parsed article content, bookmarks, comments and metadata edits for about a month. It passed when the developer told reviewers the audio feature was the native differentiator. Another app was told by Apple that favourites, sharing and offline were not enough. |
| 26 | https://developer.apple.com/forums/thread/835821 (June 2026) | Turkish news app rejected twice with the template "only includes links, images, or content aggregated from the Internet" despite detailed notes on eight native features. Appeal open, no outcome. |
| 26 | https://developer.apple.com/forums/thread/835422 | Native app rejected 4.2 because the reviewer apparently never left the Home and browser tabs. Open. |
| 26 | https://developer.apple.com/forums/thread/706456, https://developer.apple.com/forums/thread/786954 | News-condensing aggregator rejected under 4.2.2 every time; staff reply on how to appeal (one appeal per rejection, specific reasons) |
| 26 | https://developer.apple.com/forums/thread/105345 | News aggregator rejected under 5.2.2. Replies: supply documents that give the right to display the content, or drop the sources. No confirmed fix. |
| 26 | https://developer.apple.com/forums/thread/115490 | 5.2.2 rejection of a TestFlight build; replies on ownership and that a new build cancels an appeal (user claim) |
| 26 | https://developer.apple.com/forums/thread/837349 (July 2026) | 5.2.3 for a radio app using a public directory API. App Review asked for "documentary evidence". No answer in the thread. |
| 27 | https://hackernoon.com/how-sameq-survived-four-app-store-rejections | 2.1(a) rejections: old archive uploaded, empty content for the reviewer, notes that described a button the build lacked, 1.2 needing all UGC items at once |
| 27 | https://dev.to/snake_sun/the-ios-audit-sprint-what-30-days-of-app-store-rejections-taught-me-1m9o | Bump the build number; reading rejection emails. IAP advice does not apply (free app). The post sells a paid audit. |
| 27 | https://www.revenuecat.com/blog/engineering/how-to-avoid-app-store-rejections | Demo accounts, review notes with videos, complete metadata early. Vendor blog. |
| 28 | https://news.ycombinator.com/item?id=15663069 (via https://hn.algolia.com/api/v1/search) | Hacker News search returned one 4.2 thread from 2017 with no comments and one 2024 thread with none. No useful practitioner content. |

## Not found

- Reddit (r/iOSProgramming): the search endpoint returned 403, and the web search with Reddit and Hacker News domain filters returned nothing. No Reddit evidence is cited.
- X threads: not searched in a way that returned results. None cited.
- The Apple Developer Forums stand in for practitioner reports. They are real developers and some replies are Apple staff.
- Apple's age-rating dates "16 Nov 2026" and "12 Jan 2027" came from one web search summary. Apple's news and requirements pages I fetched did not show them. They are treated as unconfirmed.
- No source gave a reviewer message that cites 5.2.1 for news headlines or images. The 5.2.2 threads are the closest evidence.
- How Apple indexes Vietnamese diacritics in the keyword field is not documented. VI keywords are written without accents to fit the budget. This is a guess. Test by searching the Vietnam storefront after release.
