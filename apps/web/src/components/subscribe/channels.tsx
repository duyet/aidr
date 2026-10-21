import { Mail, Rss, Send } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { DeliverTab } from "../../lib/deliver-tab";
import type { MailFrequency } from "../../lib/mail-frequency";
import type { Lang } from "../../lib/types";
import { ChromeMark } from "../header/ChromeMark";
import { ChromeChannel } from "./ChromeChannel";
import { EmailChannel } from "./EmailChannel";
import { FacebookChannel, FacebookMark } from "./FacebookChannel";
import { RssChannel } from "./RssChannel";
import { TelegramChannel } from "./TelegramChannel";

export type DeliverChannel = {
  label: string;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  Panel: (props: { lang: Lang; frequency: MailFrequency }) => ReactNode;
};

export const DELIVER_CHANNELS: Record<DeliverTab, DeliverChannel> = {
  chrome: {
    label: "Chrome",
    Icon: ChromeMark,
    Panel: ({ lang }) => <ChromeChannel lang={lang} />,
  },
  telegram: {
    label: "Telegram",
    Icon: Send,
    Panel: ({ lang }) => <TelegramChannel lang={lang} />,
  },
  facebook: {
    label: "Facebook",
    Icon: FacebookMark,
    Panel: ({ lang }) => <FacebookChannel lang={lang} />,
  },
  email: {
    label: "Email",
    Icon: Mail,
    Panel: ({ lang, frequency }) => (
      <EmailChannel lang={lang} initialFrequency={frequency} />
    ),
  },
  rss: {
    label: "RSS",
    Icon: Rss,
    Panel: ({ lang }) => <RssChannel lang={lang} />,
  },
};
