# Review notes, age rating and export compliance

Everything the operator pastes into App Store Connect > App Review, plus the answers to the rating and encryption questions.
The "Notes" block is capped at 4000 bytes by Apple (source 4). `check-metadata.py` measures it.
Rule from the forums: a note that names a button the build does not have is a rejection (source 27, HackerNoon). Before every submit, walk each tap path below on the build you upload.

## App Review Information: other fields

| Field | Value |
|---|---|
| Sign-in required | Off. The app has no account. No demo account exists, so none is given (2.1(a)). |
| Contact first name, last name | <<operator: first and last name of the person who answers App Review>> |
| Contact phone | <<operator: international format with +, for example +84...>> |
| Contact email | <<operator: monitored inbox>> |
| Attachments | Two screen recordings, 30 to 60 seconds each, captured on a real iPhone with Apple Intelligence on. File names: `aidr-review-1-offline-notification-share.mov`, `aidr-review-2-explain-on-device.mov`. |
| Version release | Manual release. Press release only after the first approval email and a smoke check. |

The repo is public. Keep the real phone number and name out of git. Put them in App Store Connect only.

## App Review Information: Notes

Paste the whole block. Update the tap paths if the build changes.

```text
AI;DR is a native SwiftUI app for iPhone (iOS 26 and later). It is not a web view. There is no account, no sign-in and no demo account. Everything works on first launch. The app starts in the device language (English or Vietnamese). The two languages never fall back to each other. Change it in Settings > Language.

WHAT THE APP DOES THAT A WEBSITE CANNOT (guideline 4.2)
1. Offline edition. Open the app once with a network. Turn on Airplane Mode and relaunch. Today shows the saved edition with an Offline banner. Screen recording 1.
2. Daily notification with a picture. Settings > Daily reminder > on > allow notifications > Send test now. The notification shows the top headline and its thumbnail. The real reminder is a local notification at the time the reader picks (default 07:00). It uses no push server. Screen recording 1.
3. Share as image. Open any story > Share > Share as image. Pick a background, padding and corner radius. The card is drawn on the device with ImageRenderer. Screen recording 1.
4. On-device AI. Open a story > Explain simply, or Why it matters. This uses Apple's Foundation Models framework and runs on the device. The story text is not sent anywhere. The two buttons show only on a device where Apple Intelligence is available (iPhone 15 Pro or later, Apple Intelligence turned on in Settings > Apple Intelligence and Siri, a supported language). On other devices they are absent by design and everything else works. Screen recording 2 shows it.
5. Today, Digest, Calendar and Weeks tabs. Today is the ranked list with topic chips and search. Digest is the day in 8, 12 or 16 lines. Calendar is a heat map of past editions. Weeks lists weekly editions.

CONTENT AND RIGHTS (5.2)
AI;DR reads public RSS feeds and pages of AI news sources. For each story it shows the headline, a short summary written by a language model, and a thumbnail taken from the publisher's own page metadata. It does not copy article text. Every story has a Read source button that opens the original page in SFSafariViewController. The source list is public: https://aidr.today/data . We remove a source or a picture on request: me@duyet.net. We can provide documentation for any source on request.
Summaries can contain errors. The app says so in Settings > About and links to the original.

PRIVACY (5.1.1, 5.1.2)
No tracking, no ads, no third-party SDK. The app collects no personal data. It sends plain GET requests to https://aidr.today. Privacy policy: https://aidr.today/privacy (also Settings > Privacy Policy). Support: https://aidr.today/support . Notification permission is asked only when the reader turns the reminder on, and the app works without it.

OTHER
- Suggest a story opens the system mail composer addressed to submit@aidr.today. The app sends nothing itself.
- Encryption: HTTPS only through the system. ITSAppUsesNonExemptEncryption is NO.
- iPhone only. Portrait only.
- Age rating is 13+ because headlines can mention violence, abuse or lawsuits around AI. The app has no user-generated content and no social features.
- The server (aidr.today) is live all day. The edition refreshes every 30 minutes.
```

## Age rating answers

Set in App Information > Age Ratings > Set Up Age Ratings (source 9). The questionnaire changed in July 2025 and again in 2026 (sources 7, 10); the reference list of descriptors is source 8. App Store Connect may show descriptors added on 16 Nov 2026 with an answer deadline of 12 Jan 2027. That date came from a search summary only. Apple's own pages I read did not state it. Open the form and answer every question it shows.

