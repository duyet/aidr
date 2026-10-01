import { useCallback, useEffect, useState } from "react";
import type { ContributorEmail } from "../../../worker/email-intake/aliases.js";
import { bearerHeaders } from "../../lib/clerk-user";
import {
  addContributorEmailFn,
  fetchContributorEmails,
  removeContributorEmailFn,
} from "../../lib/contribute-email-fn";
import { SUBMIT_EMAIL } from "../../lib/site";

/**
 * Extra addresses the signed-in reader may send contributions from, to
 * submit@aidr.today. Adding one mails a confirmation link to it; only
 * confirmed addresses are accepted. The account email always works.
 */
export function ContributorEmails({
  lang,
  getToken,
}: {
  lang: "en" | "vi";
  getToken: () => Promise<string | null>;
}) {
  const vi = lang === "vi";
  const [rows, setRows] = useState<ContributorEmail[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = await getToken();
    setRows(await fetchContributorEmails(bearerHeaders(token)));
  }, [getToken]);

  useEffect(() => {
    reload().catch(() => setRows([]));
  }, [reload]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = await getToken();
      await addContributorEmailFn({
        data: { email: email.trim() },
        ...bearerHeaders(token),
      });
      setEmail("");
      setMessage(
        vi
          ? "Đã gửi liên kết xác nhận tới địa chỉ này."
          : "We sent a confirmation link to that address."
      );
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const token = await getToken();
      await removeContributorEmailFn({ data: { id }, ...bearerHeaders(token) });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-sm">
        {vi ? "Đóng góp qua email" : "Contribute by email"}
      </h2>
      <p className="text-muted-foreground text-sm">
        {vi
          ? `Chuyển tiếp tin, hoặc trả lời email của chúng tôi để góp ý, tới ${SUBMIT_EMAIL}. Email tài khoản của bạn luôn được chấp nhận; thêm địa chỉ khác bên dưới.`
          : `Forward news, or reply to our mail with a fix or opinion, to ${SUBMIT_EMAIL}. Your account email always works; add other addresses below.`}
      </p>
      {rows && rows.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{row.email}</span>
              <span
                className={`text-xs ${row.status === "confirmed" ? "text-emerald-600" : "text-amber-600"}`}
              >
                {row.status === "confirmed"
                  ? vi
                    ? "đã xác nhận"
                    : "confirmed"
                  : vi
                    ? "chờ xác nhận"
                    : "pending"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(row.id)}
                className="text-muted-foreground text-xs hover:text-foreground"
              >
                {vi ? "Xoá" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          aria-label={vi ? "Địa chỉ email" : "Email address"}
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {vi ? "Thêm" : "Add"}
        </button>
      </form>
      {message && (
        <p role="status" className="text-muted-foreground text-xs">
          {message}
        </p>
      )}
    </section>
  );
}
