#!/usr/bin/env python3
"""Check the App Store pack in this folder. Rerun it after every edit.

  python3 apps/ios/AppStore/check-metadata.py            # limits and format
  python3 apps/ios/AppStore/check-metadata.py --strict   # also fail on operator placeholders
  python3 apps/ios/AppStore/check-metadata.py --online   # also GET every URL (needs network)

Standard library only. Exit 0 means every hard check passed.
Limits come from Apple: name and subtitle 30, promotional text 170, description
4000, What's New 4000 (characters); keywords 100 bytes; review notes 4000 bytes.
Sources are in sources.md.
"""
import pathlib
import plistlib
import re
import sys
import unicodedata
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
STRICT = "--strict" in sys.argv
ONLINE = "--online" in sys.argv

LIMITS = {"Name": 30, "Subtitle": 30, "Promotional text": 170, "Description": 4000, "What's New": 4000}
KEYWORD_BYTES = 100
NOTES_BYTES = 4000
SHARED = ["Primary category", "Secondary category", "Privacy Policy URL", "Copyright"]
LOCAL = ["Name", "Subtitle", "Promotional text", "Description", "Keywords", "What's New", "Support URL", "Marketing URL"]
REQUIRED = {"metadata.en.md": LOCAL + SHARED, "metadata.vi.md": LOCAL}
CATEGORIES = {"News", "None"}

# Words that sound like marketing, in English and Vietnamese.
BANNED = [
    "seamless", "seamlessly", "revolutionary", "comprehensive", "elaborate", "extensive",
    "cutting-edge", "powerful", "robust", "leverage", "unlock", "effortless", "game-changing",
    "world-class", "state-of-the-art", "next-generation", "supercharge", "delve",
    "đột phá", "cách mạng", "toàn diện", "mạnh mẽ", "hoàn hảo", "tuyệt vời", "vượt trội",
]
# Names that must not appear in keywords (guideline 2.3.7) or in metadata text.
TRADEMARKS = [
    "openai", "chatgpt", "gpt", "claude", "anthropic", "gemini", "google", "apple", "iphone",
    "microsoft", "copilot", "meta", "llama", "mistral", "deepseek", "nvidia", "grok", "perplexity",
]
# Apple's own product names are fine in the description, never in keywords.
ALLOWED_IN_TEXT = {"apple", "iphone"}

# Required-reason API categories and the reason codes Apple lists (see sources.md).
REASONS = {
    "NSPrivacyAccessedAPICategoryUserDefaults": {"CA92.1", "1C8F.1", "C56D.1", "AC6B.1"},
    "NSPrivacyAccessedAPICategoryFileTimestamp": {"DDA9.1", "C617.1", "3B52.1", "0A2A.1"},
    "NSPrivacyAccessedAPICategorySystemBootTime": {"35F9.1"},
    "NSPrivacyAccessedAPICategoryDiskSpace": {"85F4.1", "E174.1", "7D9E.1"},
    "NSPrivacyAccessedAPICategoryActiveKeyboards": {"3EC4.1", "54BD.1"},
}
OLD_BUNDLE_ID = "today." + "aidr.app"  # split so this file does not trip its own check
BUNDLE_ID = "oneni.aidr.app"

errors, warnings, rows = [], [], []


def err(msg):
    errors.append(msg)


def fold(text):
    text = unicodedata.normalize("NFD", text.casefold()).replace("đ", "d")
    return "".join(c for c in text if not unicodedata.combining(c))


def sections(path):
    """Map each '## Heading' to its body. Fail on a repeated heading."""
    out, name, buf = {}, None, []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^## (.+?)\s*$", line)
        if m:
            if name is not None:
                out[name] = "\n".join(buf).strip()
            name, buf = m.group(1), []
            if name in out:
                err(f"{path.name}: heading '{name}' appears twice")
        elif name is not None:
            buf.append(line)
    if name is not None:
        out[name] = "\n".join(buf).strip()
    return out


def fence(body, lang):
    m = re.search(r"```" + lang + r"\n(.*?)\n```", body, re.S)
    return m.group(1) if m else None


def text_checks(label, text):
    if text != unicodedata.normalize("NFC", text):
        err(f"{label}: text is not NFC normalized (decomposed Vietnamese letters)")
    low = text.casefold()
    for w in BANNED:
        if re.search(r"(?<!\w)" + re.escape(w) + r"(?!\w)", low):
            err(f"{label}: banned marketing word '{w}'")
    if OLD_BUNDLE_ID in text:
        err(f"{label}: old bundle id; use {BUNDLE_ID}")
    if "<<operator:" in text:
        (err if STRICT else warnings.append)(f"{label}: operator placeholder left in place")


