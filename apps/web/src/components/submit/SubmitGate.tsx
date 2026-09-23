import { useState } from "react";
import { useLang } from "../../lib/lang-context";
import { SubmissionsList } from "./SubmissionsList";
import { SubmitForm } from "./SubmitForm";

export function SubmitGate({
  useUser,
  useAuth,
}: {
  useUser: any;
  useAuth: any;
}) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const lang = useLang();
  const [listKey, setListKey] = useState(0);
  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "vi" ? "Đăng nhập để gửi bài." : "Sign in to submit a story."}
      </p>
    );
  }
  const userName = user.fullName ?? user.username ?? "user";
  return (
    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
      <SubmitForm
        userId={user.id}
        userName={userName}
        getToken={getToken}
        onSubmitted={() => setListKey((n) => n + 1)}
      />
      <SubmissionsList
        userId={user.id}
        lang={lang}
        getToken={getToken}
        refreshKey={listKey}
      />
    </div>
  );
}
