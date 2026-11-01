import { buttonVariants } from "@aidr/ui";
import { useLocation } from "@tanstack/react-router";
import { useLang } from "../lib/lang-context";
import { type LoadErrorSubject, loadErrorCopy } from "../lib/load-error";

export function LoadErrorPage({ subject }: { subject: LoadErrorSubject }) {
  const lang = useLang();
  const href = useLocation({ select: (l) => l.href });
  const copy = loadErrorCopy(subject, lang);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <p className="text-[15px] text-muted-foreground">{copy.body}</p>
        <a
          href={href}
          className={buttonVariants({
            variant: "outline",
            className: "mt-6 text-[13px] max-sm:h-11",
          })}
        >
          {copy.retry}
        </a>
      </div>
    </div>
  );
}
