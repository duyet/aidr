import { ArrowLeft, ArrowRight, Lock, Plus, RotateCw, X } from "lucide-react";
import type { ReactNode } from "react";

/** Decorative browser chrome that frames each delivery-channel preview. */
export function BrowserFrame({
  tab,
  address,
  children,
}: {
  tab: string;
  address: string;
  children: ReactNode;
}) {
  return (
    <div
      className="animate-in fade-in-0 slide-in-from-bottom-4 zoom-in-[0.98] overflow-hidden rounded-xl border border-border bg-card shadow-md shadow-foreground/5 duration-500"
      style={{ animationFillMode: "backwards" }}
    >
      <div className="flex items-end gap-1.5 bg-muted/60 px-2.5 pt-1.5">
        <div className="flex h-7 max-w-44 items-center gap-1.5 rounded-t-lg border border-b-0 border-border bg-card px-3 text-[11px]">
          <img src="/favicon.svg" alt="" className="size-3.5" />
          <span className="truncate">{tab}</span>
          <X className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <Plus className="mb-2 size-3.5 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex items-center gap-2.5 border-b border-border bg-card px-3 py-2">
        <div
          className="flex items-center gap-2.5 text-muted-foreground"
          aria-hidden
        >
          <ArrowLeft className="size-3.5" />
          <ArrowRight className="size-3.5" />
          <RotateCw className="size-3.5" />
        </div>
        <div className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-muted/60 px-3 text-[11px] text-muted-foreground">
          <Lock className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{address}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
