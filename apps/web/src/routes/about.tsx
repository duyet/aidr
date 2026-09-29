import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import type { RootSearch } from "../lib/locale-routing";
import { pageHead } from "../lib/seo";
import { ANYROUTER_URL, GITHUB_ALGORITHM_URL, GITHUB_URL } from "../lib/site";

export const Route = createFileRoute("/about")({
  search: {
    middlewares: [stripSearchParams<RootSearch>(["lang", "locale"])],
  },
  head: ({ match }) =>
    pageHead({
      path: "/about",
      title: "About | AI News",
      route: headRouteInput(match),
    }),
  component: AboutPage,
});

interface FlowStep {
  n: string;
  en: string;
  vi: string;
  detailEn: string;
  detailVi: string;
}

/** One hourly pass: collect, process, judge, rank, then one edition out. */
const FLOW: FlowStep[] = [
  {
    n: "01",
    en: "Collect",
    vi: "Thu thập",
    detailEn: "Hourly pull of new AI stories.",
    detailVi: "Quét tin AI mới mỗi giờ.",
  },
  {
    n: "02",
    en: "Process",
    vi: "Xử lý",
    detailEn: "Read the article, drop duplicates, write Vietnamese.",
    detailVi: "Đọc bài, bỏ tin trùng, viết tiếng Việt.",
  },
  {
    n: "03",
    en: "Judge",
    vi: "Phán quyết",
    detailEn: "JEV checks intent. An LLM scores what belongs.",
    detailVi: "JEV xét ý đồ. LLM chấm tin có đáng lên không.",
  },
  {
    n: "04",
    en: "Rank",
    vi: "Xếp hạng",
    detailEn: "Importance times quality. Newer stories rise.",
    detailVi: "Tầm quan trọng nhân chất lượng. Tin mới hơn được ưu tiên.",
  },
  {
    n: "05",
    en: "Combine",
    vi: "Gộp bản",
    detailEn: "One TL;DR edition per language. No cross-fill.",
    detailVi: "Một bản AI;DR mỗi ngôn ngữ. Không mượn bản kia.",
  },
  {
    n: "06",
    en: "Distribute",
    vi: "Phát hành",
    detailEn: "The site, email at 07:00 local, Telegram at 08:00.",
    detailVi: "Trang web, email lúc 07:00 theo múi giờ, Telegram lúc 08:00.",
  },
];

