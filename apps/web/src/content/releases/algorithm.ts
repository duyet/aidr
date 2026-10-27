/**
 * How AI;DR picks, ranks and writes stories: ranking, scoring, clustering,
 * prompts and the model chains in `apps/web/wrangler.toml`. Listed on
 * /release under "How stories are picked". Newest first.
 *
 * Any PR that changes ranking, scoring, clustering, prompts or a model chain
 * adds an entry here in English and Vietnamese. `algorithm.test.ts` fails when
 * a model id in a wrangler.toml chain is named in no entry.
 */
import type { EarlierEntry } from "./earlier";

export const ALGORITHM_ENTRIES: EarlierEntry[] = [
  {
    date: "2026-10-28",
    text: {
      en: "When a model answers in plain sentences instead of the format we asked for, the next model in the chain now gets the job. Before, that answer ended the chain. Since Oct 26 the first clustering model often replied in prose, so on Oct 27 all 33 clustering calls found no groups and copies of the same story published separately. The same now holds for scoring, translation repair, captions and the email summary.",
      vi: "Khi một model trả lời bằng câu văn thường thay vì đúng định dạng yêu cầu, model tiếp theo trong chuỗi giờ sẽ nhận việc. Trước đây, câu trả lời đó làm dừng cả chuỗi. Từ 26/10, model gom tin đầu tiên hay trả lời bằng văn xuôi, nên ngày 27/10 cả 33 lần gom tin đều không tìm ra nhóm nào và các bản tin trùng nhau được đăng riêng lẻ. Cách xử lý này giờ áp dụng cả cho chấm điểm, sửa bản dịch, caption và bản tóm tắt email.",
    },
  },
  {
    date: "2026-10-26",
    text: {
      en: "Each run now checks the 10 highest-ranked stories of the last 48 hours: whether the article is really new or an old one shared again, whether a newer report corrects or replaces it, and how many separate outlets cover it. For now it only records the result and does not change the order. On 59 recent top stories it found 2 old articles shared again, one of them a model launch from 17 days earlier, and 2 stories with no new coverage after three days.",
      vi: "Mỗi lượt chạy giờ kiểm tra 10 tin xếp hạng cao nhất trong 48 giờ qua: bài viết có thật sự mới hay là bài cũ được chia sẻ lại, có tin mới hơn đính chính hay thay thế nó không, và bao nhiêu trang tin khác nhau cùng đưa tin. Hiện bước này chỉ ghi lại kết quả, chưa thay đổi thứ tự tin. Thử trên 59 tin hàng đầu gần đây, nó tìm ra 2 bài cũ được chia sẻ lại, trong đó có tin ra mắt một model từ 17 ngày trước, và 2 tin không còn ai đưa tiếp sau ba ngày.",
    },
  },
  {
    date: "2026-10-26",
    text: {
      en: "Models in use. Scoring, clustering and captions: google/gemma-latest, then z-ai/glm-latest, @preset/aidr and anthropic/claude-sonnet-5-5, with typesafe/jev scoring first. Vietnamese translation: poolside/laguna-s-2.1, then nvidia/nemotron-3.5-bolt-e4b. English translation: poolside/laguna-s-2.1, then google/gemma-latest. The daily TL;DR: openai/gpt-5.6-luna, then poolside/laguna-s-2.1. Review: z-ai/glm-4.6.",
      vi: "Các model đang dùng. Chấm điểm, gom tin và viết caption: google/gemma-latest, rồi tới z-ai/glm-latest, @preset/aidr và anthropic/claude-sonnet-5-5; typesafe/jev chấm điểm trước. Dịch sang tiếng Việt: poolside/laguna-s-2.1, rồi nvidia/nemotron-3.5-bolt-e4b. Dịch sang tiếng Anh: poolside/laguna-s-2.1, rồi google/gemma-latest. TL;DR mỗi ngày: openai/gpt-5.6-luna, rồi poolside/laguna-s-2.1. Soát lại: z-ai/glm-4.6.",
    },
  },
  {
    date: "2026-10-25",
    text: {
      en: "Vietnamese translation now falls back to nvidia/nemotron-3.5-bolt-e4b when poolside/laguna-s-2.1 fails. The old fallback, google/gemma-latest, translated 0 of 22 batches. On 36 real stories, Nemotron answered 7 of 12 batches with a median of 11.5 s against Laguna's 31 s, and judges preferred its Vietnamese on the 21 stories both models translated. Laguna stays first because it answered all 12.",
      vi: "Khi poolside/laguna-s-2.1 lỗi, bản dịch tiếng Việt giờ chuyển sang nvidia/nemotron-3.5-bolt-e4b. Model dự phòng cũ, google/gemma-latest, không dịch được lô nào trong 22 lô. Thử trên 36 tin thật, Nemotron trả lời 7 trên 12 lô, trung vị 11,5 giây, còn Laguna mất 31 giây. Với 21 tin cả hai cùng dịch, giám khảo chọn bản tiếng Việt của Nemotron. Laguna vẫn đứng đầu vì trả lời đủ cả 12 lô.",
    },
  },
  {
    date: "2026-10-24",
    text: {
      en: "Post captions get 60 seconds instead of 30, and no model gets more than 20. Before, when the first model hung for 15 s, each fallback had 5 s, and a good fallback caption takes 5 to 10 s. A caption that still fails never holds up the post.",
      vi: "Caption của bài đăng giờ có 60 giây thay vì 30, và mỗi model tối đa 20 giây. Trước đây, khi model đầu treo 15 giây, mỗi model dự phòng chỉ còn 5 giây, trong khi một caption dự phòng tốt cần 5 đến 10 giây. Caption có lỗi thì bài vẫn đăng như thường.",
    },
  },
  {
    date: "2026-10-24",
    text: {
      en: 'When GitHub refuses a release feed because the hourly quota ran out, the source alert now says "rate limited" instead of "access refused".',
      vi: 'Khi GitHub từ chối feed bản phát hành vì đã hết hạn mức theo giờ, cảnh báo nguồn tin giờ ghi "rate limited" thay vì "access refused".',
    },
  },
  {
    date: "2026-10-21",
    text: {
      en: "Stories stop disappearing into unrelated ones. When the cluster model groups stories, each one now needs its own evidence to join, so one shared item can no longer pull others in. Between Oct 15 and 19 this had hidden 5 real stories. A story under the relevance bar is also never picked as the one a cluster shows.",
      vi: "Tin thật không còn bị gộp mất vào tin không liên quan. Khi model gom các tin cùng sự kiện, mỗi tin giờ phải có bằng chứng riêng mới được vào nhóm, nên một tin chung không còn kéo theo tin khác. Từ 15 đến 19/10, lỗi này đã giấu mất 5 tin thật. Tin dưới ngưỡng liên quan cũng không bao giờ được chọn làm tin đại diện của nhóm.",
    },
  },
  {
    date: "2026-10-19",
    text: {
      en: 'Vietnamese keeps "model family" in English, and the draft check flags four literal translations that made no sense, such as "gia đình mô hình" for a model family.',
      vi: 'Bản tiếng Việt giữ nguyên "model family" bằng tiếng Anh. Bước soát bản nháp cũng bắt bốn kiểu dịch từng chữ vô nghĩa, như dịch model family thành "gia đình mô hình".',
    },
  },
  {
    date: "2026-10-16",
    text: {
      en: "Ranking weighs the kind of story. Models and Regulation count 1.2 times, Open Source and Agents 1.15, Research, Chips and Tools 1.1, Frameworks 1.05, Industry 0.9 and Funding 0.85. Model releases and launches now rank above market and business pieces.",
      vi: "Thứ hạng giờ tính cả loại tin. Models và Regulation được nhân 1,2; Open Source và Agents 1,15; Research, Chips và Tools 1,1; Frameworks 1,05; Industry 0,9 và Funding 0,85. Tin ra mắt model và sản phẩm mới giờ xếp trên tin thị trường và kinh doanh.",
    },
  },
  {
    date: "2026-10-16",
    text: {
      en: "anyrouter/auto left the scoring and clustering chain after it answered 0 of 97 calls in a week. When the first model stalls, Claude Sonnet now has time to answer, so the same event under two headlines still merges into one story.",
      vi: "anyrouter/auto bị bỏ khỏi chuỗi chấm điểm và gom tin vì trong một tuần không trả lời được lần nào trong 97 lần gọi. Khi model đầu bị treo, Claude Sonnet giờ có đủ thời gian trả lời, nên cùng một sự kiện dưới hai tiêu đề vẫn được gộp thành một tin.",
    },
  },
  {
    date: "2026-10-16",
    text: {
      en: "Hacker News stories need 20 points to come in.",
      vi: "Tin từ Hacker News cần đạt 20 điểm mới được lấy vào.",
    },
  },
];
