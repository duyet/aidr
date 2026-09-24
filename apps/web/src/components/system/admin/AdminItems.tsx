import { CategoryLabel } from "../../CategoryLabel";
import { AdminSection } from "./AdminSection";
import {
  adminBtnClass,
  type ModerationItem,
  parseTags,
  type RateDraft,
  rankBreakdown,
} from "./lib";

function ItemRow({
  item,
  busy,
  draft,
  onRateDraft,
  onApplyRate,
  onModerate,
}: {
  item: ModerationItem;
  busy: boolean;
  draft: RateDraft;
  onRateDraft: (
    id: string,
    field: "importance" | "quality",
    value: string
  ) => void;
  onApplyRate: (id: string) => void;
  onModerate: (id: string, body: Record<string, unknown>) => void;
}) {
  const breakdown = rankBreakdown(item);
  return (
    <tr className="border-b border-border/50 align-top">
      <td className="py-1 pr-2 whitespace-nowrap tabular-nums text-muted-foreground">
        {item.published_at
          ? new Date(item.published_at * 1000).toISOString()
          : "—"}
      </td>
      <td className="py-1 pr-2">{item.source_id ?? "—"}</td>
      <td className="py-1 pr-2 max-w-xs">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:underline"
          >
            {item.title ?? item.url}
          </a>
        ) : (
          (item.title ?? "—")
        )}
        <details className="mt-1">
          <summary className="cursor-pointer text-muted-foreground">
            analyze
          </summary>
          <div className="mt-1 space-y-0.5 text-muted-foreground">
            <div>
              category:{" "}
              {item.category ? (
                <CategoryLabel name={item.category} lang="en" />
              ) : (
                "—"
              )}
            </div>
            <div>tags: {parseTags(item.tags).join(", ") || "—"}</div>
            <div>
              points: {item.points ?? 0}, comments: {item.comments ?? 0}
            </div>
            <div>ageHours: {breakdown.ageHours.toFixed(2)}</div>
            <div>qualityFactor: {breakdown.qualityFactor.toFixed(3)}</div>
            <div>decay: {breakdown.decay.toFixed(3)}</div>
            <div>engagement: {breakdown.engagement.toFixed(3)}</div>
            <div>
              computed rank: {breakdown.computed.toFixed(3)} (stored:{" "}
              {item.rank_score?.toFixed?.(3) ?? "—"})
            </div>
          </div>
        </details>
      </td>
      <td className="py-1 pr-2">
        <span
          className={
            item.status === "published"
              ? "rounded bg-green-500/15 px-1.5 py-0.5 text-green-600 dark:text-green-400"
              : item.status === "rejected"
                ? "rounded bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-400"
                : "rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
          }
        >
          {item.status ?? "—"}
        </span>
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {item.llm_relevance ?? "—"}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {item.llm_importance ?? "—"}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {item.llm_quality ?? "—"}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {item.rank_score?.toFixed?.(2) ?? "—"}
      </td>
      <td className="py-1 pr-2">
        <div className="flex flex-wrap items-center gap-1">
          {item.status === "rejected" ? (
            <button
              type="button"
              onClick={() => onModerate(item.id, { action: "restore" })}
              disabled={busy}
              className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground hover:bg-muted disabled:opacity-50"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onModerate(item.id, { action: "reject" })}
              disabled={busy}
              className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground hover:bg-muted disabled:opacity-50"
            >
              Reject
            </button>
          )}
          <input
            type="number"
            min={0}
            max={10}
            placeholder="imp"
            value={draft.importance}
            onChange={(e) => onRateDraft(item.id, "importance", e.target.value)}
            className="w-12 rounded border border-border bg-transparent px-1 py-0.5 text-xs tabular-nums"
          />
          <input
            type="number"
            min={0}
            max={10}
            placeholder="qual"
            value={draft.quality}
            onChange={(e) => onRateDraft(item.id, "quality", e.target.value)}
            className="w-12 rounded border border-border bg-transparent px-1 py-0.5 text-xs tabular-nums"
          />
          <button
            type="button"
            onClick={() => onApplyRate(item.id)}
            disabled={busy}
            className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground hover:bg-muted disabled:opacity-50"
          >
            Rate
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AdminItems({
  items,
  busy,
  actionBusyId,
  rateDraft,
  onRateDraft,
  onApplyRate,
  onModerate,
  onRefresh,
}: {
  items: ModerationItem[];
  busy: boolean;
  actionBusyId: string | null;
  rateDraft: (id: string) => RateDraft;
  onRateDraft: (
    id: string,
    field: "importance" | "quality",
    value: string
  ) => void;
  onApplyRate: (id: string) => void;
  onModerate: (id: string, body: Record<string, unknown>) => void;
  onRefresh: () => void;
}) {
  return (
    <AdminSection
      title="Items"
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className={adminBtnClass}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No items loaded.</p>
      ) : (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-2 font-normal">time</th>
                <th className="py-1 pr-2 font-normal">source</th>
                <th className="py-1 pr-2 font-normal">title</th>
                <th className="py-1 pr-2 font-normal">status</th>
                <th className="py-1 pr-2 font-normal text-right tabular-nums">
                  rel
                </th>
                <th className="py-1 pr-2 font-normal text-right tabular-nums">
                  imp
                </th>
                <th className="py-1 pr-2 font-normal text-right tabular-nums">
                  qual
                </th>
                <th className="py-1 pr-2 font-normal text-right tabular-nums">
                  rank
                </th>
                <th className="py-1 pr-2 font-normal">actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  busy={actionBusyId === item.id}
                  draft={rateDraft(item.id)}
                  onRateDraft={onRateDraft}
                  onApplyRate={onApplyRate}
                  onModerate={onModerate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSection>
  );
}
