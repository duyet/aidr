import type { CampaignRow } from "./lib";

export function CampaignList({ campaigns }: { campaigns: CampaignRow[] }) {
  if (campaigns.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">Campaigns</h2>
      <ul className="text-sm">
        {campaigns.map((row) => (
          <li key={row.id} className="flex justify-between py-2">
            <span>{row.subject}</span>
            <span className="text-muted-foreground">
              {row.status}
              {row.status === "sent" ? ` · ${row.sent_count}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
