import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { Lang } from "../lib/types";

export function CopyTextButton({
  text,
  label,
  lang,
}: {
  text: string;
  label: string;
  lang: Lang;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      className="not-typeset inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      <span aria-live="polite">
        {copied ? (lang === "vi" ? "Đã chép" : "Copied") : label}
      </span>
    </button>
  );
}
