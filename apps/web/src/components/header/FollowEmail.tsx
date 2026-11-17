import { Link } from "@tanstack/react-router";
import { Input } from "@ui-sdk/react/input";
import { type FormEvent, useState } from "react";
import { track } from "../../lib/analytics/track";
import { useLang } from "../../lib/lang-context";
import { postSubscribe } from "../../lib/subscribe-post";
import { Bi } from "../Bi";
import type { LinkPlacement } from "./lib";

type Status = "idle" | "loading" | "done" | "error";

/** The daily email in one step: the worker fills every other digest setting
 *  with its defaults, and /subscribe keeps the full form. */
export function FollowEmail({
  placement,
  onSelect,
}: {
  placement: LinkPlacement;
  onSelect?: () => void;
}) {
  const lang = useLang();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setStatus(
      (await postSubscribe("news", { email, lang })) ? "done" : "error"
    );
  };

  return (
    <div className="space-y-2 px-3 pt-1 pb-2">
      <Bi
        vi="Bản tin mỗi sáng"
        en="Every morning"
        as="p"
        className="text-[13px] font-semibold text-foreground"
      />
      {status === "done" ? (
        <p role="status" className="text-[12.5px] text-muted-foreground">
          <Bi
            vi="Sắp xong. Mở hộp thư và bấm link xác nhận."
            en="Almost done. Open your inbox and click the confirmation link."
          />
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <Input
            type="email"
            required
            aria-label="Email"
            placeholder="email@domain.com"
            autoComplete="email"
            value={email}
            onValueChange={setEmail}
            className="h-8 min-w-0 flex-1 rounded-full bg-muted px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={status === "loading"}
          >
            <Bi vi="Đăng ký" en="Subscribe" inline />
          </button>
        </form>
      )}
      {status === "error" && (
        <p role="alert" className="text-[12.5px] text-destructive">
          <Bi
            vi="Chưa đăng ký được. Thử lại sau ít phút."
            en="Could not subscribe. Try again in a few minutes."
          />
        </p>
      )}
      <Link
        to="/subscribe"
        search={{ tab: "email", lang }}
        onClick={() => {
          track("channel_click", { channel: "email", placement });
          onSelect?.();
        }}
        className="inline-block text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <Bi vi="Chọn giờ và tần suất" en="Pick the time and frequency" inline />
      </Link>
    </div>
  );
}
