export const DATA_TABS = [
  "overview",
  "content",
  "runs",
  "sources",
  "llm",
  "admin",
] as const;

export type DataTab = (typeof DATA_TABS)[number];

const ALIASES: Record<string, DataTab> = {
  source: "sources",
};

export function parseDataTab(raw: unknown): DataTab | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  const key = raw.trim().toLowerCase();
  const aliased = ALIASES[key] ?? key;
  return (DATA_TABS as readonly string[]).includes(aliased)
    ? (aliased as DataTab)
    : undefined;
}
