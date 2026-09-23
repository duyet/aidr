export interface Template {
  id: string;
  name: string;
  description: string;
  subject: string;
  preheader: string;
  body_md: string;
  cta_label: string;
  cta_url: string;
}

export interface ContentItem {
  kind: "news" | "blog";
  title: string;
  url: string;
  excerpt: string;
}

export interface SubscriberRow {
  email: string;
  lang: string;
  timezone: string | null;
  created_at: number | null;
  source: string | null;
}

export interface CampaignRow {
  id: string;
  subject: string;
  status: string;
  sent_count: number;
  created_at: number;
}

export const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";
export const btnClass =
  "rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50";
export const primaryBtnClass =
  "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50";