function PipelineDiagram({ lang }: { lang: "en" | "vi" }) {
  return (
    <figure className="not-typeset mt-4">
      <svg
        viewBox="0 0 920 292"
        role="img"
        className="h-auto w-full text-foreground"
        aria-labelledby="pipeline-diagram-title"
      >
        <title id="pipeline-diagram-title">
          {lang === "vi"
            ? "Thu thập, xử lý, phán quyết, xếp hạng, gộp bản, phát hành"
            : "Collect, process, judge, rank, combine, distribute"}
        </title>
        <defs>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.2 L 8 5 L 0 8.8 Z" className="fill-accent" />
          </marker>
        </defs>
        {FLOW.map((step, index) => {
          const col = index % 3;
          const row = Math.floor(index / 3);
          const x = 16 + col * 304;
          const y = 12 + row * 148;
          const title = lang === "vi" ? step.vi : step.en;
          const detail = lang === "vi" ? step.detailVi : step.detailEn;
          return (
            <g key={step.n}>
              {col < 2 && (
                <line
                  x1={x + 276}
                  y1={y + 52}
                  x2={x + 298}
                  y2={y + 52}
                  className="stroke-accent"
                  strokeWidth="1.5"
                  markerEnd="url(#flow-arrow)"
                />
              )}
              {index === 2 && (
                <path
                  d="M 892 116 V 168 H 28"
                  fill="none"
                  className="stroke-accent"
                  strokeWidth="1.5"
                  markerEnd="url(#flow-arrow)"
                />
              )}
              <rect
                x={x}
                y={y}
                width="272"
                height="104"
                rx="16"
                className="fill-card stroke-border"
                strokeWidth="1"
              />
              <text
                x={x + 18}
                y={y + 28}
                className="fill-accent"
                fontSize="11"
                fontFamily="ui-monospace, monospace"
              >
                {step.n}
              </text>
              <text
                x={x + 48}
                y={y + 28}
                className="fill-foreground"
                fontSize="16"
                fontWeight="600"
              >
                {title}
              </text>
              <foreignObject x={x + 16} y={y + 40} width="240" height="52">
                <p className="m-0 text-[13px] leading-snug text-muted-foreground">
                  {detail}
                </p>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function AboutPage() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <div className="py-12">
      <div className="typeset typeset-page">
        <h1>{t("About AI;DR", "Giới thiệu AI;DR")}</h1>
        <p>
          {t(
            "AI;DR is a machine that reads the day's AI news and publishes one ranked edition, in English and in Vietnamese.",
            "AI;DR là một máy đọc tin AI trong ngày và xuất một bản đã xếp hạng, tiếng Anh và tiếng Việt."
          )}
        </p>
        <p className="text-muted-foreground">
          {t(
            "People do not pick the order. Each hour the pipeline collects stories, processes them, and asks JEV plus an LLM what deserves a place. AnyRouter runs those model calls. The result is combined into one snapshot per language, then distributed to the site, email, and Telegram. Every story still links back to the original post.",
            "Người không chọn thứ tự. Mỗi giờ pipeline thu thập tin, xử lý, rồi hỏi JEV và một LLM tin nào đáng lên. AnyRouter chạy các lần gọi mô hình đó. Kết quả được gộp thành một bản cho mỗi ngôn ngữ, rồi phát tới trang web, email và Telegram. Mỗi tin vẫn dẫn về bài gốc."
          )}
        </p>
      </div>

      <section id="how-it-works" className="mt-10 scroll-mt-20">
        <div className="typeset typeset-page">
          <h2>{t("How it works", "Cách hoạt động")}</h2>
          <p className="text-muted-foreground">
            {t(
              "Six steps, one hourly run. A language that is not ready is skipped and tried again next hour. It is never filled from the other language.",
              "Sáu bước, một lần chạy mỗi giờ. Ngôn ngữ chưa sẵn sàng thì bỏ qua và thử lại giờ sau. Không lấy nội dung từ ngôn ngữ kia để lấp."
            )}
          </p>
        </div>
        <PipelineDiagram lang={lang} />
        <p className="typeset typeset-page mt-4 text-muted-foreground">
          {t("The source list is on the", "Danh sách nguồn nằm ở")}{" "}
          <Link
            to="/data"
            search={{ tab: "sources" }}
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            {t("data sources page", "trang nguồn dữ liệu")}
          </Link>
          .
        </p>
      </section>

      <section className="typeset typeset-page mt-10">
        <h2>{t("Judgment and models", "Phán quyết và mô hình")}</h2>
        <p className="text-muted-foreground">
          {t(
            "JEV is the intent gate: it decides whether an item is actually about this beat before a score is trusted. The LLM then scores relevance, writes the Vietnamese in a press voice, and drafts the digest bullets. ",
            "JEV là cổng ý đồ: nó quyết định một mục có đúng chủ đề hay không trước khi điểm số được tin. LLM sau đó chấm mức liên quan, viết tiếng Việt theo văn phong báo, và soạn các ý AI;DR. "
          )}
          <a
            href={ANYROUTER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            AnyRouter
          </a>
          {t(
            " is the router in front of those models, so scoring, translation, and the digest share one path with fallbacks.",
            " là bộ định tuyến phía trước các mô hình đó, nên chấm điểm, dịch và bản tin đi chung một đường, có phương án dự phòng."
          )}
        </p>
        <p className="text-muted-foreground">
          {t(
            "Stories are machine-curated and machine-translated. Mistakes happen. A signed-in reader can suggest a better Vietnamese line under any story.",
            "Tin do máy tuyển và máy dịch. Sai sót vẫn xảy ra. Độc giả đã đăng nhập có thể góp ý câu tiếng Việt ngay dưới mỗi tin."
          )}
        </p>
        <p className="not-typeset mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a
            href={GITHUB_ALGORITHM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent underline underline-offset-2 hover:no-underline"
          >
            ALGORITHM.md
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent underline underline-offset-2 hover:no-underline"
          >
            GitHub
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </p>
      </section>
    </div>
  );
}
