import { useHydrated } from "@tanstack/react-router";
import { ThumbsUp } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import {
  bearerHeaders,
  type ClerkModule,
  hasClerkSessionCookie,
  useClerkModule,
} from "../../lib/clerk-user";
import { signInHref } from "../../lib/sign-in-href";
import { storyPath } from "../../lib/slug";
import type { Lang } from "../../lib/types";
import { castStoryVote, fetchMyVotes } from "../../lib/vote-fn";

type Mine = -1 | 0 | 1;

const CHUNK = 90;
const mineCache = new Map<string, Mine>();
const netCache = new Map<string, number>();
const listeners = new Set<
  (itemId: string, mine: Mine, voteNet: number) => void
>();

type Waiter = (loaded: { mine: Mine; voteNet: number | null }) => void;
const waiters = new Map<string, Waiter[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let tokenReader: (() => Promise<string | null>) | null = null;

function publish(itemId: string, mine: Mine, voteNet: number) {
  mineCache.set(itemId, mine);
  netCache.set(itemId, voteNet);
  for (const listener of listeners) listener(itemId, mine, voteNet);
}

function loadMine(
  itemId: string,
  getToken: () => Promise<string | null>
): Promise<{ mine: Mine; voteNet: number | null }> {
  const mine = mineCache.get(itemId);
  if (mine !== undefined) {
    return Promise.resolve({ mine, voteNet: netCache.get(itemId) ?? null });
  }
  tokenReader = getToken;
  return new Promise((resolve) => {
    const list = waiters.get(itemId) ?? [];
    list.push(resolve);
    waiters.set(itemId, list);
    if (flushTimer === null) flushTimer = setTimeout(() => void flush(), 16);
  });
}

async function flush() {
  flushTimer = null;
  // Snapshot first. `waiters` is the live map, and a lookup that arrives
  // while this request is in flight has to stay queued for the next flush.
  const pending = new Map(waiters);
  waiters.clear();
  const ids = [...pending.keys()];
  const readToken = tokenReader;
  const deliver = (id: string, mine: Mine, voteNet: number | null) => {
    if (voteNet !== null) netCache.set(id, voteNet);
    mineCache.set(id, mine);
    for (const waiter of pending.get(id) ?? []) waiter({ mine, voteNet });
  };
  try {
    const token = readToken ? await readToken() : null;
    const votes: Record<string, -1 | 1> = {};
    const nets: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += CHUNK) {
      const page = await fetchMyVotes({
        data: { ids: ids.slice(i, i + CHUNK) },
        ...bearerHeaders(token),
      });
      Object.assign(votes, page.votes);
      Object.assign(nets, page.nets);
    }
    for (const id of ids) deliver(id, votes[id] ?? 0, nets[id] ?? 0);
  } catch {
    // Leave the cache empty so the next mount retries. Caching "no vote"
    // would make the next click clear a vote the server still holds.
    for (const id of ids) {
      for (const waiter of pending.get(id) ?? []) {
        waiter({ mine: 0, voteNet: null });
      }
    }
  }
}

const COPY = {
  en: {
    upvote: "Upvote",
    removeUpvote: "Remove upvote",
    pending: "Loading your vote",
    count: "Reader votes",
    signInTitle: "Sign in to vote",
    signInBody: "Votes help good stories rank higher.",
    signIn: "Sign in",
    close: "Close",
  },
  vi: {
    upvote: "Thích tin này",
    removeUpvote: "Bỏ thích tin này",
    pending: "Đang tải phiếu bầu của bạn",
    count: "Tổng phiếu",
    signInTitle: "Đăng nhập để bình chọn",
    signInBody: "Phiếu bầu giúp tin hay được xếp hạng cao hơn.",
    signIn: "Đăng nhập",
    close: "Đóng",
  },
} as const;

