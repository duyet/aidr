export function normalizeEmail(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * The account id an address belongs to, or null. Accepted: a live Clerk
 * account's email that Clerk marks verified (exactly one row; duplicates are
 * ambiguous and drop; an unverified account email is a stranger), or
 * an extra address the user confirmed, owned by a live account. Pending or
 * expired extra addresses count as strangers.
 */
export async function resolveSender(
  db: D1Database,
  address: string
): Promise<string | null> {
  const email = normalizeEmail(address);
  if (!email.includes("@")) return null;

  const { results: clerk } = await db
    .prepare(
      "SELECT id, email_verified FROM clerk_users WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 2"
    )
    .bind(email)
    .all<{ id: string; email_verified: number }>();
  if (clerk.length > 1) return null;
  if (clerk.length === 1) {
    return clerk[0].email_verified === 1 ? clerk[0].id : null;
  }

  const alias = await db
    .prepare(
      `SELECT c.user_id FROM contributor_emails c
       JOIN clerk_users u ON u.id = c.user_id AND u.deleted_at IS NULL
       WHERE c.email = ? AND c.status = 'confirmed'`
    )
    .bind(email)
    .first<{ user_id: string }>();
  return alias?.user_id ?? null;
}
