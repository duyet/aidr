import { Link, useNavigate } from "@tanstack/react-router";
import { useLang } from "../../lib/lang-context";
import { ContributionsList } from "./ContributionsList";
import { SubmitForm } from "./SubmitForm";

/** Signed-in /contribute: the reader's history ("list") or the story form
 *  ("new", its own page at /contribute/new). */
export function SubmitGate({
  useUser,
  useAuth,
  mode = "list",
}: {
  useUser: any;
  useAuth: any;
  mode?: "list" | "new";
}) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const lang = useLang();
  const vi = lang === "vi";
  const navigate = useNavigate();
  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        {vi ? "Đăng nhập để gửi bài." : "Sign in to submit a story."}
      </p>
    );
  }
  const userName = user.fullName ?? user.username ?? "user";
  if (mode === "new") {
    return (
      <div className="max-w-xl">
        <SubmitForm
          userId={user.id}
          userName={userName}
          getToken={getToken}
          onSubmitted={() =>
            void navigate({ to: "/contribute", search: { lang } })
          }
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {vi ? "Đóng góp của bạn" : "Your contributions"}
        </h2>
        <Link
          to="/contribute/new"
          search={{ lang }}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
        >
          {vi ? "Gửi bài" : "Submit a story"}
        </Link>
      </div>
      <ContributionsList lang={lang} getToken={getToken} refreshKey={0} />
    </div>
  );
}
