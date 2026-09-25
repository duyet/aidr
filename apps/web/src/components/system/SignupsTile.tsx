import { UserPlus } from "lucide-react";
import type { AccountCount } from "../../../worker/account-count.js";
import { useSystemData } from "../../lib/use-system-stats";
import { API } from "./endpoints";
import { StatTile } from "./StatTile";

/**
 * AIDR user signups as a first-class Overview metric: the number of Clerk
 * accounts mirrored into D1 by the verified Clerk webhook (plus the admin
 * backfill), not the D1 `subscribers` email-subscription count shown next to
 * it. It has its own endpoint, so a slow or failing overview batch never
 * hides it.
 */
export function SignupsTile() {
  const state = useSystemData<AccountCount>(API.accounts);

  if (state.data) {
    const { total, status } = state.data;
    if (status === "available" && total !== null) {
      return (
        <StatTile
          icon={UserPlus}
          label="Signups"
          value={String(total)}
          sublabel="Clerk accounts"
        />
      );
    }
    return (
      <UnavailableTile
        detail={
          status === "unconfigured"
            ? "Webhook not synced yet"
            : "Signup source could not be read"
        }
      />
    );
  }

  if (state.error) {
    return <UnavailableTile detail="Couldn't load signups" />;
  }
  return <StatTile icon={UserPlus} label="Signups" value={null} />;
}

/** Never a fake 0: an unreadable source is stated, not guessed. */
function UnavailableTile({ detail }: { detail: string }) {
  return (
    <div role="status" aria-live="polite" className="h-full">
      <StatTile
        icon={UserPlus}
        label="Signups"
        value="Unavailable"
        numeric={false}
        sublabel={detail}
      />
    </div>
  );
}
