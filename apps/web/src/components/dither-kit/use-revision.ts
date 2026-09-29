import { useState } from "react"

/** Chart callers rebuild row arrays on every render (`data.map(...)`). An
 * identity check would setState during that render, React would render again,
 * and the fresh array would setState again — "Maximum update depth exceeded"
 * as soon as any chart with points is on screen. Compare the series values. */
function seriesSignature(data: unknown): string {
  return JSON.stringify(data) ?? ""
}

/** A counter that advances when chart `data` content or `token` changes —
 * drives entrance replays without remounting. Uses the adjust-state-during-
 * render pattern (https://react.dev/reference/react/useState) instead of a ref:
 * the revision is derived purely from render inputs, so it stays consistent
 * with the caller's memoized values rather than lagging a render behind. */
export function useRevision(data: unknown, token: number) {
  const signature = seriesSignature(data)
  const [prev, setPrev] = useState({ signature, token, revision: 0 })
  if (prev.signature !== signature || prev.token !== token) {
    const next = { signature, token, revision: prev.revision + 1 }
    setPrev(next)
    return next.revision
  }
  return prev.revision
}
