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
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <a
          href={href}
          className="mt-6 inline-block text-sm underline underline-offset-4 decoration-accent hover:decoration-2"
        >
          {copy.retry}
        </a>
      </div>
    </div>
  );
}
