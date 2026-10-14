import { useEffect, useRef, useState } from "react";
import {
  markUnsubscribed,
  wasUnsubscribed,
} from "../../lib/analytics/url-privacy";
import type { Lang } from "../../lib/types";

export function UnsubscribeView({
  token,
  lang,
}: {
  token: string;
  lang: Lang;
}) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  // StrictMode runs a mount effect twice. The DELETE goes out once.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === token) return;
    sent.current = token;
    if (wasUnsubscribed(window.history.state, token)) {
      setStatus("done");
      return;
    }
    setStatus("loading");
    fetch(`/api/subscribe?token=${encodeURIComponent(token)}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (res.ok) markUnsubscribed(token);
        setStatus(res.ok ? "done" : "error");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="mx-auto w-full max-w-md py-16 text-center">
      <h1 className="font-serif text-3xl font-medium tracking-tight">
        {lang === "vi" ? "Hủy đăng ký" : "Unsubscribe"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {status === "loading" &&
          (lang === "vi" ? "Đang xử lý…" : "Processing…")}
        {status === "done" &&
          (lang === "vi"
            ? "Bạn đã hủy đăng ký thành công."
            : "You have been unsubscribed.")}
        {status === "error" &&
          (lang === "vi"
            ? "Có lỗi xảy ra, vui lòng thử lại."
            : "Something went wrong, please try again.")}
      </p>
    </div>
  );
}
