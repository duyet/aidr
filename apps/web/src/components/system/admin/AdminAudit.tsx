import { AdminSection } from "./AdminSection";
import type { AuditRow } from "./lib";

export function AdminAudit({ audit }: { audit: AuditRow[] }) {
  return (
    <AdminSection title="Audit log">
      {audit.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No audit rows.</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs">
          {audit.map((row) => (
            <li key={`${row.ts}-${row.action}`}>
              <span className="tabular-nums text-muted-foreground">
                {new Date(row.ts).toISOString()}
              </span>{" "}
              <span className="font-medium">{row.action}</span>
              {row.detail ? (
                <span className="text-muted-foreground"> — {row.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}
