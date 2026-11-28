# App Privacy: answers, policy gaps and the privacy manifest

Scope: AI;DR for iPhone v1, bundle id `oneni.aidr.app`. No account, no ad or analytics SDK, no tracking.
Guideline anchors: 5.1.1(i) privacy policy link in the metadata and in the app; 5.1.2 data use; 2.3 privacy information must match the app. See sources.md.

## Answer in one line

Declare **Usage Data > Other Usage Data**, not linked to the user, not used for tracking, purpose Analytics. Declare nothing else.

Why not "Data Not Collected": the worker counts every call to `/api/public`, `/api/feed`, `/api/story/:id` and `/api/week/:week` in an Analytics Engine dataset (route, status, coarse client type, no identifier; `apps/web/src/lib/usage.ts`). The privacy policy says so. The app calls those routes, so a label of "Not Collected" would contradict the policy. Apple defines "collect" as sending data off the device in a way that lets you keep it longer than needed to serve the request (source 14). A request counter kept in a dataset meets that wording. An extra, harmless disclosure never gets an app rejected. A label that contradicts the published policy can.

If the operator later stops counting app requests in the worker, change the answer to "No, we do not collect data from this app" and delete the `NSPrivacyCollectedDataTypes` entry below. Change both in the same release.

## Conditions this answer rests on

The app lane must keep these true. Each one is checkable.

| # | Condition | How to check |
|---|---|---|
| C1 | The app sends no open or click beacon. It never calls `POST /api/read`. That route feeds the per-story counters that move ranking. | `rg -n "api/read" apps/ios` returns nothing |
| C2 | The app has no third-party SDK and no analytics, crash or ad code. | `apps/ios/project.yml` has no `packages:` entry except `AIDRKit` |
| C3 | List thumbnails load through `/api/thumb/:id`, which serves a 144 px square (`THUMB_SIDE` in `apps/web/src/routes/api/thumb.$id.ts`), so the publisher does not see the reader's IP for them. Larger pictures (story hero, share-card background, notification attachment) load from the publisher's server, which does receive the IP, like any web server. The policy says exactly this. | `rg -n "image_url\|api/thumb" apps/ios` shows which views use which. The policy sentence must match the result. |
| C4 | The app stores nothing about the reader on any server. Language, text size and reminder time stay in `UserDefaults`. | code review of every non-GET request: there are none |
| C5 | "Suggest a story" opens the system mail composer or `mailto:`. The app itself sends no mail text. | the app has no HTTP POST to a contribution endpoint |
| C6 | The Foundation Models prompt and output never leave the device. No logging of them off device. | `rg -n "LanguageModelSession" apps/ios` shows no network call nearby |

If C5 changes (the app posts the suggestion itself), also declare Contact Info > Email Address and User Content > Other User Content, purpose App Functionality. The "optional disclosure" exemption does not fit: it needs the reader's account name shown in the form and an affirmative send each time (source 14).

## App Store Connect: App Privacy, question by question

| Question in App Store Connect | Answer |
|---|---|
| Privacy Policy URL | `https://aidr.today/privacy` after the iOS section below is published |
| User Privacy Choices URL | leave empty (optional) |
| Do you or your third-party partners collect data from this app? | **Yes** |
| Contact Info (name, email, phone, address, other) | not collected |
| Health & Fitness | not collected |
| Financial Info | not collected |
| Location (precise, coarse) | not collected |
| Sensitive Info | not collected |
| Contacts | not collected |
| User Content (emails or messages, photos or videos, audio, gameplay, customer support, other) | not collected (see C5) |
| Browsing History | not collected |
| Search History | not collected. Search runs over the cached edition on the device. |
| Identifiers (user ID, device ID) | not collected |
| Purchases | not collected |
| Usage Data: Product Interaction | not collected |
| Usage Data: Advertising Data | not collected |
| Usage Data: **Other Usage Data** | **collected** |
| Diagnostics (crash, performance, other) | not collected. Apple's own opt-in crash reports are Apple's collection, not ours. |
| Other Data | not collected |

For Other Usage Data:

| Follow-up | Answer |
|---|---|
| Is this data linked to the user's identity? | No. It holds a route, a status and a coarse client type. No identifier, no IP address. |
| Do you or your partners use this data to track the user? | No |
| Why is it collected? | **Analytics** only |

Tracking: No. Do not add `AppTrackingTransparency` or `NSUserTrackingUsageDescription`. Third-party partners: none.

## Privacy policy: gaps found at https://aidr.today/privacy (read 2026-11-28)

