import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@aidr/ui";
import { useEffect, useRef, useState } from "react";
import { useLang } from "../lib/lang-context";
import { AboutTab } from "./prefs/AboutTab";
import { SettingsTab } from "./prefs/SettingsTab";
import { ThemeTab } from "./prefs/ThemeTab";

export function PrefsPanel({
  triggerClassName,
}: {
  triggerClassName?: string;
} = {}) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size={triggerClassName ? "icon-lg" : "sm"}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("Reader preferences", "Tuỳ chỉnh hiển thị")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClassName ?? "font-serif text-sm"}
      >
        Aa
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label={t("Reader preferences", "Tuỳ chỉnh hiển thị")}
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-card p-4 text-sm shadow-lg"
        >
          <Tabs defaultValue="theme">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="theme">{t("Theme", "Giao diện")}</TabsTrigger>
              <TabsTrigger value="settings">
                {t("Settings", "Cài đặt")}
              </TabsTrigger>
              <TabsTrigger value="about">
                {t("About", "Giới thiệu")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="theme">
              <ThemeTab t={t} />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsTab t={t} />
            </TabsContent>
            <TabsContent value="about">
              <AboutTab t={t} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
