export function normalizeEmail(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * The account id an address belongs to, or null. Accepted: a live Clerk
 * account's email that Clerk marks verified (exactly one row; duplicates are
 * ambiguous and drop; an unverified account email is a stranger), or
 * any other address Clerk has already verified on that account
 * (`clerk_verified_emails`). Addresses we have not seen as verified count
 * as strangers.
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

  const { results: verified } = await db
    .prepare(
      `SELECT e.user_id FROM clerk_verified_emails e
       JOIN clerk_users u ON u.id = e.user_id AND u.deleted_at IS NULL
       WHERE e.email = ?
       LIMIT 2`
    )
    .bind(email)
    .all<{ user_id: string }>();
  if (verified.length !== 1) return null;
  return verified[0].user_id;
}