The page is dated "Effective 21 October 2026" and says it "covers https://aidr.today and the aidr Chrome new-tab extension". It has nothing for an iPhone app.

| # | Gap | Why it matters | Fix |
|---|---|---|---|
| G1 | No iOS app section. The scope sentence names the website and the Chrome extension only. | 5.1.1(i): the policy must cover the app. A reviewer opens the link and looks for the app. | Publish the iOS section below and change the scope sentence. |
| G2 | The opening "Single purpose" text describes only the extension ("It does nothing else"). | It reads as the policy of one product. | Restructure by surface: Website, Chrome extension, iPhone app. |
| G3 | No general retention, deletion or consent-revocation statement. Only the email digest ("Unsubscribing deletes all of it") and comments (90 days) say anything. | 5.1.1(i) asks for retention and deletion policy and how to revoke consent or request deletion. | One short "Your choices and deletion" block (in the section below). |
| G4 | The long analytics paragraph (Google Analytics 4, PostHog with session replay, Jitsu, Seline) is about the website. | A reviewer who reads it next to a label that says little data is collected may think the label is wrong. | State in the iOS section that the app loads none of them. Keep the website text as it is. |
| G5 | "No account, no ads, and no sale of data" sits next to the Clerk sign-in paragraph. | The two lines look inconsistent. | Reword to "No ads and no sale of data. Accounts exist only on the website." |
| G6 | "Email contributions" says content is kept only when the sender signs in. "Mail from an address with no account keeps no content." | The app has no accounts, so a reader's suggestion from the app is dropped. See the cross-lane bug in checklist.md. | Either accept mail from non-accounts, or keep the sentence and do not promise the feature (decision in checklist.md, section "Cross-lane items"). |
| G7 | `/privacy?lang=vi` returns the English text. The app and the listing are Vietnamese. | Vietnamese readers get an English policy. Not a rule, but a quality risk. | Add a Vietnamese version (text below). |
| G8 | The "Changes" clause promises to update "this page and the extension listing". | Misses the App Store listing. | Add "and the App Store listing". |
| G9 | Contact is `me@duyet.net` in the first paragraph only. | 1.5 wants easy contact on the Support URL page too. | Put the same contact on `/support`. |
| G10 | The privacy link is not in the app yet. | 5.1.1(i) wants it "within the app in an easily accessible manner". | Settings row "Privacy Policy" that opens the URL. App lane item. |

### Ready to paste: iOS section, English

```text
iPhone app (AI;DR for iPhone)
The app has no account and no sign-in.
It loads no analytics, advertising or tracking code, and it does not ask to track you.
The app asks aidr.today for the public edition. Like any server, aidr.today receives your IP address with each request. We never store it. A Cloudflare rate limiter keeps a one-minute counter for your IP address. We also count each API request by route, status and a coarse client type, with no identifier, to see how much each surface is read.
The last edition, a picture cache, your language, text size and reminder time are saved on your iPhone only. Deleting the app deletes them.
List thumbnails come through aidr.today. Larger pictures, and the picture in the daily notification, load from the publisher's server, which receives your IP address like any web server. When you tap Read source, the page opens in an in-app Safari view. The publisher's own policy applies there.
The daily reminder is a local notification scheduled on your iPhone. It uses no push token and no server. You can turn it off in iOS Settings > Notifications.
Explain simply and Why it matters run on your iPhone with Apple's on-device model. The story text is not sent to us or to anyone else.
Share as image builds the picture on your iPhone. Nothing is uploaded.
Suggest a story opens your mail app. What you send reaches us as a normal email, covered by "Email contributions" above.
Your choices and deletion: the app keeps nothing about you on our servers. Delete the app to remove its local data. Turn off notifications in iOS Settings. To delete an email you sent to submit@aidr.today, write to me@duyet.net.
```

### Ready to paste: iOS section, Vietnamese

