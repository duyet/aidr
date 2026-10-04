import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { bearerHeaders, useClerkModule } from "../../lib/clerk-user";
import { withLang } from "../../lib/locale-url";
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

function signInHref(lang: Lang): string {
  return withLang("/sign-in", lang);
}

/** Feed rows are `items-baseline`. A 32px button lifts the chevron off the title. */
function voteHit(compact: boolean | undefined, pressed = false) {
  const box = compact
    ? "inline-flex h-5 w-5 items-center justify-center rounded-sm"
    : "inline-flex size-8 items-center justify-center rounded-md hover:bg-muted";
  const tone = pressed
    ? "text-foreground"
    : "text-muted-foreground hover:text-foreground";
  return `${box} ${tone}`;
}

function VoteIcon({
  direction,
  compact,
}: {
  direction: "up" | "down";
  compact?: boolean;
}) {
  const className = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return <Icon className={className} aria-hidden />;
}

/** The feed row header is a button. A vote control inside it must not toggle the row. */
function keepRowClosed(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

function signInLabel(lang: Lang): string {
  return lang === "vi" ? "Đăng nhập để bình chọn" : "Sign in to vote";
}

function voteLabel(lang: Lang, value: 1 | -1, pressed: boolean): string {
  if (lang === "vi") {
    if (value === 1) return pressed ? "Bỏ phiếu lên" : "Bình chọn lên";
    return pressed ? "Bỏ phiếu xuống" : "Bình chọn xuống";
  }
  if (value === 1) return pressed ? "Remove upvote" : "Upvote";
  return pressed ? "Remove downvote" : "Downvote";
}

function VoteCount({ voteNet, lang }: { voteNet: number; lang: Lang }) {
  const label = lang === "vi" ? "Tổng phiếu" : "Reader votes";
  return (
    <span className="min-w-6 text-center text-xs tabular-nums text-muted-foreground">
      <span className="sr-only">{label} </span>
      {voteNet}
    </span>
  );
}

function SignInVotes({
  voteNet,
  lang,
  compact,
}: {
  voteNet: number;
  lang: Lang;
  compact?: boolean;
}) {
  const href = signInHref(lang);
  const label = signInLabel(lang);
  return (
    <span className="inline-flex items-center self-center">
      <a
        href={href}
        className={voteHit(compact)}
        aria-label={label}
        title={label}
        onClick={keepRowClosed}
        onKeyDown={keepRowClosed}
      >
        <VoteIcon direction="up" compact={compact} />
      </a>
      <VoteCount voteNet={voteNet} lang={lang} />
      <a
        href={href}
        className={voteHit(compact)}
        aria-label={label}
        title={label}
        onClick={keepRowClosed}
        onKeyDown={keepRowClosed}
      >
        <VoteIcon direction="down" compact={compact} />
      </a>
      {!compact && (
        <a
          href={href}
          className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={keepRowClosed}
          onKeyDown={keepRowClosed}
        >
          {label}
        </a>
      )}
    </span>
  );
}

function SignedInVotes({
  itemId,
  voteNet,
  lang,
  compact,
  getToken,
}: {
  itemId: string;
  voteNet: number;
  lang: Lang;
  compact?: boolean;
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

  async function click(value: 1 | -1) {
    if (busy || mine === null) return;
    const prevMine = mine;
    const prevNet = net;
    const nextMine: Mine = mine === value ? 0 : value;
    setMine(nextMine);
    setNet(net - mine + nextMine);
    setBusy(true);
    try {
      const token = await getTokenRef.current();
      const result = await castStoryVote({
        data: { item_id: itemId, value },
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
    <span className="inline-flex items-center self-center">
      <button
        type="button"
        className={voteHit(compact, mine === 1)}
        aria-pressed={mine === 1}
        aria-label={voteLabel(lang, 1, mine === 1)}
        disabled={busy || mine === null}
        onClick={(event) => {
          keepRowClosed(event);
          void click(1);
        }}
        onKeyDown={keepRowClosed}
      >
        <VoteIcon direction="up" compact={compact} />
      </button>
      <VoteCount voteNet={net} lang={lang} />
      <button
        type="button"
        className={voteHit(compact, mine === -1)}
        aria-pressed={mine === -1}
        aria-label={voteLabel(lang, -1, mine === -1)}
        disabled={busy || mine === null}
        onClick={(event) => {
          keepRowClosed(event);
          void click(-1);
        }}
        onKeyDown={keepRowClosed}
      >
        <VoteIcon direction="down" compact={compact} />
      </button>
    </span>
  );
}

function ClerkVotes({
  itemId,
  voteNet,
  lang,
  compact,
  mod,
}: {
  itemId: string;
  voteNet: number;
  lang: Lang;
  compact?: boolean;
  mod: NonNullable<ReturnType<typeof useClerkModule>["mod"]>;
}) {
  const { SignedIn, SignedOut, useAuth } = mod;
  return (
    <>
      <SignedOut>
        <SignInVotes voteNet={voteNet} lang={lang} compact={compact} />
      </SignedOut>
      <SignedIn>
        <AuthedVotes
          itemId={itemId}
          voteNet={voteNet}
          lang={lang}
          compact={compact}
          useAuth={useAuth}
        />
      </SignedIn>
    </>
  );
}

function AuthedVotes({
  itemId,
  voteNet,
  lang,
  compact,
  useAuth,
}: {
  itemId: string;
  voteNet: number;
  lang: Lang;
  compact?: boolean;
  useAuth: () => { getToken: () => Promise<string | null> };
}) {
  const { getToken } = useAuth();
  return (
    <SignedInVotes
      itemId={itemId}
      voteNet={voteNet}
      lang={lang}
      compact={compact}
      getToken={getToken}
    />
  );
}

/** Up / down and the net. Signed-out controls link to sign-in and store nothing. */
export function StoryVotes({
  itemId,
  voteNet,
  lang,
  compact,
}: {
  itemId: string;
  voteNet: number;
  lang: Lang;
  compact?: boolean;
}) {
  const { mod, publishableKey } = useClerkModule();
  if (!mod || !publishableKey) {
    return <SignInVotes voteNet={voteNet} lang={lang} compact={compact} />;
  }
  return (
    <ClerkVotes
      itemId={itemId}
      voteNet={voteNet}
      lang={lang}
      compact={compact}
      mod={mod}
    />
  );
}
