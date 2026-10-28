import type { Release } from "../../lib/releases/types";

export const release: Release = {
  version: "0.1.18",
  date: "2026-10-28",
  from: "2026-10-27",
  to: "2026-10-28",
  compare: { base: "web-v0.1.17", head: "web-v0.1.18" },
  title: {
    en: "Duplicate stories merge again",
    vi: "Tin trùng lại được gom chung",
  },
  intro: {
    en: "Since Oct 26, copies of the same story could appear as separate items. The first model that groups stories had started to answer in plain sentences, and that answer stopped the chain. Now the next model takes over, and copies of one story are grouped again.",
    vi: "Từ 26/10, cùng một tin có thể xuất hiện thành nhiều mục riêng. Model đầu tiên lo việc gom tin bắt đầu trả lời bằng câu văn thường, và câu trả lời đó làm dừng cả chuỗi. Giờ model kế tiếp sẽ làm thay, nên các bản trùng của một tin lại được gom chung.",
  },
  stats: [
    { value: "1", label: { en: "fix", vi: "bản sửa lỗi" } },
    {
      value: "0/33",
      label: {
        en: "grouping calls that worked on Oct 27",
        vi: "lần gom tin thành công ngày 27/10",
      },
    },
    {
      value: "4/4",
      label: {
        en: "grouping runs that worked after the fix",
        vi: "lượt gom tin thành công sau khi sửa",
      },
    },
  ],
  cover: {
    src: "/releases/v0.1.18/cover.webp",
    width: 1440,
    height: 900,
    alt: {
      en: "The aidr.today homepage for Wednesday, Oct 28, 2026, with the yellow AI;DR digest of eight numbered stories above the day's ranked list.",
      vi: "Trang chủ aidr.today ngày thứ Tư 28/10/2026. Khung AI;DR màu vàng có tám tin đánh số, nằm trên danh sách tin xếp hạng trong ngày.",
    },
  },
  highlights: [
    {
      label: {
        en: "Copies of one story merge again",
        vi: "Tin trùng lại được gom chung",
      },
      text: {
        en: "AI;DR asks a chain of models to group reports about the same story. Since Oct 26 the first one often answered in prose instead of the format we asked for, and that answer ended the chain, so on Oct 27 no story was grouped. Now an answer in the wrong format goes to the next model. After the fix went live, all 4 grouping runs we checked worked.",
        vi: "AI;DR nhờ một chuỗi model gom các bài viết về cùng một tin. Từ 26/10, model đầu tiên hay trả lời bằng văn xuôi thay vì đúng định dạng yêu cầu, và câu trả lời đó làm dừng cả chuỗi, nên ngày 27/10 không tin nào được gom. Giờ câu trả lời sai định dạng sẽ được chuyển cho model kế tiếp. Sau khi bản sửa chạy thật, cả 4 lượt gom tin được kiểm tra đều thành công.",
      },
      href: "/release#algorithm",
    },
    {
      label: {
        en: "The same rule in four more steps",
        vi: "Áp dụng thêm cho bốn bước khác",
      },
      text: {
        en: "Scoring, translation repair, post captions and the email summary use the same chain, so a reply in the wrong format there also goes to the next model.",
        vi: "Chấm điểm, sửa bản dịch, viết caption và tóm tắt email cũng dùng chuỗi model này, nên ở đó câu trả lời sai định dạng cũng được chuyển cho model kế tiếp.",
      },
      href: "/release#algorithm",
    },
  ],
  changes: [
    {
      kind: "fix",
      scope: "ingest",
      text: {
        en: "When a model answers in the wrong format, the next model in the chain gets the job, so duplicate stories are grouped again.",
        vi: "Khi một model trả lời sai định dạng, model kế tiếp trong chuỗi sẽ nhận việc, nên tin trùng lại được gom chung.",
      },
      commit: "4d2c43a",
      pr: 1081,
    },
  ],
};
