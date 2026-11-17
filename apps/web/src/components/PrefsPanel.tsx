import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/react/drawer";
import { X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useLang } from "../lib/lang-context";
import type { Lang } from "../lib/types";
import { Bi } from "./Bi";
import { Customize } from "./prefs/Customize";

const PHONE_QUERY = "(max-width: 699px)";

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}

const TRIGGER_CLASS =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 font-serif text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PrefsPanel({
  onLangChange,
  langDisabled = false,
  triggerClassName = TRIGGER_CLASS,
}: {
  onLangChange: (lang: Lang) => void;
  langDisabled?: boolean;
  triggerClassName?: string;
}) {
  const lang = useLang();
  const phone = usePhone();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <Drawer side={phone ? "bottom" : "right"}>
      <DrawerTrigger
        aria-label={t("Reader preferences", "Tuỳ chỉnh hiển thị")}
        className={`${FOCUS} ${triggerClassName}`}
      >
        Aa
      </DrawerTrigger>
      <DrawerBackdrop className="fixed inset-0 m-0 size-full max-h-none max-w-none border-0 bg-black/35 p-0" />
      <DrawerContent className="flex flex-col bg-card text-card-foreground shadow-xl data-[side=bottom]:max-h-[85dvh] data-[side=bottom]:w-full data-[side=bottom]:rounded-t-2xl data-[side=right]:h-full data-[side=right]:w-[360px] data-[side=right]:max-w-full">
        {phone && (
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-input"
          />
        )}
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-1">
          <DrawerTitle className="text-[15px] font-semibold text-foreground">
            <Bi vi="Tuỳ chỉnh giao diện" en="Customize" inline />
          </DrawerTitle>
          <DrawerClose
            aria-label={t("Close", "Đóng")}
            className={`${FOCUS} inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
          >
            <X className="size-[15px]" strokeWidth={2} aria-hidden />
          </DrawerClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Customize onLangChange={onLangChange} langDisabled={langDisabled} />
          <DrawerDescription className="mt-2 text-[12.5px] text-muted-foreground">
            <Bi
              vi="Lưu trong trình duyệt này."
              en="Saved in this browser."
              inline
            />
          </DrawerDescription>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
