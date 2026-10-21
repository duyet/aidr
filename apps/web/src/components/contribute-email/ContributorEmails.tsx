import { useCallback, useEffect, useState } from "react";
import { bearerHeaders } from "../../lib/clerk-user";
import {
  fetchContributorEmails,
  syncContributorEmails,
} from "../../lib/contribute-email-fn";
import { SUBMIT_EMAIL } from "../../lib/site";

interface PendingAddress {
  prepareVerification: (params: { strategy: "email_code" }) => Promise<unknown>;
  attemptVerification: (params: {
    code: string;
  }) => Promise<{ verification?: { status?: string | null } | null }>;
  destroy: () => Promise<unknown>;
}

interface AccountUser {
  createEmailAddress: (params: { email: string }) => Promise<PendingAddress>;
  reload?: () => Promise<unknown>;
}

function clerkMessage(error: unknown, fallback: string): string {
  const first = (error as { errors?: { longMessage?: string }[] })?.errors?.[0];
  return first?.longMessage || fallback;
}

/**
 * Addresses Clerk has already verified for this account, and a form to add
 * more. Mail to submit@aidr.today is accepted from those addresses only; a new
 * address is verified by Clerk's email code, never by a mail of ours.
 */
export function ContributorEmails({
  lang,
  getToken,
  user,
}: {
  lang: "en" | "vi";
  getToken: () => Promise<string | null>;
  user?: AccountUser | null;
}) {
  const vi = lang === "vi";
  const [rows, setRows] = useState<string[] | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = await getToken();
    setRows(await fetchContributorEmails(bearerHeaders(token)));
  }, [getToken]);

  useEffect(() => {
    reload().catch(() => setRows([]));
  }, [reload]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const trimmed = email.trim();
      const address = await user.createEmailAddress({ email: trimmed });
      await address.prepareVerification({ strategy: "email_code" });
      setEmail(trimmed);
      setPending(address);
    } catch (err) {
      setError(
        clerkMessage(
          err,
          vi ? "Không thêm được địa chỉ này." : "Could not add this address."
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await pending.attemptVerification({ code: code.trim() });
      if (result.verification?.status !== "verified") {
        setError(vi ? "Mã chưa đúng." : "That code is not right.");
        return;
      }
      await user?.reload?.();
      const token = await getToken();
      const synced = await syncContributorEmails(bearerHeaders(token));
      setRows(synced.emails);
      setNotice(
        synced.synced
          ? vi
            ? "Đã xác minh. Địa chỉ này có thể gửi email tới chúng tôi."
            : "Verified. This address can now mail us."
          : vi
            ? "Đã xác minh. Địa chỉ sẽ được nhận sau lần đồng bộ tới."
            : "Verified. The address is accepted after the next sync."
      );
      setPending(null);
      setEmail("");
      setCode("");
    } catch (err) {
      setError(
        clerkMessage(
          err,
          vi ? "Không xác minh được địa chỉ." : "Could not verify the address."
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    const address = pending;
    setPending(null);
    setCode("");
    setError(null);
    await address?.destroy().catch(() => undefined);
  };

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  const button =
    "shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60";

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-sm">
        {vi ? "Đóng góp qua email" : "Contribute by email"}
      </h2>
      <p className="text-muted-foreground text-sm">
        {vi
          ? `Chuyển tiếp tin, hoặc trả lời email của chúng tôi, tới ${SUBMIT_EMAIL}. Chỉ các địa chỉ đã xác minh trên tài khoản này được chấp nhận. Bạn có thể thêm địa chỉ khác bên dưới.`
          : `Forward news, or reply to our mail, to ${SUBMIT_EMAIL}. We accept mail only from addresses verified on this account. You can add more below.`}
      </p>
      {rows && rows.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((address) => (
            <li key={address} className="px-3 py-2">
              <span className="block truncate">{address}</span>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && (
        <p className="text-muted-foreground text-xs">
          {vi
            ? "Chưa có địa chỉ đã xác minh. Thêm một địa chỉ bên dưới."
            : "No verified address yet. Add one below."}
        </p>
      )}
      {user &&
        (pending ? (
          <form onSubmit={verify} className="flex flex-wrap items-end gap-2">
            <label className="block min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                {vi ? `Mã đã gửi tới ${email}` : `Code sent to ${email}`}
              </span>
              <input
                id="contributor-email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={field}
                required
              />
            </label>
            <button type="submit" disabled={busy} className={button}>
              {vi ? "Xác minh" : "Verify"}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {vi ? "Hủy" : "Cancel"}
            </button>
          </form>
        ) : (
          <form onSubmit={send} className="flex flex-wrap items-end gap-2">
            <label className="block min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                {vi ? "Thêm địa chỉ email" : "Add an email address"}
              </span>
              <input
                id="contributor-email-add"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
                required
              />
            </label>
            <button type="submit" disabled={busy} className={button}>
              {vi ? "Gửi mã" : "Send code"}
            </button>
          </form>
        ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  );
}
