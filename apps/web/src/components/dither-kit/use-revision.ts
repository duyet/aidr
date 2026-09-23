import { useState } from "react"

/** A counter that advances whenever `data` changes identity or `token` advances
 * — drives entrance replays without remounting. Uses the adjust-state-during-
 * render pattern (https://react.dev/reference/react/useState) instead of a ref:
 * the revision is derived purely from render inputs, so it stays consistent
 * with the caller's memoized values rather than lagging a render behind. */
export function useRevision(data: unknown, token: number) {
  const [prev, setPrev] = useState({ data, token, revision: 0 })
  if (prev.data !== data || prev.token !== token) {
    const next = { data, token, revision: prev.revision + 1 }
    setPrev(next)
    return next.revision
  }
  return prev.revision
}
