import { createFileRoute } from "@tanstack/react-router";
import { ContributeShell } from "../components/contribute/ContributeShell";
import { headRouteInput } from "../lib/head-route";
import { localizedPageHead } from "../lib/seo";

export const Route = createFileRoute("/contribute/")({
  head: ({ match }) => {
    const lang = match.context.lang;
    return localizedPageHead({
      path: "/contribute",
      title:
        lang === "vi"
          ? "Đóng góp tin AI | AI;DR"
          : "Contribute an AI story | AI;DR",
      description:
        lang === "vi"
          ? "Gửi một bài viết về AI hoặc góp ý bản dịch cho AI;DR, trên trang hoặc qua email từ địa chỉ đã xác minh."
          : "Send an AI story or a translation fix to AI;DR, on the site or by email from a verified address.",
      lang,
      route: headRouteInput(match),
    });
  },
  component: () => <ContributeShell mode="list" />,
});
