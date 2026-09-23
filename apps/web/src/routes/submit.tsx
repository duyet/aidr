import { ErrorBoundary } from "@aidr/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { SubmitGate } from "../components/submit/SubmitGate";
import { useClerkModule } from "../lib/clerk-user";
import { useLang } from "../lib/lang-context";
import { pageHead } from "../lib/seo";

export const Route = createFileRoute("/submit")({
  head: () =>
    pageHead({
      path: "/submit",
      title: "Submit a story | AI News",
    }),
  component: SubmitPage,
});

function SubmitPage() {
  const lang = useLang();
  const { mod, publishableKey } = useClerkModule();

  return (
    <div className="py-6">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Send className="h-4 w-4 text-accent" aria-hidden />
        {lang === "vi" ? "Gửi bài viết" : "Submit a story"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "vi" ? "Chia sẻ một bài viết." : "Share an AI story."}{" "}
        {lang === "vi"
          ? "Local agent: xem /llms.txt — cùng form, set via=agent, cần đăng nhập."
          : "Local agents: see /llms.txt — same form, set via=agent, sign-in required."}
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
                <SubmitGate useUser={mod.useUser} useAuth={mod.useAuth} />
              </mod.SignedIn>
            </>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
