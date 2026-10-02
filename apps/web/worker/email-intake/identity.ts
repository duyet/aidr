import { nn } from "../d1-bind.js";

export function normalizeEmail(address: string): string {
  return address.trim().toLowerCase();
}

/** Display name for rows that show one: the last name the user contributed
 *  under on the web, else "reader". Email gives us no trusted name. */
export async function contributorName(
  db: D1Database,
  userId: string
): Promise<string> {
  const named = await db
    .prepare(
      `SELECT user_name FROM (
         SELECT user_name, created_at FROM submissions WHERE user_id = ?1 AND user_name IS NOT NULL
         UNION ALL
         SELECT user_name, created_at FROM translation_suggestions WHERE user_id = ?1 AND user_name IS NOT NULL
       ) ORDER BY created_at DESC LIMIT 1`
    )
    .bind(nn(userId))
    .first<{ user_name: string }>();
  return named?.user_name || "reader";
}
