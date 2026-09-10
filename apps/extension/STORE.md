# Chrome Web Store — first submit packet

Do **not** invent a store URL until the item is published. Unpacked zips
never auto-update; CWS installs do (Chrome checks Google's update
service). Do **not** set `update_url` in `manifest.json`.

Dashboard: https://chrome.google.com/webstore/devconsole  
Publisher account: one-time **$5** fee + **2-step verification** required.

After publish, set `EXTENSION_STORE_URL` in
`apps/web/src/lib/extension-release.ts` so `/api/extension` can point
users at the listing.

---

## Package to upload

```bash
pnpm --filter @aidr/web pack-cws
# → apps/extension/dist/aidr-cws.zip
```

| | |
|---|---|
| File | `apps/extension/dist/aidr-cws.zip` |
| Version | `0.1.15` (must match `manifest.json` + `package.json`) |
| Layout | `manifest.json` at zip **root** (not under `aidr/`) |
| Store flavor | no `optional_host_permissions`, `connect-src` = `aidr.today` only |
| Do **not** upload | `https://aidr.today/aidr.zip` / `public/aidr.zip` (nested Load unpacked zip) |

Visibility for first submit: **Unlisted** (test install URL) or **Public**.

---

## Store listing — copy/paste

### Name

```
aidr
```

### Short description (≤132 chars) — English

```
AI;DR digest from aidr.today on every new tab. No account.
```

### Short description — Vietnamese

```
Bản tin AI;DR từ aidr.today mỗi khi mở thẻ mới. Không cần tài khoản.
```

### Detailed description — English

```
aidr replaces Chrome's new tab with today's AI;DR and ranked AI stories from aidr.today.

Open a new tab and see the same public digest as the website: numbered AI;DR summaries, category chips, trending topics, and ranked story rows. No account. No ads. No browsing-history access.

What you get
• Today's AI;DR digest from aidr.today
• Day-grouped top stories with tags and thumbnails
• Light / dark / system theme, English or Vietnamese
• Offline paint from a short local cache of the last digest

How it works
The extension fetches public JSON from https://aidr.today (GET /api/public and /api/feed) and paints it in the new tab. Settings stay in chrome.storage on your device.

Privacy: https://aidr.today/privacy
Homepage: https://aidr.today/extension
Support: https://github.com/duyet/aidr/issues
```

### Detailed description — Vietnamese

```
aidr thay tab mới của Chrome bằng bản tin AI;DR hôm nay và tin AI được xếp hạng từ aidr.today.

Mở thẻ mới để xem cùng bản tin công khai như trên website: tóm tắt AI;DR có đánh số, chip chuyên mục, chủ đề đang nổi, và danh sách tin kèm điểm/bình luận. Không tài khoản. Không quảng cáo. Không truy cập lịch sử duyệt web.

Bạn nhận được
• Bản tin AI;DR hôm nay từ aidr.today
• Tin nổi bật theo ngày kèm thẻ và ảnh thu nhỏ
• Giao diện sáng / tối / theo hệ thống, tiếng Anh hoặc tiếng Việt
• Hiển thị offline từ bộ nhớ đệm ngắn của bản tin gần nhất

Cách hoạt động
Tiện ích tải JSON công khai từ https://aidr.today (GET /api/public và /api/feed) rồi vẽ lên tab mới. Cài đặt lưu trong chrome.storage trên máy bạn.

Quyền riêng tư: https://aidr.today/privacy
Trang chủ: https://aidr.today/extension
Hỗ trợ: https://github.com/duyet/aidr/issues
```

### Category

**News**

### Language

Primary: **English**  
Also: **Vietnamese** (`_locales/en` + `_locales/vi`)

### Homepage URL

```
https://aidr.today/extension
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

Data handling note for reviewers: settings + digest cache stay in `chrome.storage` on-device. Network calls go only to `https://aidr.today` over HTTPS.

---

## Listing assets (dashboard only — not in the zip)

See [`store/README.md`](./store/README.md). Capture from a real Load unpacked new tab. Do **not** invent screenshots with an image model.

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 | Ready — `icons/icon128.png` (also in package) |
| Screenshot(s) | **1280×800** (1–5, square corners, full bleed) | **You must capture** → drop in `store/` |
| Small promo tile | **440×280** | **You must create/capture** → drop in `store/` |
| Marquee (optional) | 1400×560 | Optional |

Suggested screenshot frames:
1. New tab with AI;DR + story list (light theme)
2. Same view, dark theme
3. Settings panel open (theme / language / sections)

---

## Account & publish checklist

1. [ ] Chrome Web Store developer account ($5) + 2SV enabled
2. [ ] Capture ≥1 screenshot 1280×800 + small tile 440×280 into `apps/extension/store/`
3. [ ] `pnpm --filter @aidr/web pack-cws` → upload `apps/extension/dist/aidr-cws.zip`
4. [ ] Paste listing fields above (EN; add VI locale in dashboard if offered)
5. [ ] Paste single purpose + permission justifications
6. [ ] Privacy practices + policy URL
7. [ ] Submit for review (Unlisted first is safer)
8. [ ] After live: set `EXTENSION_STORE_URL` and redeploy web

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
