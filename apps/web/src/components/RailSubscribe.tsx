import { useState } from "react";
import { postSubscribe } from "../lib/subscribe-post";
import type { Lang } from "../lib/types";
import { Bi } from "./Bi";

/** The rail's one-field signup for the daily email. Digest size, format, font
 * and frequency take the server defaults; /subscribe has the full form. */
export function RailSubscribe({ lang }: { lang: Lang }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setStatus(
      (await postSubscribe("news", { email, lang })) ? "done" : "error"
    );
  }

  if (status === "done") {
    return (
      <p role="status" className="text-[12.5px] text-body">
        <Bi
          vi="Sắp xong: mở hộp thư và bấm link xác nhận."
          en="Almost done. Check your inbox and click the confirmation link."
        />
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <p className="text-[12.5px] text-body">
        <Bi
          vi="Bản tin xếp hạng lúc 07:00 theo giờ của bạn. Miễn phí."
          en="The ranked edition at 07:00 your time. Free."
        />
      </p>
      <div className="flex gap-1.5">
        <input
          type="email"
          required
          aria-label="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@domain.com"
          className="h-9 min-w-0 flex-1 rounded-full bg-muted px-3.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="btn-primary"
        >
          <Bi vi="Đăng ký" en="Subscribe" inline />
        </button>
      </div>
      {status === "error" && (
        <p role="alert" className="text-[12.5px] text-destructive">
          <Bi
            vi="Có lỗi xảy ra, thử lại nhé."
            en="Something went wrong, please try again."
          />
        </p>
      )}
    </form>
  );
}
