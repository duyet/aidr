import json, os, time, urllib.request
payload = json.load(open(".github/workflows/en-digest-payload.json"))
token = os.environ["TELEGRAM_BOT_TOKEN"]
req = urllib.request.Request(
    f"https://api.telegram.org/bot{token}/sendMessage",
    data=json.dumps(payload["body"]).encode(),
    headers={"content-type": "application/json"},
)
with urllib.request.urlopen(req, timeout=30) as res:
    sent = json.load(res)
if not sent.get("ok"):
    raise SystemExit(sent.get("description"))
message_id = str((sent.get("result") or {}).get("message_id") or "")
safe = "".join(ch for ch in message_id if ch.isdigit())
date = payload["date"]
key = f"digest:{date}"
posted = int(time.time() * 1000)
sql = (
    "INSERT INTO notifications (channel, item_id, target, status, attempts, message_id, last_error, posted_at) "
    f"VALUES ('telegram-en', '{key}', '-1004436446325', 'sent', 1, '{safe}', NULL, {posted}) "
    "ON CONFLICT(channel, item_id) DO UPDATE SET status = excluded.status, "
    "attempts = notifications.attempts + 1, message_id = excluded.message_id, "
    "last_error = excluded.last_error, posted_at = excluded.posted_at"
)
account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
db = "0c8f3efe-0427-4268-8d9f-bb1a4bcbe427"
d1 = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query",
    data=json.dumps({"sql": sql}).encode(),
    headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}", "content-type": "application/json"},
)
with urllib.request.urlopen(d1, timeout=30) as res:
    stored = json.load(res)
if not stored.get("success"):
    raise SystemExit(f"d1 {stored.get('errors')}")
print(json.dumps({"ok": True, "date": date, "message_id": safe, "chat_id": -1004436446325}))
