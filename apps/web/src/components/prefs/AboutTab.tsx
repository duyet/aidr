import { Link } from "@tanstack/react-router";

export function AboutTab({ t }: { t: (en: string, vi: string) => string }) {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        {t(
          "AI News is curated, ranked, and translated by LLMs, hourly.",
          "AI News được tuyển chọn, xếp hạng và dịch bởi LLM, mỗi giờ."
        )}
      </p>
      <Link
        to="/about"
        className="inline-block text-accent underline underline-offset-2"
      >
        {t("Learn how it works →", "Tìm hiểu cách hoạt động →")}
      </Link>
    </div>
  );
}
