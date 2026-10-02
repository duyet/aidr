/**
 * aidr-email: the Email Routing target for submit@aidr.today. Validates the
 * sender and stores parsed fields in D1 (`inbound_emails`). The hourly
 * `inbound-email` step in the `aidr` Worker does everything else.
 * See docs/decisions/email-contributions.md.
 */
import { MAX_RAW_BYTES, receiveEmail } from "./intake.js";

interface Env {
  DB: D1Database;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (message.rawSize > MAX_RAW_BYTES) {
      // SMTP-time reject: the sending server reports it; we send nothing.
      message.setReject("Message too large");
      return;
    }
    const raw = await new Response(message.raw).arrayBuffer();
    const outcome = await receiveEmail(env.DB, {
      from: message.from,
      to: message.to,
      raw,
    });
    // No address, subject or body in logs.
    console.log(
      `inbound-email ${outcome.status}${outcome.status === "ignored" ? ` ${outcome.reason}` : ""}`
    );
  },
} satisfies ExportedHandler<Env>;