/** The feed row header is a button. A vote control inside it must not toggle the row. */
function keepRowClosed(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

/** One small thumbs-up + count, sized to the surrounding meta text. */
function Thumb({
  voteNet,
  lang,
  pressed,
  disabled,
  label,
  onClick,
}: {
  voteNet: number;
  lang: Lang;
  pressed?: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  const copy = COPY[lang];
  return (
    <button
      type="button"
      className={`inline-flex items-baseline gap-1 text-sm leading-none tabular-nums transition-colors disabled:opacity-60 ${
        pressed ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
      aria-pressed={pressed}
      aria-label={label ?? (pressed ? copy.removeUpvote : copy.upvote)}
      disabled={disabled}
      onClick={(event) => {
        keepRowClosed(event);
        onClick();
      }}
      onKeyDown={keepRowClosed}
    >
      <ThumbsUp className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden />
      <span>
        <span className="sr-only">{copy.count} </span>
        {Math.max(0, voteNet)}
      </span>
    </button>
  );
}

/** The reader may be signed in but Clerk has not said yet. Same box as the
 * live thumb, and nothing to click that could send them to /sign-in. */
function PendingVotes({ voteNet, lang }: { voteNet: number; lang: Lang }) {
  return (
    <Thumb
      voteNet={voteNet}
      lang={lang}
      pressed={false}
      disabled
      label={COPY[lang].pending}
      onClick={() => {}}
    />
  );
}

function SignInVotes({
  itemId,
  voteNet,
  lang,
}: {
  itemId: string;
  voteNet: number;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const copy = COPY[lang];
  return (
    <>
      <Thumb
        voteNet={voteNet}
        lang={lang}
        pressed={false}
        onClick={() => setOpen(true)}
      />
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
          {/* React events bubble through portals; keep clicks off the row. */}
          <DialogPrimitive.Content
            className="fixed top-1/2 left-1/2 z-50 w-[min(calc(100%-2rem),20rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-lg"
            onClick={keepRowClosed}
            onKeyDown={keepRowClosed}
          >
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              {copy.signInTitle}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
              {copy.signInBody}
            </DialogPrimitive.Description>
            <div className="mt-4 flex justify-end gap-2">
              <DialogPrimitive.Close className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                {copy.close}
              </DialogPrimitive.Close>
              <a
                href={signInHref(lang, storyPath({ id: itemId }, lang))}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {copy.signIn}
              </a>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function SignedInVotes({
  itemId,
  voteNet,
  lang,
  getToken,
}: {
  itemId: string;
  voteNet: number;
  lang: Lang;
  getToken: () => Promise<string | null>;
}) {
  const [net, setNet] = useState(voteNet);
  const [mine, setMine] = useState<Mine | null>(mineCache.get(itemId) ?? null);
  const [busy, setBusy] = useState(false);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    setNet(netCache.get(itemId) ?? voteNet);
  }, [itemId, voteNet]);

  useEffect(() => {
    let cancel = false;
    void loadMine(itemId, () => getTokenRef.current()).then((loaded) => {
      if (cancel) return;
      setMine(loaded.mine);
      if (loaded.voteNet !== null) setNet(loaded.voteNet);
    });
    return () => {
      cancel = true;
    };
  }, [itemId]);

  useEffect(() => {
    const onVote = (id: string, nextMine: Mine, nextNet: number) => {
      if (id !== itemId) return;
      setMine(nextMine);
      setNet(nextNet);
    };
    listeners.add(onVote);
    return () => {
      listeners.delete(onVote);
    };
  }, [itemId]);

  // Upvote only. The server toggles a repeated +1 back to no vote, so the
  // UI never sends -1. A legacy downvote is replaced by the +1.
  async function click() {
    if (busy || mine === null) return;
    const prevMine = mine;
    const prevNet = net;
    const nextMine: Mine = mine === 1 ? 0 : 1;
    setMine(nextMine);
    setNet(net - mine + nextMine);
    setBusy(true);
    try {
      const token = await getTokenRef.current();
      const result = await castStoryVote({
        data: { item_id: itemId, value: 1 },
        ...bearerHeaders(token),
      });
      publish(itemId, result.myVote, result.voteNet);
    } catch {
      setMine(prevMine);
      setNet(prevNet);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Thumb
      voteNet={net}
      lang={lang}
      pressed={mine === 1}
      disabled={busy || mine === null}
      onClick={() => void click()}
    />
  );
}

/** Clerk's <Show> renders nothing until Clerk loads, which would drop the
 * thumb out of the row, so this reads the same `useAuth` state directly. */
function ClerkVotes({
  itemId,
  voteNet,
  lang,
  useAuth,
}: {
  itemId: string;
  voteNet: number;
  lang: Lang;
  useAuth: ClerkModule["useAuth"];
}) {
  const { isLoaded, userId, getToken } = useAuth();
  if (!isLoaded) return <PendingVotes voteNet={voteNet} lang={lang} />;
  if (!userId) {
    return <SignInVotes itemId={itemId} voteNet={voteNet} lang={lang} />;
  }
  return (
    <SignedInVotes
      itemId={itemId}
      voteNet={voteNet}
      lang={lang}
      getToken={getToken}
    />
  );
}

/** A small thumbs-up and the count (floored at 0). Signed out, the click opens a sign-in dialog and stores nothing. A session cookie without the Clerk SDK yet gets a disabled thumb. The server cannot read that cookie, so the server and the hydrating render both show the signed-out thumb. */
export function StoryVotes({
  itemId,
  voteNet,
  lang,
}: {
  itemId: string;
  voteNet: number;
  lang: Lang;
}) {
  const { mod, publishableKey } = useClerkModule();
  const hydrated = useHydrated();
  if (!mod || !publishableKey) {
    if (publishableKey && hydrated && hasClerkSessionCookie(document.cookie)) {
      return <PendingVotes voteNet={voteNet} lang={lang} />;
    }
    return <SignInVotes itemId={itemId} voteNet={voteNet} lang={lang} />;
  }
  return (
    <ClerkVotes
      itemId={itemId}
      voteNet={voteNet}
      lang={lang}
      useAuth={mod.useAuth}
    />
  );
}
