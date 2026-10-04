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
| Version | `0.1.20` (must match `manifest.json` + `package.json` after the release PR) |
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
• Today's AI;DR digest from aidr.today, opened on that day's date
• Day-grouped top stories with tags, thumbnails, and reader votes
• Light / dark / system theme, English or Vietnamese
• Intro video, loaded only after you press play
• Offline paint from a short local cache of the last digest

How it works
The extension fetches public JSON from https://aidr.today (GET /api/public and /api/feed) and paints it in the new tab. Settings stay in chrome.storage on your device.

Privacy: https://aidr.today/privacy
Homepage: https://aidr.today/subscribe
Support: https://github.com/duyet/aidr/issues
```

### Detailed description — Vietnamese

```
aidr thay tab mới của Chrome bằng bản tin AI;DR hôm nay và tin AI được xếp hạng từ aidr.today.

Mở thẻ mới để xem cùng bản tin công khai như trên website: tóm tắt AI;DR có đánh số, chip chuyên mục, chủ đề đang nổi, và danh sách tin kèm điểm/bình luận. Không tài khoản. Không quảng cáo. Không truy cập lịch sử duyệt web.

Bạn nhận được
• Bản tin AI;DR hôm nay từ aidr.today, mở đầu bằng ngày của bản tin
• Tin nổi bật theo ngày kèm thẻ, ảnh thu nhỏ, và số phiếu bạn đọc
• Giao diện sáng / tối / theo hệ thống, tiếng Anh hoặc tiếng Việt
• Video giới thiệu, chỉ tải sau khi bạn bấm xem
• Hiển thị offline từ bộ nhớ đệm ngắn của bản tin gần nhất

Cách hoạt động
Tiện ích tải JSON công khai từ https://aidr.today (GET /api/public và /api/feed) rồi vẽ lên tab mới. Cài đặt lưu trong chrome.storage trên máy bạn.

Quyền riêng tư: https://aidr.today/privacy
Trang chủ: https://aidr.today/subscribe
Hỗ trợ: https://github.com/duyet/aidr/issues
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

See [`store/README.md`](./store/README.md). Capture from a real Load unpacked new tab. Do **not** invent screenshots with an image model.

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 | Ready — `icons/icon128.png` (also in package) |
| Screenshot, light | **1280×800** | Ready — `store/screenshot-light-1280x800.png` |
| Screenshot, dark | **1280×800** | Ready — `store/screenshot-dark-1280x800.png` |
| Small promo tile | **440×280** | Ready — `store/promo-440x280.png` (scaled from the light capture) |
| Marquee (optional) | 1400×560 | Skip |

Both screenshots are headless Chrome frames of the unpacked new tab with the live 2026-10-04 digest. The promo is that light frame scaled to the store tile. Do not replace them with generated images. Settings panel is not included.

---

## Account & publish checklist

1. [x] Chrome Web Store item already published (account + 2SV already done)
2. [x] Screenshots 1280×800 (light + dark) and promo 440×280 in `apps/extension/store/`
3. [ ] After `aidr-v0.1.20` exists: `pnpm --filter @aidr/web pack-cws` → upload `apps/extension/dist/aidr-cws.zip` on the existing item (do not upload `aidr.zip`)
4. [ ] Paste listing fields above if the dashboard copy is still the older text (EN; add VI locale if offered)
5. [ ] Confirm single purpose + permission justifications still match
6. [ ] Confirm privacy practices. The new sentence is the intro video on `youtube-nocookie.com`, only after play
7. [ ] Submit the update for review on the existing public item
8. [x] `EXTENSION_STORE_URL` already points at the listing. Do not clear it

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
