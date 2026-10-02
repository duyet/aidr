import { useCallback, useEffect, useState } from "react";
import { bearerHeaders } from "../../lib/clerk-user";
import { fetchContributorEmails } from "../../lib/contribute-email-fn";
import { SUBMIT_EMAIL } from "../../lib/site";

/**
 * Addresses Clerk has already verified for this account. Mail to
 * submit@aidr.today is accepted from those addresses only.
 */
export function ContributorEmails({
  lang,
  getToken,
}: {
  lang: "en" | "vi";
  getToken: () => Promise<string | null>;
}) {
  const vi = lang === "vi";
  const [rows, setRows] = useState<string[] | null>(null);

  const reload = useCallback(async () => {
    const token = await getToken();
    setRows(await fetchContributorEmails(bearerHeaders(token)));
  }, [getToken]);

  useEffect(() => {
    reload().catch(() => setRows([]));
  }, [reload]);

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-sm">
        {vi ? "Đóng góp qua email" : "Contribute by email"}
      </h2>
      <p className="text-muted-foreground text-sm">
        {vi
          ? `Chuyển tiếp tin, hoặc trả lời email của chúng tôi, tới ${SUBMIT_EMAIL}. Chỉ các địa chỉ Clerk đã xác minh trên tài khoản này được chấp nhận.`
          : `Forward news, or reply to our mail, to ${SUBMIT_EMAIL}. We accept mail only from addresses Clerk has already verified on this account.`}
      </p>
      {rows && rows.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((email) => (
            <li key={email} className="px-3 py-2">
              <span className="block truncate">{email}</span>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && (
        <p className="text-muted-foreground text-xs">
          {vi
            ? "Chưa có địa chỉ đã xác minh. Thêm email trong tài khoản Clerk; lần đồng bộ sau sẽ nhận địa chỉ đó."
            : "No verified address yet. Add one on your Clerk account; the next sync picks it up."}
        </p>
      )}
    </section>
  );
}
