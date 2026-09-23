import type { SubscriberRow } from "./lib";

export function SubscriberTable({
  subscribers,
}: {
  subscribers: SubscriberRow[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">List</h2>
      {subscribers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subscribers yet.</p>
      ) : (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Email</th>
                <th className="py-2 pr-3 font-normal">Lang</th>
                <th className="py-2 pr-3 font-normal">Source</th>
                <th className="py-2 font-normal">Joined</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((row) => (
                <tr key={row.email} className="border-b border-border/60">
                  <td className="py-2 pr-3">{row.email}</td>
                  <td className="py-2 pr-3">{row.lang}</td>
                  <td className="py-2 pr-3">{row.source ?? "news"}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">
                    {row.created_at
                      ? new Date(row.created_at).toISOString().slice(0, 10)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
