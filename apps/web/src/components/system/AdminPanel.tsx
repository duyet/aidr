import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { type AdminState, authedFetch } from "../../lib/admin";
import { AdminAction } from "./admin/AdminAction";
import { AdminAudit } from "./admin/AdminAudit";
import { AdminItems } from "./admin/AdminItems";
import { AdminLlmCalls } from "./admin/AdminLlmCalls";
import { AdminQueue } from "./admin/AdminQueue";
import {
  AdminLastRunSteps,
  AdminStatusJson,
  AdminTelegramStatus,
} from "./admin/AdminStatus";
import {
  type AuditRow,
  adminBtnClass,
  type LlmCall,
  type ModerationItem,
  type QueueSubmission,
  type QueueSuggestion,
  type RateDraft,
} from "./admin/lib";

export function AdminPanel({ admin }: { admin: AdminState }) {
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [rescoreBusy, setRescoreBusy] = useState(false);
  const [rescoreResult, setRescoreResult] = useState<string | null>(null);
  const [retranslateBusy, setRetranslateBusy] = useState(false);
  const [retranslateResult, setRetranslateResult] = useState<string | null>(
    null
  );
  const [tldrBusy, setTldrBusy] = useState(false);
  const [tldrResult, setTldrResult] = useState<string | null>(null);
  const [clerkBusy, setClerkBusy] = useState(false);
  const [clerkResult, setClerkResult] = useState<string | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [status, setStatus] = useState<unknown>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [calls, setCalls] = useState<LlmCall[]>([]);
  const [callsBusy, setCallsBusy] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [itemActionBusyId, setItemActionBusyId] = useState<string | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, RateDraft>>({});
  const [queueSuggestions, setQueueSuggestions] = useState<QueueSuggestion[]>(
    []
  );
  const [queueSubmissions, setQueueSubmissions] = useState<QueueSubmission[]>(
    []
  );
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueActionBusyId, setQueueActionBusyId] = useState<string | null>(
    null
  );

  async function loadStatus() {
    setStatusBusy(true);
    try {
      const res = await authedFetch(admin, "/api/admin/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // leave previous status in place
    } finally {
      setStatusBusy(false);
    }
  }

  async function loadCalls() {
    setCallsBusy(true);
    try {
      const res = await authedFetch(admin, "/api/admin/llm-calls?limit=100");
      if (res.ok) {
        const data = (await res.json()) as { calls?: LlmCall[] };
        setCalls(Array.isArray(data.calls) ? data.calls : []);
      }
    } catch {
      // leave previous calls in place
    } finally {
      setCallsBusy(false);
    }
  }

  async function loadAudit() {
    try {
      const res = await authedFetch(admin, "/api/admin/audit");
      if (res.ok) {
        const data = (await res.json()) as { audit?: AuditRow[] };
        setAudit(Array.isArray(data.audit) ? data.audit : []);
      }
    } catch {
      // keep previous
    }
  }

  async function loadQueue() {
    setQueueBusy(true);
    try {
      const [sRes, subRes] = await Promise.all([
        authedFetch(admin, "/api/admin/suggestions?limit=50"),
        authedFetch(admin, "/api/admin/submissions?limit=50"),
      ]);
      if (sRes.ok) {
        const data = (await sRes.json()) as {
          suggestions?: QueueSuggestion[];
        };
        setQueueSuggestions(
          Array.isArray(data.suggestions) ? data.suggestions : []
        );
      }
      if (subRes.ok) {
        const data = (await subRes.json()) as {
          submissions?: QueueSubmission[];
        };
        setQueueSubmissions(
          Array.isArray(data.submissions) ? data.submissions : []
        );
      }
    } catch {
      // leave previous queue in place
    } finally {
      setQueueBusy(false);
    }
  }

  async function decideQueue(
    kind: "suggestions" | "submissions",
    id: string,
    action: "approve" | "reject"
  ) {
    setQueueActionBusyId(id);
    try {
      const res = await authedFetch(admin, `/api/admin/${kind}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) await loadQueue();
    } finally {
      setQueueActionBusyId(null);
    }
  }

  async function loadItems() {
    setItemsBusy(true);
    try {
      const res = await authedFetch(admin, "/api/admin/items?limit=50");
      if (res.ok) {
        const data = (await res.json()) as { items?: ModerationItem[] };
        setItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // leave previous items in place
    } finally {
      setItemsBusy(false);
    }
  }

  async function refreshAll() {
    setRefreshError(false);
    try {
      await Promise.all([
        loadStatus(),
        loadCalls(),
        loadItems(),
        loadAudit(),
        loadQueue(),
      ]);
    } catch {
      setRefreshError(true);
    }
  }

  async function moderateItem(
    id: string,
    body: Record<string, unknown>
  ): Promise<void> {
    setItemActionBusyId(id);
    try {
      const res = await authedFetch(admin, "/api/admin/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (res.ok) {
        const updated = (await res.json()) as ModerationItem;
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...updated } : item))
        );
      }
    } catch {
      // leave item state unchanged on failure
    } finally {
      setItemActionBusyId(null);
    }
  }

  function rateDraft(id: string) {
    return rateDrafts[id] ?? { importance: "", quality: "" };
  }

  function setRateDraft(
    id: string,
    field: "importance" | "quality",
    value: string
  ) {
    setRateDrafts((prev) => ({
      ...prev,
      [id]: { ...rateDraft(id), [field]: value },
    }));
  }

  async function applyRate(id: string) {
    const draft = rateDraft(id);
    const payload: Record<string, unknown> = { action: "rate" };
    if (draft.importance !== "") payload.importance = Number(draft.importance);
    if (draft.quality !== "") payload.quality = Number(draft.quality);
    await moderateItem(id, payload);
  }

  async function triggerIngest() {
    setIngestBusy(true);
    setIngestResult(null);
    try {
      const res = await authedFetch(admin, "/api/admin/ingest", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      setIngestResult(
        res.ok
          ? `ok — ${JSON.stringify(data)}`
          : `error (${res.status}) — ${JSON.stringify(data)}`
      );
      await loadStatus();
    } catch {
      setIngestResult("error — request failed");
    } finally {
      setIngestBusy(false);
    }
  }

  async function reprocess(
    steps: ("score" | "translate")[],
    setBusy: (busy: boolean) => void,
    setResult: (result: string | null) => void
  ) {
    setBusy(true);
    setResult(null);
    try {
      const res = await authedFetch(admin, "/api/admin/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      const data = await res.json().catch(() => null);
      setResult(
        res.ok
          ? `ok — ${JSON.stringify(data)}`
          : `error (${res.status}) — ${JSON.stringify(data)}`
      );
      await loadStatus();
    } catch {
      setResult("error — request failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendTelegramDigest() {
    setNotifyBusy(true);
    setNotifyResult(null);
    try {
      const res = await authedFetch(admin, "/api/admin/notify/digest", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      setNotifyResult(
        res.ok
          ? `ok — ${JSON.stringify(data)}`
          : `error (${res.status}) — ${JSON.stringify(data)}`
      );
      await loadStatus();
    } catch {
      setNotifyResult("error — request failed");
    } finally {
      setNotifyBusy(false);
    }
  }

  async function regenerateTldr() {
    setTldrBusy(true);
    setTldrResult(null);
    try {
      const res = await authedFetch(admin, "/api/admin/tldr/regenerate", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      setTldrResult(
        res.ok
          ? `ok — ${JSON.stringify(data)}`
          : `error (${res.status}) — ${JSON.stringify(data)}`
      );
      await loadStatus();
    } catch {
      setTldrResult("error — request failed");
    } finally {
      setTldrBusy(false);
    }
  }

  /** One-shot backfill of the D1 Clerk mirror. Webhooks keep it current after
   *  this; it only exists so the signups metric is real from day one. */
  async function syncClerkUsers() {
    setClerkBusy(true);
    setClerkResult(null);
    try {
      const res = await authedFetch(admin, "/api/admin/clerk-sync", {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as {
        synced?: number;
        pages?: number;
        error?: string;
      } | null;
      setClerkResult(
        res.ok
          ? `ok — ${data?.synced ?? 0} accounts over ${data?.pages ?? 0} pages`
          : `error (${res.status}) — ${data?.error ?? "request failed"}`
      );
      await loadStatus();
    } catch {
      setClerkResult("error — request failed");
    } finally {
      setClerkBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Admin</h3>
        <div className="flex items-center gap-2">
          <Link to="/mail" className={adminBtnClass}>
            Mail
          </Link>
          <button
            type="button"
            onClick={refreshAll}
            disabled={statusBusy || callsBusy || itemsBusy}
            className={adminBtnClass}
          >
            {statusBusy || callsBusy || itemsBusy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <AdminAction
        busy={ingestBusy}
        busyLabel="Triggering…"
        label="Trigger ingest"
        onClick={triggerIngest}
        result={ingestResult}
        className="mt-3 flex items-center gap-2"
      />
      <AdminAction
        busy={rescoreBusy}
        busyLabel="Re-scoring…"
        label="Re-score today"
        onClick={() => reprocess(["score"], setRescoreBusy, setRescoreResult)}
        result={rescoreResult}
      />
      <AdminAction
        busy={retranslateBusy}
        busyLabel="Re-translating…"
        label="Re-translate today"
        onClick={() =>
          reprocess(["translate"], setRetranslateBusy, setRetranslateResult)
        }
        result={retranslateResult}
      />
      <AdminAction
        busy={tldrBusy}
        busyLabel="Regenerating…"
        label="Regenerate AI;DR"
        onClick={regenerateTldr}
        result={tldrResult}
      />
      <AdminAction
        busy={notifyBusy}
        busyLabel="Sending…"
        label="Send Telegram digest"
        onClick={sendTelegramDigest}
        result={notifyResult}
      />
      <AdminAction
        busy={clerkBusy}
        busyLabel="Syncing…"
        label="Sync Clerk users"
        onClick={syncClerkUsers}
        result={clerkResult}
      />

      {refreshError && (
        <p className="mt-2 text-xs text-muted-foreground">Refresh failed.</p>
      )}

      <AdminTelegramStatus status={status} />
      <AdminAudit audit={audit} />
      <AdminLastRunSteps status={status} />
      <AdminStatusJson status={status} />
      <AdminLlmCalls calls={calls} />
      <AdminQueue
        suggestions={queueSuggestions}
        submissions={queueSubmissions}
        busy={queueBusy}
        actionBusyId={queueActionBusyId}
        onRefresh={loadQueue}
        onDecide={decideQueue}
      />
      <AdminItems
        items={items}
        busy={itemsBusy}
        actionBusyId={itemActionBusyId}
        rateDraft={rateDraft}
        onRateDraft={setRateDraft}
        onApplyRate={applyRate}
        onModerate={moderateItem}
        onRefresh={loadItems}
      />
    </div>
  );
}
