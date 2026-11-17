import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover";
import { useState } from "react";
import { Bi } from "../Bi";
import { FollowList } from "./FollowList";
import { LogoMark } from "./LogoMark";

/** The one primary button in the menu bar: the email field and every place
 *  to follow AI;DR. */
export function GetAIDRMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="btn-primary gap-[7px] pl-2.5">
        <LogoMark size="sm" />
        AI;DR
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[320px] max-w-[calc(100vw-1.5rem)] rounded-2xl border-0 bg-popover p-2 text-popover-foreground shadow-xl outline-none"
      >
        <PopoverTitle className="sr-only">
          <Bi vi="Theo dõi AI;DR" en="Follow AI;DR" />
        </PopoverTitle>
        <FollowList placement="header_menu" onSelect={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
