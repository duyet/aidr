import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { Send } from "lucide-react";
import { type FormEvent, type ReactElement, useState } from "react";
import { track } from "../../lib/analytics/track";
import { usePrefs } from "../../lib/prefs";
import {
  TELEGRAM_EN_HANDLE,
  TELEGRAM_EN_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../../lib/site";
import { postSubscribe } from "../../lib/subscribe-post";
import type { Lang } from "../../lib/types";
import { Bi } from "../Bi";

const SOURCE = "news";

const TELEGRAM = {
  vi: { url: TELEGRAM_URL, handle: TELEGRAM_HANDLE },
  en: { url: TELEGRAM_EN_URL, handle: TELEGRAM_EN_HANDLE },
} as const;

type Status = "idle" | "loading" | "done" | "error";

/**
 * The end of a story: the daily email field and a Telegram link. The
 * Telegram channel follows the leading language, @aihomnay for Vietnamese
 * and @aidr_today for English. A short form of /subscribe: the digest
 * settings take their defaults and can change from the confirmation mail.
 */
export function StoryEndCard({ lang }: { lang: Lang }): ReactElement {
  const { prefs } = usePrefs();
  const lead = prefs.bilingual ? prefs.bilingualFirst : lang;
  const telegram = TELEGRAM[lead];
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setStatus(
      (await postSubscribe(SOURCE, { email, lang: lead })) ? "done" : "error"
    );
  }

  return (
    <section
      aria-labelledby="story-end-title"
      data-testid="story-end"
      className="rounded-2xl bg-primary p-5 text-primary-foreground"
    >
      <h2
        id="story-end-title"
        className="font-heading text-[18.5px] leading-tight font-semibold"
      >
        <Bi
          vi="Bản tin mỗi sáng"
          en="One ranked edition, every morning"
          className="block"
        />
      </h2>
      <p className="mt-1.5 text-[13px] opacity-85">
        <Bi
          vi="Tin quan trọng nhất trong ngày. Miễn phí, hủy bất cứ lúc nào."
          en="The stories that matter today. Free, cancel anytime."
        />
      </p>
      {status === "done" ? (
        <p role="status" className="mt-3 text-[13px]">
          <Bi
            vi="Sắp xong. Mở hộp thư và bấm link xác nhận."
            en="Almost done. Check your inbox and click the confirmation link."
          />
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-3.5 flex flex-wrap gap-2">
          <Field className="min-w-0 flex-1 basis-48">
            <FieldLabel className="sr-only">Email</FieldLabel>
            <Input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="email@domain.com"
              value={email}
              onValueChange={setEmail}
              className="h-9 w-full rounded-full border-0 bg-card px-3.5 text-[13px] text-foreground placeholder:text-muted-foreground"
            />
          </Field>
          <Button
            type="submit"
            disabled={status === "loading"}
            className="inline-flex h-9 items-center justify-center rounded-full bg-signal px-4 text-[13px] font-medium whitespace-nowrap text-signal-ink disabled:opacity-60"
          >
            <Bi vi="Đăng ký" en="Subscribe" inline />
          </Button>
        </form>
      )}
      {status === "error" && (
        <p role="alert" className="mt-2 text-[13px]">
          <Bi
            vi="Có lỗi xảy ra, vui lòng thử lại."
            en="Something went wrong, please try again."
          />
        </p>
      )}
      <a
        href={telegram.url}
        onClick={() =>
          track("channel_click", {
            channel: "telegram",
            placement: "story_end",
            lang: lead,
          })
        }
        target="_blank"
        rel="noopener noreferrer"
        className="btn-link mt-3.5 text-inherit"
      >
        <Send aria-hidden />
        Telegram {telegram.handle}
      </a>
    </section>
  );
}
