import { useState } from "react";
import type { Lang } from "../../lib/types";

export function UnsubscribeView({
  token,
  lang,
}: {
  token: string;
  lang: Lang;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );

  const doUnsubscribe = async () => {
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/subscribe?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "idle") {
    void doUnsubscribe();
  }

  return (
    <div className="mx-auto max-w-md py-16 text-center">
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
