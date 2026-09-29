import html
import json
import os
import time
import urllib.error
import urllib.request

DB = "0c8f3efe-0427-4268-8d9f-bb1a4bcbe427"
ACCOUNT = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF = os.environ["CLOUDFLARE_API_TOKEN"]
TG = os.environ["TELEGRAM_BOT_TOKEN"]


def d1(sql: str):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DB}/query",
        data=json.dumps({"sql": sql}).encode(),
        headers={
            "Authorization": f"Bearer {CF}",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        payload = json.load(res)
    if not payload.get("success"):
        raise SystemExit(f"d1 error: {payload.get('errors')}")
    return payload["result"][0]["results"]


def esc(value: str) -> str:
    return html.escape(value, quote=True)


with urllib.request.urlopen("https://aidr.today/api/public?lang=en", timeout=30) as res:
    public = json.load(res)
tldr = public["tldr"]
date = tldr["date"]
key = f"digest:{date}"
existing = d1(
    "SELECT status, message_id FROM notifications "
    f"WHERE channel = 'telegram-en' AND item_id = '{key}'"
)
if existing and existing[0]["status"] == "sent":
    print(
        json.dumps(
            {
                "skipped": True,
                "message_id": existing[0]["message_id"],
                "date": date,
            }
        )
    )
    raise SystemExit(0)

lines = [f"<b>🗞 AI news today — {esc(date)}</b>"]
for bullet in (tldr.get("bullets_en") or [])[:8]:
    text = esc(str(bullet.get("text") or ""))
    if not text:
        continue
    ids = bullet.get("item_ids") or []
    item = ids[0] if ids else bullet.get("item_id")
    if item:
        url = f"https://aidr.today/{item[:8]}?lang=en&utm_source=telegram"
        lines.append(f'•  {text} <a href="{esc(url)}">→</a>')
    else:
        lines.append(f"•  {text}")

body = {
    "chat_id": "@aidr_today",
    "text": "\n\n".join(lines),
    "parse_mode": "HTML",
    "link_preview_options": {"is_disabled": True},
    "reply_markup": {
        "inline_keyboard": [
            [
                {
                    "text": "Read the full digest on aidr.today →",
                    "url": "https://aidr.today/?lang=en&utm_source=telegram",
                }
            ]
        ]
    },
}
req = urllib.request.Request(
    f"https://api.telegram.org/bot{TG}/sendMessage",
    data=json.dumps(body).encode(),
    headers={"content-type": "application/json"},
)
try:
    with urllib.request.urlopen(req, timeout=30) as res:
        sent = json.load(res)
except urllib.error.HTTPError as error:
    detail = error.read().decode()[:300]
    raise SystemExit(f"telegram HTTP {error.code}: {detail}")
if not sent.get("ok"):
    raise SystemExit(f"telegram not ok: {sent.get('description')}")
message_id = str((sent.get("result") or {}).get("message_id") or "")
safe_id = "".join(ch for ch in message_id if ch.isdigit())
posted_at = int(time.time() * 1000)
d1(
    "INSERT INTO notifications "
    "(channel, item_id, target, status, attempts, message_id, last_error, posted_at) "
    f"VALUES ('telegram-en', '{key}', '@aidr_today', 'sent', 1, '{safe_id}', NULL, {posted_at}) "
    "ON CONFLICT(channel, item_id) DO UPDATE SET "
    "status = excluded.status, attempts = notifications.attempts + 1, "
    "message_id = excluded.message_id, last_error = excluded.last_error, "
    "posted_at = excluded.posted_at"
)
print(
    json.dumps(
        {
            "ok": True,
            "chat": "@aidr_today",
            "date": date,
            "message_id": safe_id,
            "bullets": len(lines) - 1,
        }
    )
)