def check_metadata(fname):
    path = HERE / fname
    if not path.exists():
        return err(f"{fname}: missing")
    sec = sections(path)
    want = REQUIRED[fname]
    for h in want:
        if h not in sec:
            err(f"{fname}: missing heading '{h}'")
        elif not sec[h]:
            err(f"{fname}: '{h}' is empty")
    for h in sec:
        if h not in want:
            err(f"{fname}: unknown heading '{h}'")
    for h, body in sec.items():
        text_checks(f"{fname} {h}", body)
        low = fold(body)
        if h != "Keywords":
            for t in TRADEMARKS:
                if t not in ALLOWED_IN_TEXT and re.search(r"\b" + t + r"\b", low):
                    err(f"{fname} {h}: names a third-party brand '{t}'")
    for h, limit in LIMITS.items():
        if h in sec:
            n = len(sec[h])
            rows.append((fname, h, f"{n} chars", f"max {limit}"))
            if n > limit:
                err(f"{fname}: {h} is {n} characters, limit {limit}")
    if "Keywords" in sec:
        kw = sec["Keywords"]
        nbytes = len(kw.encode("utf-8"))
        rows.append((fname, "Keywords", f"{nbytes} bytes", f"max {KEYWORD_BYTES}"))
        if nbytes > KEYWORD_BYTES:
            err(f"{fname}: keywords are {nbytes} bytes, limit {KEYWORD_BYTES}")
        if re.search(r"\s", kw):
            err(f"{fname}: keywords contain whitespace; separate with commas only")
        words = [w for w in kw.split(",")]
        seen = set()
        title = set(re.findall(r"\w+", fold(sec.get("Name", "") + " " + sec.get("Subtitle", ""))))
        for w in words:
            f = fold(w)
            if len(w) <= 2:
                err(f"{fname}: keyword '{w}' must be longer than two characters")
            if f in seen:
                err(f"{fname}: duplicate keyword '{w}'")
            seen.add(f)
            if f in title:
                err(f"{fname}: keyword '{w}' repeats a word of the name or subtitle")
            if f == "app" or f in TRADEMARKS:
                err(f"{fname}: keyword '{w}' is not allowed (generic or a third-party brand)")
    if "Primary category" in sec and sec["Primary category"] != "News":
        err(f"{fname}: primary category must be News")
    if "Secondary category" in sec and sec["Secondary category"] not in CATEGORIES:
        err(f"{fname}: secondary category must be one of {sorted(CATEGORIES)}")
    for h in ("Support URL", "Marketing URL", "Privacy Policy URL"):
        if h in sec:
            if not re.fullmatch(r"https://[^\s]+", sec[h]):
                err(f"{fname}: {h} must be a full https URL")
            elif ONLINE:
                try:
                    code = urllib.request.urlopen(urllib.request.Request(sec[h], headers={"User-Agent": "aidr-appstore-check"}), timeout=15).status
                except Exception as e:  # noqa: BLE001
                    code = str(e)
                rows.append((fname, h, str(code), "expect 200"))
                if code != 200:
                    err(f"{fname}: {h} {sec[h]} returned {code}")


def check_review_notes():
    path = HERE / "review-notes.md"
    if not path.exists():
        return err("review-notes.md: missing")
    sec = sections(path)
    h = "App Review Information: Notes"
    block = fence(sec.get(h, ""), "text")
    if block is None:
        return err(f"review-notes.md: no ```text block under '## {h}'")
    n = len(block.encode("utf-8"))
    rows.append(("review-notes.md", "Notes block", f"{n} bytes", f"max {NOTES_BYTES}"))
    if n > NOTES_BYTES:
        err(f"review-notes.md: notes are {n} bytes, limit {NOTES_BYTES}")
    text_checks("review-notes.md notes", block)


def check_privacy():
    path = HERE / "privacy.md"
    if not path.exists():
        return err("privacy.md: missing")
    sec = sections(path)
    block = fence(sec.get("PrivacyInfo.xcprivacy", ""), "xml")
    if block is None:
        return err("privacy.md: no ```xml block under '## PrivacyInfo.xcprivacy'")
    try:
        plist = plistlib.loads(block.encode("utf-8"))
    except Exception as e:  # noqa: BLE001
        return err(f"privacy.md: manifest is not a valid plist: {e}")
    if plist.get("NSPrivacyTracking") is not False:
        err("privacy.md: NSPrivacyTracking must be false")
    if plist.get("NSPrivacyTrackingDomains") != []:
        err("privacy.md: NSPrivacyTrackingDomains must be empty")
    for key in ("NSPrivacyCollectedDataTypes", "NSPrivacyAccessedAPITypes"):
        if not isinstance(plist.get(key), list):
            err(f"privacy.md: {key} must be an array")
    for item in plist.get("NSPrivacyCollectedDataTypes", []):
        if item.get("NSPrivacyCollectedDataTypeTracking") is not False:
            err("privacy.md: a collected data type is marked as tracking")
    apis = plist.get("NSPrivacyAccessedAPITypes", [])
    cats = [a.get("NSPrivacyAccessedAPIType") for a in apis]
    rows.append(("privacy.md", "Manifest", f"{len(apis)} required-reason categories", ", ".join(c.rsplit("Category", 1)[-1] for c in cats)))
    if "NSPrivacyAccessedAPICategoryUserDefaults" not in cats:
        err("privacy.md: UserDefaults entry (CA92.1) is missing")
    for a in apis:
        cat = a.get("NSPrivacyAccessedAPIType")
        if cat not in REASONS:
            err(f"privacy.md: unknown API category {cat}")
            continue
        for r in a.get("NSPrivacyAccessedAPITypeReasons", []):
            if r not in REASONS[cat]:
                err(f"privacy.md: reason {r} is not listed for {cat}")
        if not a.get("NSPrivacyAccessedAPITypeReasons"):
            err(f"privacy.md: {cat} has no reason")


def check_all_docs():
    for p in sorted(HERE.glob("*.md")):
        if p.name == "sources.md" or p.name in REQUIRED:
            continue  # sources quotes old values on purpose; metadata is checked per section
        text_checks(p.name, p.read_text(encoding="utf-8"))


for f in REQUIRED:
    check_metadata(f)
check_review_notes()
check_privacy()
check_all_docs()

width = max((len(r[0]) + len(r[1]) for r in rows), default=0) + 3
for f, h, n, lim in rows:
    print(f"{f + ' ' + h:<{width}} {n:<28} {lim}")
for w in warnings:
    print("WARN", w)
for e in errors:
    print("FAIL", e)
print("OK" if not errors else f"{len(errors)} problem(s)")
sys.exit(1 if errors else 0)
