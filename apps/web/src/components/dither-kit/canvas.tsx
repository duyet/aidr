import { type RefObject, useEffect, useRef } from "react"
import type { ChartContextValue } from "./chart-context"
import type { BloomStyle } from "./dither-paint"

/** Sentinel for "no value yet" in the paint loops — identity-compared, so one
 * shared instance serves every watcher. */
export const UNSET = Symbol() as never

/** A ref that always holds the latest value — written in an effect (never
 * during render), because mutating a ref mid-render tears under Strict Mode /
 * concurrent rendering. The RAF loops read ctx/targets through these. */
export function useLiveRef<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

/** Sizes the crisp + bloom backing canvases and hands back their contexts —
 * null when the main context (or the backing grid) isn't drawable yet. */
export function setupCanvasLayers(
  canvas: HTMLCanvasElement | null,
  bloomCanvas: HTMLCanvasElement | null,
  cols: number,
  rows: number
): {
  c: CanvasRenderingContext2D
  bloomCtx: CanvasRenderingContext2D | null
} | null {
  const c = canvas?.getContext("2d")
  if (!canvas || !c || cols <= 0 || rows <= 0) return null
  canvas.width = cols
  canvas.height = rows
  const bloomCtx = bloomCanvas?.getContext("2d") ?? null
  if (bloomCanvas) {
    bloomCanvas.width = cols
    bloomCanvas.height = rows
  }
  return { c, bloomCtx }
}

/** Mirror the crisp canvas into the bloom layer (it stays blurred/additive). */
export function copyBloomFrame(
  bloomCtx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cols: number,
  rows: number
) {
  bloomCtx.clearRect(0, 0, cols, rows)
  bloomCtx.drawImage(canvas, 0, 0)
}

/** One step of exponential easing toward `target` — snaps on arrival. */
export function easeToward(
  current: number,
  target: number,
  step: number
): { value: number; moving: boolean } {
  if (Math.abs(current - target) > 0.001) {
    return { value: current + (target - current) * step, moving: true }
  }
  return { value: target, moving: false }
}

/** Repaint signature for cartesian surfaces — variant/stacking tweaks repaint
 * live without replaying the entrance. */
export function cartesianPaintSig(s: ChartContextValue) {
  return `${s.stackType}|${s.configKeys
    .map((k) => s.seriesSpecs[k]?.variant ?? "")
    .join(",")}`
}

/** The crisp pixelated backing canvas plus its bloom layer — the pair every
 * family canvas renders at the same plot position. */
export function CanvasPair({
  canvasRef,
  bloomRef,
  pos,
  bloom,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  bloomRef: RefObject<HTMLCanvasElement | null>
  pos: { left: number; top: number; width: number; height: number }
  bloom: BloomStyle | null
}) {
  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        style={{ ...pos, imageRendering: "pixelated" }}
      />
      <canvas
        ref={bloomRef}
        className="pointer-events-none absolute"
        style={{
          ...pos,
          transition: "opacity 220ms ease",
          ...(bloom ?? { opacity: 0 }),
        }}
      />
    </>
  )
}
