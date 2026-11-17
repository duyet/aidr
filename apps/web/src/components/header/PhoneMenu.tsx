import { ErrorBoundary } from "@aidr/ui";
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  type DrawerController,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/react/drawer";
import { X } from "lucide-react";
import type { Lang } from "../../lib/types";
import { Bi } from "../Bi";
import { LangToggle } from "../LangToggle";
import { FollowList } from "./FollowList";
import { HeaderAuth } from "./HeaderAuth";
import { IntroVideoButton } from "./IntroVideo";
import { LinkRow } from "./LinkRow";
import { LogoMark } from "./LogoMark";
import { SITE_LINKS, siteLink } from "./lib";

const SECTION_LABEL_CLASS =
  "px-3 pt-4 pb-1.5 text-[12.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground";

/**
 * The phone AI;DR menu, a bottom sheet: the follow links, the language
 * switch, the site pages and sign-in. The menu bar's AI;DR button and the
 * tab bar's AI;DR tab both open it through `controller`.
 */
export function PhoneMenu({
  controller,
  lang,
  onLangChange,
  langToggleDisabled,
}: {
  controller: DrawerController;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  langToggleDisabled: boolean;
}) {
  const close = () => controller.close();
  return (
    <Drawer controller={controller} side="bottom">
      <DrawerBackdrop className="fixed inset-0 m-0 size-full max-h-none max-w-none border-0 bg-black/35 p-0" />
      <DrawerContent className="flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-card text-card-foreground shadow-2xl outline-none">
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <DrawerTitle className="flex items-center gap-2 text-base font-semibold tracking-[-0.01em]">
            <LogoMark />
            AI;DR
          </DrawerTitle>
          <DrawerClose
            aria-label={lang === "vi" ? "Đóng menu" : "Close menu"}
            className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none [&_svg]:size-5"
          >
            <X aria-hidden />
          </DrawerClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <FollowList placement="phone_menu" onSelect={close} />
          <Bi
            vi="Ngôn ngữ"
            en="Language"
            as="p"
            className={SECTION_LABEL_CLASS}
          />
          <div className="px-3">
            <LangToggle
              lang={lang}
              onChange={onLangChange}
              disabled={langToggleDisabled}
              className="flex w-full [&>button]:h-10"
            />
          </div>
          <nav aria-label={lang === "vi" ? "Trang" : "Pages"}>
            <Bi vi="Trang" en="Pages" as="p" className={SECTION_LABEL_CLASS} />
            {SITE_LINKS.map((page) => (
              <LinkRow
                key={page.id}
                link={siteLink(page)}
                placement="phone_menu"
                onSelect={close}
              />
            ))}
            <IntroVideoButton lang={lang} tile />
          </nav>
          <div className="px-3 pt-4">
            <ErrorBoundary fallback={null}>
              <HeaderAuth avatarSize="size-9" stacked onSignIn={close} />
            </ErrorBoundary>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** The AI;DR button that opens the phone menu, in the menu bar or as the
 *  last tab of the tab bar. */
export function PhoneMenuTrigger({
  controller,
  className,
}: {
  controller: DrawerController;
  className: string;
}) {
  return (
    <DrawerTrigger controller={controller} className={className}>
      <LogoMark />
      <span className="leading-tight">AI;DR</span>
    </DrawerTrigger>
  );
}
