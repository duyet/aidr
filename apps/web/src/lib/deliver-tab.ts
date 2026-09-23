export const DELIVER_TABS = ["chrome", "telegram", "email"] as const;

export type DeliverTab = (typeof DELIVER_TABS)[number];

export function parseDeliverTab(value: unknown): DeliverTab {
  return DELIVER_TABS.includes(value as DeliverTab)
    ? (value as DeliverTab)
    : "chrome";
}
