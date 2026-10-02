import { useEffect, useState } from "react";

interface CollectedItem {
  title: string;
  url: string;
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}

type State = "loading" | "ready" | "empty" | "error";

/** Items first stored during this run: title and the source URL. */
export function RunCollectedItems({
  runId,
  lang,
}: {
  runId: string;
  lang: "en" | "vi";
}) {
  const vi = lang === "vi";
  const [state, setState] = useState<State>("loading");
  const [items, setItems] = useState<CollectedItem[]>([]);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/system/run-items?run_id=${encodeURIComponent(runId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("run items failed");
        return (await res.json()) as {
          items?: CollectedItem[];
          truncated?: boolean;
        };
      })
      .then((body) => {
        if (cancelled) return;
        const rows = Array.isArray(body.items) ? body.items : [];
        setItems(rows);
        setTruncated(body.truncated === true);
        setState(rows.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {vi ? "Tin đã lưu trong lần chạy" : "Items stored this run"}
      </p>
      {state === "loading" ? (
        <p className="text-xs text-muted-foreground">
          {vi ? "Đang tải danh sách tin…" : "Loading collected items…"}
        </p>
      ) : null}
      {state === "error" ? (
        <p className="text-xs text-muted-foreground">
          {vi ? "Không tải được danh sách tin." : "Could not load the items."}
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="text-xs text-muted-foreground">
          {vi
            ? "Không có tin mới được lưu trong khoảng thời gian này."
            : "No new items were stored during this run."}
        </p>
      ) : null}
      {state === "ready" ? (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
          {items.map((item) => {
            const href = httpUrl(item.url);
            const label = item.title || item.url;
            return (
              <li key={item.url} className="min-w-0">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-foreground underline-offset-2 hover:underline"
                  >
                    {label}
                  </a>
                ) : (
                  <span className="block truncate text-foreground">
                    {label}
                  </span>
                )}
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {item.url}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {truncated ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {vi
            ? "Chỉ hiện 200 tin mới nhất."
            : "Showing the 200 most recently stored."}
        </p>
      ) : null}
    </div>
  );
}