| Section | Item | Answer | Reason |
|---|---|---|---|
| In-app controls | Parental Controls | No | none in app |
| In-app controls | Age Assurance | No | none |
| Capabilities | Unrestricted Web Access | **No** | see the decision below |
| Capabilities | User-Generated Content | No | Suggestions go to a review pipeline and are never shown to other readers. |
| Capabilities | Social Media | No | no feed, no sharing of user content to many users |
| Capabilities | Messaging and Chat | No | the on-device model has fixed prompts, no free chat |
| Capabilities | Shared Location | No | no location |
| Capabilities | Advertising | No | none |
| Mature themes | Profanity or Crude Humor | None | |
| Mature themes | Horror or Fear Themes | None | |
| Mature themes | Alcohol, Tobacco, or Drug Use or References | None | |
| Mature themes | Dating and Relationships | None | The app has no companion character. |
| Medical or wellness | Medical or Treatment Information, Health or Wellness Topics | None | AI health stories are headlines, not advice. |
| Sexuality or nudity | Mature or Suggestive Themes | **Infrequent** | The live feed on 2026-11-28 carried a headline about AI-made abuse images. Headlines can mention this. |
| Sexuality or nudity | Sexual Content or Nudity, Graphic | None | no images of it; thumbnails are the publisher's article pictures |
| Violence | Realistic Violence | **Infrequent** | headlines about lawsuits, abuse, war uses of AI |
| Violence | Cartoon or Fantasy Violence, Prolonged Graphic, Guns or Other Weapons | None | |
| Chance | Gambling, Simulated Gambling, Contests, Loot Boxes | None | |
| Overrides | Age Categories and Override | Not Applicable | Do not choose Made for Kids. |

Expected result: **13+** (table in source 8: infrequent realistic violence and infrequent sexual themes sit in 13+). After saving, read the per-region ratings on the App Information page. Vietnam has its own table that I could not read (source 8 was cut off). If Vietnam shows a higher value, accept it.

Decision on Unrestricted Web Access (guideline 2.3.6 wants honest answers):

- Apple's definition: users "can navigate to any webpage within the app or freely browse the web. May include: embedded browser functionality" and it moves an app to 16+ (source 8).
- The app opens one page, the story's source link, in SFSafariViewController. There is no address bar and no way to type a URL. Readers can follow links on that page.
- Chosen answer: **No**. The app is not a browser. The risk: App Review may disagree and set 16+. That changes the rating only. It is not a rejection reason by itself. Accept the change and do not appeal it.
- Required for this answer: the app must not host a `WKWebView` for general browsing and must not offer a URL field. SFSafariViewController must stay visible and unobscured (5.1.1(vii)).

AI output and the rating (source 7: "consider how AI assistants and chatbot functionality affect how often sensitive content appears"): the on-device explain feature takes one story as input and cannot take free text, so it adds no new kind of content. It can restate a sensitive story. That is covered by the "Infrequent" answers above. Handle a guardrail refusal from Foundation Models with a plain message, not a blank screen.

## Export compliance

- Info.plist already carries `ITSAppUsesNonExemptEncryption = NO` in `apps/ios/project.yml` on the `feat/ios-app` branch. Keep it.
- Basis: the app uses only HTTPS through `URLSession` and system encryption. No custom or non-standard cryptography, no encryption library (sources 15, 16).
- With the key set, App Store Connect and TestFlight do not ask the questions on each upload.
- If App Store Connect asks anyway: "Does the app use encryption?" Yes, standard encryption only, through the operating system. "Does it qualify for an exemption?" Yes. No documentation upload. No CCATS. The responsibility for this claim is the account holder's (source 15). France: the app is not a secure-storage, secure-communication or anti-virus app (source 15 lists those as the controlled categories).

## Rights reply: if Apple asks for documentation (5.2.1, 5.2.2)

Forum cases show reviewers ask for "documentary evidence" and the threads do not say what satisfied them (sources 26: threads 105345, 115490, 837349). Do not invent permissions. Reply with facts:

```text
AI;DR does not host, copy or resell article content. For each story it shows the headline, a short summary written by a language model, and a thumbnail taken from the publisher's own page metadata or feed. Every story links to the original page. The sources are public RSS feeds and pages listed at https://aidr.today/data . Article text is never stored or shown. Summaries and headlines are shown to inform and point readers to the publisher. If a publisher asks us to remove its feed, headlines or pictures, we remove them promptly: me@duyet.net. Tell us which source you want documentation for and we will send what we have for it.
```

Before submit, the operator should confirm two facts in this text against the code: the app shows no article body, and `/data` lists every source. If either is false, change the text. Never send the template unchanged on a guess.

## Reply: if the review says 4.2 or 4.2.2 (aggregator, "collection of links")

This is the most likely rejection (source 26, threads 82714, 835821, 706456). Forum evidence: reviewers brushed aside bookmarks, share and offline alone. The one documented approval came after the developer named a native-only feature to the reviewer (thread 82714). Reply in Resolution Center, once, with:

```text
Thank you for the review. AI;DR is native SwiftUI. These features have no web equivalent. Please test them with the steps in the review notes and the two attached recordings: (1) the saved edition opens offline; (2) a local notification carries the top headline and its picture; (3) Share as image renders a card on the device with ImageRenderer; (4) Explain simply and Why it matters use Apple's on-device Foundation Models, and need an iPhone with Apple Intelligence turned on. If your device does not have it, recording 2 shows the feature. The app is not a collection of links: it ranks stories, writes summaries, and builds a digest. We are happy to adjust anything specific.
```

If it is rejected a second time with the same text, file one appeal with the App Review Board with the same facts. Apple staff in the forums say: one appeal per rejection, give specific reasons, answer any request for information first (source 26, thread 786954). One forum answer says submitting a new build cancels a pending appeal (source 26, thread 115490; a user claim, not Apple text). Pick one.
