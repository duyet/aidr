# Launch post

## English

**AI;DR, what's new in AI today, ranked**

AI news is spread across Hacker News, Hugging Face, lab blogs, GitHub releases, and a long tail of RSS feeds. The same model release shows up five times with five headlines. I built AI;DR to read all of it and hand back one short list.

Every 30 minutes, a pipeline fetches new stories from its sources, removes duplicates, and merges stories that cover the same event. JEV rates each story for AI relevance and quality, and an LLM takes over when JEV is unavailable. Then plain code ranks everything by importance and quality. No person picks the order, and the ranking rules are public in `ALGORITHM.md` on GitHub.

The top stories of the last 24 hours become the day's edition, up to 16 short bullets written once in English and once in Vietnamese. At most 5 stories from one source family, 6 when one is top-tier, so a single busy source does not push out the rest. Every bullet links to the original post.

You can read the edition where you already are.

- **Web** at https://aidr.today
- **Email** from 07:00 in your timezone, with 3, 5, or 10 stories, daily or weekly. Sign up at https://aidr.today/subscribe
- **Telegram** at @aidr_today in English and @aihomnay in Vietnamese
- **Facebook**, where the English Page posts each edition
- **RSS** at https://aidr.today/feed.xml
- **Chrome**, as a new tab page with the ranked list
- **AI agents**, through a public MCP server documented at https://aidr.today/mcp. Read tools such as `latest_ai_news`, `search_news`, and `get_ai_digest` need no key.

A machine picks the stories, so it gets some wrong. If you see a bad line, sign in and suggest a better one, or email submit@aidr.today. The code is open source.

Start at https://aidr.today

## Tiếng Việt

**AI;DR. Hôm nay AI có gì mới?**

Tin AI nằm rải rác trên Hacker News, Hugging Face, blog của các lab và rất nhiều nguồn RSS. AI;DR đọc hết, gộp tin trùng và xếp hạng mỗi 30 phút. Không ai chọn thứ tự bằng tay. Hệ thống chấm điểm rồi xếp hạng theo quy tắc công khai trên GitHub.

Mỗi ngày có một bản tin tối đa 16 dòng, viết riêng bằng tiếng Việt và tiếng Anh. Mỗi dòng dẫn về bài gốc.

- Web: https://aidr.today
- Telegram tiếng Việt: @aihomnay
- Email: https://aidr.today/subscribe
- Tab mới Chrome, RSS, và máy chủ MCP cho AI agent

Thấy sai, bạn có thể đề xuất câu tốt hơn hoặc gửi email tới submit@aidr.today.
