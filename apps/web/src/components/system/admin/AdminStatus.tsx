import { AdminSection } from "./AdminSection";
import { lastRunSteps } from "./lib";

/** Read-only blocks derived from /api/admin/status. */

export function AdminTelegramStatus({ status }: { status: unknown }) {
  return (
    <AdminSection title="Telegram / AI;DR">
      <pre className="mt-1 max-h-32 overflow-auto rounded border border-border p-2 text-xs text-muted-foreground">
        {status
          ? JSON.stringify(
              {
                telegram: (status as { telegram?: unknown }).telegram,
                latestTldr: (status as { latestTldr?: unknown }).latestTldr,
                notifications: (status as { notifications?: unknown })
                  .notifications,
              },
              null,
              2
            )
          : "No status loaded."}
      </pre>
    </AdminSection>
  );
}

export function AdminLastRunSteps({ status }: { status: unknown }) {
  const steps = lastRunSteps(status);
  return (
    <AdminSection title="Last run steps">
      {steps.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No step detail loaded.
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs">
          {steps.map((step, i) => (
            <li key={`${step.name}-${i}`} className="text-foreground">
              <span className="font-medium">{step.name}</span>
              {": "}
              <span>{step.action}</span>
              {step.reason && (
                <span className="text-muted-foreground"> — {step.reason}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}

export function AdminStatusJson({ status }: { status: unknown }) {
  return (
    <AdminSection title="Status">
      <pre className="mt-1 max-h-64 overflow-auto rounded border border-border p-2 text-xs text-muted-foreground">
        {status ? JSON.stringify(status, null, 2) : "No status loaded."}
      </pre>
    </AdminSection>
  );
}
