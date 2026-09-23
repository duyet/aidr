import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { type AdminState, authedFetch } from "../../lib/admin";
import { MailActionBar } from "./ActionBar";
import { CampaignList } from "./CampaignList";
import { ContentPicker } from "./ContentPicker";
import {
  type CampaignRow,
  type ContentItem,
  fieldClass,
  type SubscriberRow,
  type Template,
} from "./lib";
import { PreviewFrame } from "./PreviewFrame";
import { SubscriberTable } from "./SubscriberTable";
import { TemplatePicker } from "./TemplatePicker";

export function MailPanel({ admin }: { admin: AdminState }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("note");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [source, setSource] = useState("");
  const [picks, setPicks] = useState<ContentItem[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("me@duyet.net");

  const template = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId]
  );

  async function loadLists() {
    const [tRes, sRes, cRes, nRes] = await Promise.all([
      authedFetch(admin, "/api/admin/mail/templates"),
      authedFetch(admin, "/api/admin/mail/subscribers"),
      authedFetch(admin, "/api/admin/mail/campaigns"),
      authedFetch(admin, "/api/admin/mail/content"),
    ]);
    const failures: string[] = [];
    if (tRes.ok) {
      const data = (await tRes.json()) as { templates?: Template[] };
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } else {
      failures.push("templates");
    }
    if (sRes.ok) {
      const data = (await sRes.json()) as { subscribers?: SubscriberRow[] };
      setSubscribers(Array.isArray(data.subscribers) ? data.subscribers : []);
    } else {
      failures.push("subscribers");
    }
    if (cRes.ok) {
      const data = (await cRes.json()) as { campaigns?: CampaignRow[] };
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } else {
      failures.push("campaigns");
    }
    if (nRes.ok) {
      const data = (await nRes.json()) as { items?: ContentItem[] };
      setContent(Array.isArray(data.items) ? data.items : []);
    } else {
      failures.push("content");
    }
    if (failures.length > 0) {
      setMessage(`Failed to load ${failures.join(", ")}.`);
    }
  }

  useEffect(() => {
    void loadLists();
    // admin identity is stable for the page lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(next: Template) {
    setTemplateId(next.id);
    if (!subject) setSubject(next.subject);
    if (!preheader) setPreheader(next.preheader);
    if (!bodyMd) setBodyMd(next.body_md);
    if (!ctaLabel) setCtaLabel(next.cta_label);
    if (!ctaUrl) setCtaUrl(next.cta_url);
  }

  function togglePick(item: ContentItem) {
    setPicks((prev) => {
      const exists = prev.some((p) => p.url === item.url);
      return exists ? prev.filter((p) => p.url !== item.url) : [...prev, item];
    });
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    try {
      await fn();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    await run("preview", async () => {
      const res = await authedFetch(admin, "/api/admin/mail/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject || "Preview",
          preheader,
          body_md: bodyMd || " ",
          cta_label: ctaLabel,
          cta_url: ctaUrl,
        }),
      });
      const data = (await res.json()) as { html?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "preview failed");
      setPreviewHtml(data.html ?? "");
    });
  }

  async function wrap() {
    await run("wrap", async () => {
      const res = await authedFetch(admin, "/api/admin/mail/wrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          source:
            source ||
            picks.map((p) => `${p.title}\n${p.excerpt}\n${p.url}`).join("\n\n"),
          picks,
          campaignId: campaignId ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        subject?: string;
        preheader?: string;
        body_md?: string;
        cta_label?: string;
        cta_url?: string;
        campaign?: { id: string };
      };
      if (!res.ok) throw new Error(data.error ?? "wrap failed");
      if (data.subject) setSubject(data.subject);
      if (data.preheader) setPreheader(data.preheader);
      if (data.body_md) setBodyMd(data.body_md);
      if (data.cta_label !== undefined) setCtaLabel(data.cta_label);
      if (data.cta_url !== undefined) setCtaUrl(data.cta_url);
      if (data.campaign?.id) setCampaignId(data.campaign.id);
      setMessage("AI wrapped the draft.");
    });
  }

  async function save(): Promise<string> {
    setBusy("save");
    setMessage(null);
    try {
      const res = await authedFetch(admin, "/api/admin/mail/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaignId ?? undefined,
          template_id: templateId,
          subject,
          preheader,
          body_md: bodyMd,
          cta_label: ctaLabel,
          cta_url: ctaUrl,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "save failed");
      const id = data.id ?? campaignId;
      if (!id) throw new Error("save a draft first");
      setCampaignId(id);
      setMessage("Draft saved.");
      await loadLists();
      return id;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function send(test?: boolean) {
    try {
      const sendId = await save();
      await run(test ? "test" : "send", async () => {
        const qs = test ? `?test=${encodeURIComponent(testEmail)}` : "";
        const res = await authedFetch(
          admin,
          `/api/admin/mail/campaigns/${sendId}/send${qs}`,
          { method: "POST" }
        );
        const data = (await res.json()) as {
          error?: string;
          sent?: number;
          failed?: number;
        };
        if (!res.ok) throw new Error(data.error ?? "send failed");
        setMessage(
          test
            ? `Test sent to ${testEmail}.`
            : `Sent to ${data.sent ?? 0} (${data.failed ?? 0} failed).`
        );
        await loadLists();
      });
    } catch {
      // save() already recorded the error message
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Mail</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subscribers.length} subscriber
            {subscribers.length === 1 ? "" : "s"} · Cursor-clean notes from
            notes@duyet.net
          </p>
        </div>
        <Link
          to="/data"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Data
        </Link>
      </header>

      <TemplatePicker
        templates={templates}
        templateId={templateId}
        template={template}
        onApply={applyTemplate}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <ContentPicker content={content} picks={picks} onToggle={togglePick} />

        <section className="space-y-3">
          <label className="block text-sm">
            Subject
            <input
              className={`${fieldClass} mt-1`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Preheader
            <input
              className={`${fieldClass} mt-1`}
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Notes for AI / extra copy
            <textarea
              className={`${fieldClass} mt-1 min-h-20`}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Paste a thought, or rely on picked content."
            />
          </label>
          <label className="block text-sm">
            Body (markdown)
            <textarea
              className={`${fieldClass} mt-1 min-h-48 font-mono text-[13px]`}
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              Button
              <input
                className={`${fieldClass} mt-1`}
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Button URL
              <input
                className={`${fieldClass} mt-1`}
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
              />
            </label>
          </div>
        </section>

        <PreviewFrame previewHtml={previewHtml} />
      </div>

      <MailActionBar
        busy={busy}
        subscriberCount={subscribers.length}
        testEmail={testEmail}
        onTestEmailChange={setTestEmail}
        message={message}
        onWrap={() => void wrap()}
        onPreview={() => void preview()}
        onSave={() => void save()}
        onSend={(test) => void send(test)}
      />

      <SubscriberTable subscribers={subscribers} />
      <CampaignList campaigns={campaigns} />
    </div>
  );
}
