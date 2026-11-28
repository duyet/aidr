import type { ClientUsageReport } from "../../../../worker/client-usage";
import { AdminSection } from "./AdminSection";

/** Clients as rows, UTC days (oldest first) as columns. */
export function pivotClientDays(
  daily: Extract<ClientUsageReport, { status: "ok" }>["daily"]
) {
  const days = [...new Set(daily.map((row) => row.day))].sort();
  const clients = new Map<string, Map<string, number>>();
  for (const { day, client, hits } of daily) {
    const row = clients.get(client) ?? new Map<string, number>();
    row.set(day, (row.get(day) ?? 0) + hits);
    clients.set(client, row);
  }
  const rows = [...clients].map(([client, byDay]) => ({
    client,
    byDay,
    total: [...byDay.values()].reduce((sum, hits) => sum + hits, 0),
  }));
  return { days, rows: rows.sort((a, b) => b.total - a.total) };
}

export function AdminClients({ usage }: { usage: ClientUsageReport | null }) {
  if (usage?.status !== "ok") {
    return (
      <AdminSection title="API clients">
        <p className="mt-1 text-xs text-muted-foreground">
          {usage ? `${usage.status}: ${usage.reason}` : "No clients loaded."}
        </p>
      </AdminSection>
    );
  }
  const { days, rows } = pivotClientDays(usage.daily);
  return (
    <AdminSection title={`API clients, last ${usage.windowDays} days`}>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No requests yet.</p>
      ) : (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-2 font-normal">client</th>
                {days.map((day) => (
                  <th
                    key={day}
                    className="py-1 pr-2 font-normal text-right tabular-nums"
                  >
                    {day.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, byDay }) => (
                <tr key={client} className="border-b border-border/50">
                  <td className="py-1 pr-2 font-mono">{client}</td>
                  {days.map((day) => (
                    <td key={day} className="py-1 pr-2 text-right tabular-nums">
                      {byDay.get(day) ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {usage.versions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {usage.versions.map(({ client, version, hits, lastSeen }) => (
            <li key={`${client}-${version}`}>
              <span className="font-mono">
                {client} {version}
              </span>
              <span className="text-muted-foreground">
                {" "}
                — {hits} req, last {lastSeen.slice(0, 16).replace("T", " ")}Z
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}
