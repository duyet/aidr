# Chrome Web Store — update packet

This is an update to the published item
https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg.
Unpacked zips never auto-update; CWS installs do (Chrome checks Google's
update service). Do **not** set `update_url` in `manifest.json`.

Dashboard: https://chrome.google.com/webstore/devconsole

`EXTENSION_STORE_URL` in `apps/web/src/lib/extension-release.ts` already
points at that listing. Leave it.

---

## Package to upload

```bash
pnpm --filter @aidr/web pack-cws
# → apps/extension/dist/aidr-cws.zip
```

| | |
|---|---|
| File | `apps/extension/dist/aidr-cws.zip` |
| Version | `0.1.21` (must match `manifest.json` + `package.json`; release-please owns the bump) |
| Layout | `manifest.json` at zip **root** (not under `aidr/`) |
| Store flavor | no `optional_host_permissions`, `connect-src` = `aidr.today` only |
| Do **not** upload | `https://aidr.today/aidr.zip` / `public/aidr.zip` (nested Load unpacked zip) |

Visibility: keep the existing listing **Public**. This upload is an update, not a new item.

---

## Store listing — copy/paste

### Name

```
aidr
```

### Short description (≤132 chars) — English

```
Today's AI;DR digest and ranked AI stories from aidr.today on every new tab. English or Vietnamese. No account, no ads.
```

### Short description — Vietnamese

```
Bản tin AI;DR và tin AI xếp hạng từ aidr.today mỗi khi mở thẻ mới. Tiếng Việt hoặc tiếng Anh. Không tài khoản, không quảng cáo.
```

### Detailed description — English

```
aidr replaces Chrome's new tab with today's AI;DR: the short daily digest of AI news from aidr.today, plus the ranked stories behind it.

Open a new tab and you see the same digest as the website. Numbered one-line summaries, category labels, trending topics, and story rows grouped by day. No account. No ads. No access to your browsing history.

New in 0.1.21
• Five density steps, from dense to spacious. Medium is the default.
• Story rows line up: title, compact votes, category and time sit in columns, the same as aidr.today.
• Image / text switch on the day card. Pick the picture card of the day's top stories, or the numbered text list.
• The new tab now matches aidr.today, so moving between the two feels the same.

What you get
• Today's AI;DR digest, opened on that day's date
• Ranked story rows grouped by day, with category, source and votes
• Day card as an image or as text
• Light, dark or system theme, five background tones, sans or serif, text size and density
• English or Vietnamese
• Intro video, loaded only after you press play
• A short local cache of the last digest, so the tab still paints offline

How it works
The extension reads public JSON from https://aidr.today (GET /api/public and /api/feed) and paints it in the new tab. Settings stay in chrome.storage on your device.

Links
Website: https://aidr.today
What changed: https://aidr.today/changelog
Release notes: https://aidr.today/release
Privacy: https://aidr.today/privacy
Support: https://github.com/duyet/aidr/issues
Telegram (Vietnamese): https://t.me/aihomnay
Telegram (English): https://t.me/aidr_today
Facebook: https://www.facebook.com/aidr.today/
```

### Detailed description — Vietnamese

```
aidr thay thẻ mới của Chrome bằng AI;DR hôm nay: bản tin AI ngắn mỗi ngày từ aidr.today, kèm danh sách tin được xếp hạng.

Mở thẻ mới là thấy cùng bản tin như trên website. Tóm tắt một dòng có đánh số, nhãn chuyên mục, chủ đề đang nổi, và danh sách tin chia theo ngày. Không cần tài khoản. Không quảng cáo. Không truy cập lịch sử duyệt web.

Mới trong 0.1.21
• Năm mức mật độ, từ dày đến thoáng. Mặc định là vừa.
• Hàng tin thẳng cột: tiêu đề, số phiếu gọn, chuyên mục và thời gian, giống aidr.today.
• Nút chuyển ảnh / chữ trên thẻ ngày. Chọn ảnh tóm tắt các tin nổi bật trong ngày, hoặc danh sách chữ có đánh số.
• Thẻ mới giờ giống aidr.today, chuyển qua lại giữa hai nơi không thấy khác.

Bạn nhận được
• Bản tin AI;DR hôm nay, mở đầu bằng ngày của bản tin
• Tin xếp hạng chia theo ngày, kèm chuyên mục, nguồn và số phiếu
• Thẻ ngày dạng ảnh hoặc dạng chữ
• Giao diện sáng, tối hoặc theo hệ thống, năm màu nền, chữ không chân hoặc có chân, cỡ chữ và mật độ
• Tiếng Việt hoặc tiếng Anh
• Video giới thiệu, chỉ tải sau khi bạn bấm xem
• Bộ nhớ đệm ngắn của bản tin gần nhất, để thẻ vẫn hiện khi offline

Cách hoạt động
Tiện ích đọc JSON công khai từ https://aidr.today (GET /api/public và /api/feed) rồi hiển thị trên thẻ mới. Cài đặt lưu trong chrome.storage trên máy bạn.

Liên kết
Website: https://aidr.today
Thay đổi: https://aidr.today/changelog
Ghi chú phát hành: https://aidr.today/release
Quyền riêng tư: https://aidr.today/privacy
Hỗ trợ: https://github.com/duyet/aidr/issues
Telegram (tiếng Việt): https://t.me/aihomnay
Telegram (tiếng Anh): https://t.me/aidr_today
Facebook: https://www.facebook.com/aidr.today/
```

