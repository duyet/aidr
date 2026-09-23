import type { ContentItem } from "./lib";

export function ContentPicker({
  content,
  picks,
  onToggle,
}: {
  content: ContentItem[];
  picks: ContentItem[];
  onToggle: (item: ContentItem) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">Pick content</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Blog posts and today&apos;s news. Click to add, then AI wrap.
      </p>
      <ul className="max-h-[420px] space-y-1 overflow-auto border-t border-border">
        {content.map((item) => {
          const selected = picks.some((p) => p.url === item.url);
          return (
            <li key={`${item.kind}-${item.url}`}>
              <button
                type="button"
                onClick={() => onToggle(item)}
                className={`w-full border-b border-border px-1 py-2 text-left text-sm ${
                  selected ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <span className="mr-2 font-mono text-[10px] uppercase text-muted-foreground">
                  {item.kind}
                </span>
                <span className="font-medium">{item.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
