import { Tabs, TabsContent, TabsList, TabsTrigger } from "@aidr/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  DELIVER_TABS,
  type DeliverTab,
  parseDeliverTab,
} from "../../lib/deliver-tab";
import { useLang } from "../../lib/lang-context";
import type { MailFrequency } from "../../lib/mail-frequency";
import { EYEBROW, PAGE_TITLE } from "../../lib/page-style";
import { DELIVER_CHANNELS } from "./channels";

export function DeliverPage({
  tab,
  onTabChange,
  frequency = "daily",
}: {
  tab: DeliverTab;
  onTabChange: (tab: DeliverTab) => void;
  /** Preselected email cadence, from `?freq=weekly`. */
  frequency?: MailFrequency;
}) {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 pt-5 pb-10 max-sm:pt-4">
      {/* The heading keeps a readable measure; the channel rows below it need
          the full width for the controls/preview pair. */}
      <div className="max-w-3xl space-y-3">
        <p className={EYEBROW}>{t("How you get AI;DR", "Cách nhận AI;DR")}</p>
        <div className="space-y-2">
          <h1 className={PAGE_TITLE}>
            {t("Get AI;DR delivered", "Nhận AI;DR")}
          </h1>
          <p className="max-w-2xl text-[16px] leading-[1.6] text-muted-foreground">
            {t(
              "Same ranked feed. Chrome new tab, Telegram, Facebook, email digest, your AI assistant over MCP, or RSS. Pick any, or all six.",
              "Cùng bảng tin đã xếp hạng. Tab mới Chrome, Telegram, Facebook, email, trợ lý AI qua MCP hoặc RSS. Chọn một, hoặc cả sáu."
            )}
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => onTabChange(parseDeliverTab(next))}
        className="w-full"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-none bg-transparent p-0">
          {DELIVER_TABS.map((id) => {
            const { label, Icon } = DELIVER_CHANNELS[id];
            return (
              <TabsTrigger
                key={id}
                value={id}
                className="chip h-11 gap-1.5 bg-muted px-3 py-0 text-[13px] font-medium text-body hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none sm:h-[30px]"
              >
                <Icon className="size-[15px]" aria-hidden />
                {label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {DELIVER_TABS.map((id) => {
          const { Panel } = DELIVER_CHANNELS[id];
          return (
            <TabsContent key={id} value={id} className="mt-6">
              <Panel lang={lang} frequency={frequency} />
            </TabsContent>
          );
        })}
      </Tabs>

      <p className="max-w-3xl text-[13px] text-muted-foreground">
        {t("Prefer your own reader? ", "Thích dùng trình đọc riêng? ")}
        <button
          type="button"
          onClick={() => onTabChange("rss")}
          className="btn-link h-auto font-medium"
        >
          {t("Subscribe to the RSS feed", "Đăng ký bản tin RSS")}
        </button>
        {t(
          ". The same ranked stories, in any reader.",
          ". Cùng những tin đã xếp hạng, trong mọi trình đọc."
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link to="/" search={{ lang }} className="btn-soft">
          {t("Back to the feed", "Về bảng tin")}
          <ArrowRight aria-hidden />
        </Link>
        <Link to="/privacy" className="btn-link text-muted-foreground">
          {t("Privacy", "Quyền riêng tư")}
        </Link>
        <Link to="/terms" className="btn-link text-muted-foreground">
          {t("Terms", "Điều khoản")}
        </Link>
      </div>
    </div>
  );
}
