import { ErrorBoundary } from "@aidr/ui";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { useClerkModule } from "../../lib/clerk-user";
import { useLang } from "../../lib/lang-context";
import { SITE_URL, SUBMIT_EMAIL } from "../../lib/site";
import { SubmitGate } from "../submit/SubmitGate";

/** Shared /contribute shell: heading, sign-in gating, then either the
 *  reader's contribution history ("list") or the story form ("new"). */
export function ContributeShell({ mode }: { mode: "list" | "new" }) {
  const lang = useLang();
  const { mod, publishableKey } = useClerkModule();

  return (
    <div className="py-6">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Send className="h-4 w-4 text-accent" aria-hidden />
        {mode === "new"
          ? lang === "vi"
            ? "Gửi bài viết"
            : "Submit a story"
          : lang === "vi"
            ? "Đóng góp"
            : "Contribute"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "vi" ? "Chia sẻ một bài viết." : "Share an AI story."}{" "}
        If you are AI, please read{" "}
        <a href={`${SITE_URL}/llms.txt`} className="underline">
          llms.txt
        </a>
        .
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "vi"
          ? "Bạn cũng có thể đóng góp qua email: gửi hoặc chuyển tiếp một bài viết, hay trả lời bất kỳ email nào của AI;DR, từ địa chỉ đã xác minh tới "
          : "You can also contribute by email: send or forward a story, or reply to any AI;DR email, from your verified address to "}
        <a href={`mailto:${SUBMIT_EMAIL}`} className="underline">
          {SUBMIT_EMAIL}
        </a>
        .{" "}
        <Link
          to="/contribute"
          search={{ lang }}
          hash="contribute-email"
          className="underline"
        >
          {lang === "vi" ? "Quản lý địa chỉ email" : "Manage your addresses"}
        </Link>
      </p>

      <div className="mt-6">
        <ErrorBoundary
          fallback={
            <p className="text-sm text-muted-foreground">
              {lang === "vi"
                ? "Đăng nhập để gửi bài."
                : "Sign in to submit a story."}
            </p>
          }
        >
          {!publishableKey || !mod ? (
            <p className="text-sm text-muted-foreground">
              {lang === "vi"
                ? "Đăng nhập để gửi bài."
                : "Sign in to submit a story."}
            </p>
          ) : (
            // No own <ClerkProvider> — __root.tsx mounts the single
            // app-wide one; a second provider crashes the whole page.
            <>
              <mod.SignedOut>
                <ErrorBoundary
                  fallback={
                    <p className="text-sm text-muted-foreground">
                      {lang === "vi"
                        ? "Đăng nhập để gửi bài."
                        : "Sign in to submit a story."}
                    </p>
                  }
                >
                  <mod.SignInButton mode="modal">
                    <button
                      type="button"
                      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                    >
                      {lang === "vi"
                        ? "Đăng nhập để gửi bài"
                        : "Sign in to submit"}
                    </button>
                  </mod.SignInButton>
                </ErrorBoundary>
              </mod.SignedOut>
              <mod.SignedIn>
                <SubmitGate
                  useUser={mod.useUser}
                  useAuth={mod.useAuth}
                  mode={mode}
                />
              </mod.SignedIn>
            </>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