```text
Ứng dụng iPhone (AI;DR cho iPhone)
Ứng dụng không có tài khoản và không cần đăng nhập.
Ứng dụng không tải mã phân tích, quảng cáo hay theo dõi, và không xin quyền theo dõi bạn.
Ứng dụng lấy bản tin công khai từ aidr.today. Như mọi máy chủ, aidr.today nhận địa chỉ IP của bạn trong mỗi yêu cầu. Chúng tôi không lưu địa chỉ này. Bộ giới hạn tốc độ của Cloudflare giữ một bộ đếm một phút cho địa chỉ IP của bạn. Chúng tôi cũng đếm mỗi yêu cầu API theo đường dẫn, mã trạng thái và loại ứng dụng khách ở mức đại khái, không kèm mã định danh, để biết mỗi kênh được đọc nhiều hay ít.
Bản tin gần nhất, bộ nhớ đệm ảnh, ngôn ngữ, cỡ chữ và giờ nhắc chỉ được lưu trên iPhone của bạn. Xóa ứng dụng là xóa hết các dữ liệu này.
Ảnh thu nhỏ trong danh sách đi qua aidr.today. Ảnh lớn hơn, và ảnh trong thông báo hằng ngày, được tải từ máy chủ của nhà xuất bản, nơi nhận địa chỉ IP của bạn như mọi máy chủ web. Khi bạn chạm Đọc nguồn, trang mở trong khung Safari ngay trong ứng dụng. Chính sách riêng của nhà xuất bản áp dụng ở đó.
Nhắc mỗi ngày là thông báo cục bộ, được hẹn giờ ngay trên iPhone. Không dùng mã push và không qua máy chủ. Bạn tắt được trong Cài đặt iOS > Thông báo.
Giải thích đơn giản và Vì sao đáng chú ý chạy trên iPhone, bằng mô hình trên máy của Apple. Nội dung tin không được gửi cho chúng tôi hay bất kỳ ai khác.
Chia sẻ dạng ảnh tạo ảnh ngay trên iPhone. Không có gì được tải lên.
Gợi ý tin mở ứng dụng thư của bạn. Nội dung bạn gửi đến chúng tôi như một email bình thường, theo mục "Email contributions" ở trên.
Lựa chọn và xóa dữ liệu của bạn: ứng dụng không giữ gì về bạn trên máy chủ của chúng tôi. Xóa ứng dụng để xóa dữ liệu cục bộ. Tắt thông báo trong Cài đặt iOS. Muốn xóa một email đã gửi tới submit@aidr.today, hãy viết tới me@duyet.net.
```

Two label strings in the Vietnamese text ("Đọc nguồn", "Vì sao đáng chú ý") must match the app's own strings. Check them against `Localizable.xcstrings` before publishing.

## PrivacyInfo.xcprivacy

Copy to `apps/ios/AIDR/PrivacyInfo.xcprivacy` (target resources). `check-metadata.py` parses this block and checks every category and reason code against Apple's list.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeOtherUsageData</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<false/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
			</array>
		</dict>
	</array>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>CA92.1</string>
			</array>
		</dict>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>C617.1</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
```

What each required-reason entry covers (reason texts are from a third-party copy of Apple's table, source 11; confirm on the live page):

| Category and code | Use it when the app | Keep or drop |
|---|---|---|
| UserDefaults `CA92.1` | reads or writes its own settings: language, text size, reminder time, `@AppStorage` | Keep. Certain. |
| FileTimestamp `C617.1` | reads dates, size or metadata of files in its own container: the feed cache age, the 200 MB image cache trimming | Keep if any cache code calls `attributesOfItem`, `contentModificationDateKey`, `creationDateKey`, `fileSize`, `stat`. Drop only if a grep finds none. |
| DiskSpace `E174.1` | checks free space to decide whether to write or delete cache files | Add only if the app calls `volumeAvailableCapacity*` or `systemFreeSize` |
| SystemBootTime `35F9.1` | measures elapsed time with `systemUptime`, `mach_absolute_time`, `clock_gettime` | Add only if used |
| ActiveKeyboards | never | not used |

Find the real answer in the repo before submit:

```bash
rg -n "UserDefaults|AppStorage" apps/ios
rg -n "attributesOfItem|contentModificationDate|creationDate|fileSize|URLResourceKey|stat\(" apps/ios
rg -n "volumeAvailableCapacity|systemFreeSize|systemUptime|mach_absolute_time|clock_gettime" apps/ios
```

Then archive and run Product > Archive > Distribute > Generate Privacy Report in Xcode. It lists the APIs the binary uses. Since 1 May 2024 App Store Connect needs an approved reason for every required-reason API the code uses before it accepts an upload (source 6). `URLCache`, `BGTaskScheduler`, `UNUserNotificationCenter` and Foundation Models are not required-reason APIs (inferred from the category list, which has five categories).

## Other binary privacy items

- No `NSUserTrackingUsageDescription`. No Contacts, Photos, Location or Camera strings. The app needs no usage-description key beyond the notification permission, which has no Info.plist key.
- Ask for notification permission when the reader turns the reminder on, not at first launch. The app must work without it (4.5.4, 5.1.1(iv), 5.1.2(i)).
- No push entitlement in v1. Local notifications only.
