#!/usr/bin/env python3
"""Print {title, desc, tags} JSON for one YouTube cut.

  yt-meta.py --release videos/releases/<v>/youtube.md --lang en|vi --kind long|short
  yt-meta.py --daily   videos/daily-news/editions/<date>/posts.md --lang en|vi --kind long|short

kind long = the 16:9 video; short = the 9:16 Short (for a release: title and
caption from the "Vertical" section, the release link lines kept, #Shorts added).
"""
import argparse
import json
import re
import sys


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
    links = DAILY_LINKS[lang]
    if kind == "long":
        head, _, hashtags = desc.rpartition("\n\n")
        desc = head + "\n" + links + "\n\n" + hashtags
    else:
        m = re.search(r"^(.*https://\S+)\s+(#.*)$", desc, re.S)
        desc = m.group(1) + "\n" + links + "\n\n" + m.group(2)
    return {"title": title, "desc": desc, "tags": tags}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--release", metavar="youtube.md")
    src.add_argument("--daily", metavar="posts.md")
    ap.add_argument("--lang", choices=["en", "vi"], required=True)
    ap.add_argument("--kind", choices=["long", "short"], required=True)
    a = ap.parse_args()
    try:
        m = release(a.release, a.lang, a.kind) if a.release else daily(a.daily, a.lang, a.kind)
    except (AttributeError, IndexError, TypeError) as e:
        sys.exit("yt-meta: cannot parse %s (%s: %s)" % (a.release or a.daily, type(e).__name__, e))
    if not (m["title"] and m["desc"] and m["tags"]):
        sys.exit("yt-meta: empty title, description or tags")
    print(json.dumps(m, ensure_ascii=False))


if __name__ == "__main__":
    main()
