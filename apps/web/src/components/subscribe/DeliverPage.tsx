import {
  Badge,
  Button,
  CardFooter,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@aidr/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  DELIVER_TABS,
  type DeliverTab,
  parseDeliverTab,
} from "../../lib/deliver-tab";
import { useLang } from "../../lib/lang-context";
import type { MailFrequency } from "../../lib/mail-frequency";
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
    <div className="mx-auto w-full max-w-6xl space-y-10 py-12">
      {/* The heading keeps a readable measure; the channel rows below it need
          the full width for the controls/preview pair. */}
      <div className="max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 rounded-full">
            {t("How you get AI;DR", "Cách nhận AI;DR")}
          </Badge>
        </div>
        <div className="space-y-3">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
            {t("Get AI;DR delivered", "Nhận AI;DR")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
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
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 sm:grid-cols-6">
          {DELIVER_TABS.map((id) => {
            const { label, Icon } = DELIVER_CHANNELS[id];
            return (
              <TabsTrigger
                key={id}
                value={id}
                className="h-11 gap-2 text-sm sm:text-base"
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {DELIVER_TABS.map((id) => {
          const { Panel } = DELIVER_CHANNELS[id];
          return (
            <TabsContent key={id} value={id} className="mt-8">
              <Panel lang={lang} frequency={frequency} />
            </TabsContent>
          );
        })}
      </Tabs>

      <p className="max-w-3xl text-sm text-muted-foreground">
        {t("Prefer your own reader? ", "Thích dùng trình đọc riêng? ")}
        <button
          type="button"
          onClick={() => onTabChange("rss")}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {t("Subscribe to the RSS feed", "Đăng ký bản tin RSS")}
        </button>
        {t(
          " — the same ranked stories, in any reader.",
          " — cùng những tin đã xếp hạng, trong mọi trình đọc."
        )}
      </p>

      <CardFooter className="gap-2 px-0">
        <Button variant="outline" asChild>
          <Link to="/" search={{ lang }}>
            {t("Back to the feed", "Về bảng tin")}
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/privacy">{t("Privacy", "Quyền riêng tư")}</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/terms">{t("Terms", "Điều khoản")}</Link>
        </Button>
      </CardFooter>
    </div>
  );
}