### Category

**News**

### Language

Primary: **English**  
Also: **Vietnamese** (`_locales/en` + `_locales/vi`)

### Homepage URL

```
https://aidr.today/subscribe
```

### Support URL

```
https://github.com/duyet/aidr/issues
```

### Privacy policy URL (required)

```
https://aidr.today/privacy
```

---

## Single purpose (dashboard)

```
Replaces the Chrome new tab with the public AI;DR digest and ranked AI stories from aidr.today.
```

---

## Permission justifications

### `storage`

```
Save appearance/language settings and a short local cache of the last digest so a new tab still renders offline.
```

### Host permission `https://aidr.today/*`

```
Fetch GET /api/public and GET /api/feed to paint the new-tab digest. No other origins.
```

(CWS zip has **no** localhost optional hosts — do not justify them.)

---

## Privacy practices (dashboard)

Certify honestly; must match https://aidr.today/privacy.

| Question | Answer |
|---|---|
| Privacy policy | `https://aidr.today/privacy` (HTTPS, no login) |
| Remote code | **No** — all JS ships in the package |
| Single purpose | New-tab AI;DR digest from aidr.today only |
| User data collected | **Website content** (public story titles, URLs, summaries, tags, thumbs) used only to paint the new tab |
| Not collected | Personally identifiable info, health, financial, authentication, personal communications, location, web history, user activity beyond the public feed fetch, website content unrelated to the digest |
| Sold to third parties | **No** |
| Used for creditworthiness | **No** |
| Used for ads / ad personalization | **No** |
| Transferred for unrelated purpose | **No** |
| Limited Use certification | **Yes** — collection only for the single purpose |

Data handling note for reviewers: settings + digest cache stay in `chrome.storage` on-device. The digest is fetched from `https://aidr.today` over HTTPS. Opening the intro video loads a YouTube embed from `https://www.youtube-nocookie.com` only after the reader presses play.

---

## Listing assets (dashboard only — not in the zip)

See [`store/README.md`](./store/README.md). Regenerate all of them with
`pnpm --filter @aidr/extension store-assets`. Every screenshot is a
headless Chrome frame of the real unpacked new tab with the live digest.
Do **not** invent screenshots with an image model.

| Asset | Size | Dashboard slot | File |
|---|---|---|---|
| Store icon | 128×128 | Store icon | `icons/icon128.png` (also in package) |
| Screenshot 1 — AI;DR digest | **1280×800** | Global screenshots | `store/en-1-digest.jpg` |
| Screenshot 2 — ranked story rows | **1280×800** | Global screenshots | `store/en-2-stories.jpg` |
| Screenshot 3 — day card image view | **1280×800** | Global screenshots | `store/en-3-day-card.jpg` |
| Screenshot 4 — dark theme | **1280×800** | Global screenshots | `store/en-4-dark.jpg` |
| Screenshot 5 — settings (density, theme) | **1280×800** | Global screenshots | `store/en-5-settings.jpg` |
| Vietnamese screenshots 1–5 | **1280×800** | Localized screenshots → Vietnamese | `store/vi-1-digest.jpg` … `store/vi-5-settings.jpg` |
| Small promo tile | **440×280** | Small promo tile | `store/promo-440x280.jpg` |
| Marquee | **1400×560** | Marquee promo tile | `store/marquee-1400x560.jpg` |

All JPEG, no alpha channel. Check with
`sips -g pixelWidth -g pixelHeight -g hasAlpha apps/extension/store/*.jpg`.

---

## Account & publish checklist

1. [x] Chrome Web Store item already published (account + 2SV already done)
2. [x] `0.1.21` on master (`manifest.json` + `package.json`)
3. [x] Screenshots (5 EN + 5 VI, 1280×800), promo 440×280 and marquee 1400×560 in `apps/extension/store/`
4. [ ] `pnpm --filter @aidr/web pack-cws` → upload `apps/extension/dist/aidr-cws.zip` on the existing item (do not upload `aidr.zip`), or `pnpm --filter @aidr/web cws-publish --upload-only`
5. [ ] Paste the short and detailed descriptions above (EN; VI under the Vietnamese locale)
6. [ ] Replace Global screenshots with `en-1` … `en-5`, Localized (Vietnamese) with `vi-1` … `vi-5`, then the small promo tile and marquee
7. [ ] Confirm single purpose + permission justifications still match
8. [ ] Confirm privacy practices (intro video on `youtube-nocookie.com`, only after play)
9. [ ] Submit the update for review on the existing public item
10. [x] `EXTENSION_STORE_URL` already points at the listing. Do not clear it

---

## Review traps this package already avoids

- MV3, no `eval`, no remotely hosted scripts
- No `<all_urls>`, no `tabs` / `webRequest` / `history` / `identity`
- New tab override uses documented `chrome_url_overrides`
- CSP `connect-src` limited to aidr.today (CWS package)
- No `update_url` in manifest
- Search copy is site-specific (“Search aidr.today”), not omnibox hijack

`AIDR_EXT_STORE=1 pnpm --filter @aidr/extension build` fails if the
source tree still has localhost optional hosts (unpacked default keeps
them). The CWS packer strips loopback from the packed manifest.
