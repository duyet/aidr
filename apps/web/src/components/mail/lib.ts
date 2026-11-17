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
  "w-full rounded-xl bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
export const btnClass = "btn-soft";
export const primaryBtnClass = "btn-primary";
