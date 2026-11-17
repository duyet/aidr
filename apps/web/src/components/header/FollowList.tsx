import { useLang } from "../../lib/lang-context";
import { FollowEmail } from "./FollowEmail";
import { LinkRow } from "./LinkRow";
import { followLinks, type LinkPlacement } from "./lib";

/** The email field first, then Telegram, Facebook, Chrome, MCP and RSS. */
export function FollowList({
  placement,
  onSelect,
}: {
  placement: LinkPlacement;
  onSelect?: () => void;
}) {
  const lang = useLang();
  return (
    <div className="flex flex-col gap-0.5">
      <FollowEmail placement={placement} onSelect={onSelect} />
      {followLinks(lang).map((link) => (
        <LinkRow
          key={link.key}
          link={link}
          placement={placement}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
