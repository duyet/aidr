#!/usr/bin/env python3
"""Print {title, desc, tags} JSON for one YouTube cut.

  yt-meta.py --release videos/releases/<v>/youtube.md --lang en|vi --kind long|short
  yt-meta.py --daily   videos/daily-news/editions/<date>/posts.md --lang en|vi --kind long|short
  yt-meta.py --json    videos/daily-news/editions/<date>/youtube.visub.json --lang vi --kind long

kind long = the 16:9 video; short = the 9:16 Short (for a release: title and
caption from the "Vertical" section, the release link lines kept, #Shorts added).
--json reads a finished {title, desc, tags} (the visub cut's Vietnamese metadata,
written by videos/daily-news/scripts/visub.mjs --youtube); the daily channel
links for --lang go in before its hashtags, as for --daily. Long only.
"""
import argparse
import json
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def release(path, lang, kind):
    t = open(path, encoding="utf-8").read()
    if lang == "en":
        sec = t.split("\n## English")[1].split("\n## Tiếng Việt")[0]
    else:
        sec = t.split("\n## Tiếng Việt")[1]

    def after(h):
        m = re.search(r"### " + re.escape(h) + r"\n\n(.*?)(?=\n### |\Z)", sec, re.S)
        return m.group(1).strip() if m else None

    def block(s):
        return re.search(r"```\n(.*?)\n```", s, re.S).group(1).strip()

    title = after("Title" if lang == "en" else "Tiêu đề")
    desc = block(after("Description" if lang == "en" else "Mô tả"))
    tags = after("Tags" if lang == "en" else "Thẻ")
    if kind == "short":
        v = after("Vertical (Shorts, TikTok, Reels)" if lang == "en" else "Video dọc (Shorts, TikTok, Reels)")
        blocks = re.findall(r"```\n(.*?)\n```", v, re.S)
        title = blocks[0].strip()
        cap = blocks[1].strip()
        links = "\n".join(l for l in desc.splitlines() if "http" in l)
        body, _, hashtags = cap.rpartition("\n\n")
        desc = body.strip() + "\n\n" + links + "\n\n" + hashtags.strip() + " #Shorts"
    return {"title": title, "desc": desc, "tags": tags}


DAILY_LINKS = {
    "en": "Chrome extension: https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg\n"
          "Telegram: https://t.me/aidr_today\nFacebook: https://www.facebook.com/aidr.today/",
    "vi": "Tiện ích Chrome: https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg\n"
          "Telegram: https://t.me/aihomnay\nFacebook: https://www.facebook.com/aidr.today/",
}


def daily(path, lang, kind):
    t = open(path, encoding="utf-8").read()
    sec = re.search(r"<!-- posts:%s -->(.*?)<!-- /posts:%s -->" % (lang, lang), t, re.S).group(1)

    def part(h):
        return re.search(r"## %s\n(.*?)(?=\n## |\Z)" % re.escape(h), sec, re.S).group(1)

    def field(p, name):
        m = re.search(r"\*\*%s\*\*[^\n]*\n\n(.*?)(?=\n\n\*\*|\Z)" % name, p, re.S)
        return m.group(1).strip()

    p = part("YouTube (16:9)" if kind == "long" else "YouTube Shorts (9:16)")
    title = field(p, "Title")
    desc = field(p, "Description")
    tags = re.search(r"\*\*Tags:\*\*\s*(.*)", part("YouTube (16:9)")).group(1).strip()
    return {"title": title, "desc": with_links(desc, lang, kind), "tags": tags}


def with_links(desc, lang, kind):
    links = DAILY_LINKS[lang]
    if kind == "long":
        head, _, hashtags = desc.rpartition("\n\n")
        return head + "\n" + links + "\n\n" + hashtags
    m = re.search(r"^(.*https://\S+)\s+(#.*)$", desc, re.S)
    return m.group(1) + "\n" + links + "\n\n" + m.group(2)


def given(path, lang, kind):
    if kind != "long":
        sys.exit("yt-meta: --json is a 16:9 (long) cut's metadata")
    m = json.load(open(path, encoding="utf-8"))
    return {"title": m["title"], "desc": with_links(m["desc"], lang, kind), "tags": m["tags"]}


SITE_LINK = re.compile(r"https://aidr\.today(?:/[^\s<>\"')\]]*)?")
CAMPAIGN_PREFIX = {"date": "digest-", "week": "weekly-", "release": "release-"}


def campaign_of(desc):
    m = re.search(r"https://aidr\.today/(date|week|release)/([\w.-]+)", desc)
    return CAMPAIGN_PREFIX[m.group(1)] + m.group(2) if m else "video"


def tag_site_links(desc, kind):
    campaign = campaign_of(desc)

    def tag(m):
        link, tail = re.match(r"(.*?)([.,;:!?]*)$", m.group(0)).groups()
        u = urlsplit(link)
        query = parse_qsl(u.query, keep_blank_values=True)
        if any(k.startswith("utm_") for k, _ in query):
            return m.group(0)
        query += [("utm_source", "youtube"), ("utm_medium", "video"),
                  ("utm_campaign", campaign), ("utm_content", kind)]
        return urlunsplit((u.scheme, u.netloc, u.path or "/", urlencode(query), u.fragment)) + tail

    return SITE_LINK.sub(tag, desc)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--release", metavar="youtube.md")
    src.add_argument("--daily", metavar="posts.md")
    src.add_argument("--json", metavar="youtube.visub.json")
    ap.add_argument("--lang", choices=["en", "vi"], required=True)
    ap.add_argument("--kind", choices=["long", "short"], required=True)
    a = ap.parse_args()
    try:
        if a.json:
            m = given(a.json, a.lang, a.kind)
        else:
            m = release(a.release, a.lang, a.kind) if a.release else daily(a.daily, a.lang, a.kind)
    except (AttributeError, IndexError, TypeError, KeyError, ValueError, OSError) as e:
        sys.exit("yt-meta: cannot parse %s (%s: %s)" % (a.release or a.daily or a.json, type(e).__name__, e))
    m["desc"] = tag_site_links(m["desc"], a.kind)
    if not (m["title"] and m["desc"] and m["tags"]):
        sys.exit("yt-meta: empty title, description or tags")
    print(json.dumps(m, ensure_ascii=False))


if __name__ == "__main__":
    main()
