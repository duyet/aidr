import { Link } from "@tanstack/react-router";
import { useLang } from "../../lib/lang-context";
import { Bi } from "../Bi";
import {
  isExternal,
  type LinkPlacement,
  type SiteLink,
  trackLink,
} from "./lib";

export const ROW_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted motion-reduce:transition-none [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/** One icon row of a menu: the label, and a muted hint after it. */
export function LinkRow({
  link,
  placement,
  onSelect,
}: {
  link: SiteLink;
  placement: LinkPlacement;
  onSelect?: () => void;
}) {
  const navigationLang = useLang();
  const onClick = () => {
    trackLink(link, placement);
    onSelect?.();
  };
  const body = (
    <>
      <link.icon aria-hidden />
      <span lang="en" className="min-w-0">
        {link.en}
      </span>
      {link.hint && (
        <Bi
          vi={link.hint.vi}
          en={link.hint.en}
          inline
          className="ml-auto truncate pl-2 text-[12px] font-normal text-muted-foreground"
        />
      )}
    </>
  );
  return isExternal(link) ? (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={ROW_CLASS}
    >
      {body}
    </a>
  ) : (
    <Link
      to={link.href}
      search={{ ...link.search, lang: navigationLang }}
      onClick={onClick}
      className={ROW_CLASS}
    >
      {body}
    </Link>
  );
}
