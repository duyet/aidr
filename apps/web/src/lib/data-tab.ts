export const DATA_TABS = [
  "overview",
  "audience",
  "content",
  "runs",
  "sources",
  "llm",
  "algo",
  "trends",
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

/** Search for a tab switch. Pins ride along on every tab, so a visit to
 *  another tab and back keeps the tracked set. */
export function dataTabSearch(
  tab: DataTab,
  current: { track?: string }
): { tab?: DataTab; track?: string } {
  const track = current.track ? { track: current.track } : {};
  return tab === "overview" ? track : { tab, ...track };
}
