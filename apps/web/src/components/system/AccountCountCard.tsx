import { Card, CardContent, Skeleton } from "@aidr/ui";
import { Users } from "lucide-react";
import type { AccountCount as AccountCountData } from "../../../worker/account-count.js";
import { useSystemData } from "../../lib/use-system-stats";
import { API } from "./endpoints";

const ERROR_STATE: AccountCountData = {
  total: null,
  source: "clerk",
  status: "error",
};

/** Aggregate account count; it is intentionally separate from subscribers. */
export function AccountCountCard() {
  const state = useSystemData<AccountCountData>(API.accounts);

  return (
    <Card className="min-w-0 border-border shadow-none">
      <CardContent className="p-3 sm:p-4">
        {state.data ? (
          <AccountCountView data={state.data} />
        ) : state.error ? (
          <AccountCountView data={ERROR_STATE} />
        ) : (
          <Skeleton className="h-[4.5rem] w-full" />
        )}
      </CardContent>
    </Card>
  );
}

export function AccountCountView({ data }: { data: AccountCountData }) {
  const available = data.status === "available" && data.total !== null;
  const detail =
    data.status === "unconfigured"
      ? "Account source is not configured."
      : "Account source could not be read.";

  return (
    <section
      aria-labelledby="aidr-account-count-title"
      className="flex h-full min-h-[4.5rem] flex-col justify-between gap-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-accent">
          <Users className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p
            id="aidr-account-count-title"
            className="text-xs font-semibold leading-tight text-foreground"
          >
            AIDR user signups
          </p>
          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
            Clerk accounts · aggregate total
          </p>
        </div>
      </div>
      {available ? (
        <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
          {data.total}
        </p>
      ) : (
        <div role="status" aria-live="polite" className="min-w-0">
          <p className="text-sm font-medium leading-tight text-foreground">
            Unavailable
          </p>
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
            {detail}
          </p>
        </div>
      )}
    </section>
  );
}
