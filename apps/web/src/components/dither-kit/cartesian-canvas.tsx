"use client"

import { useEffect, useMemo, useRef } from "react"
import { CanvasPair, useLiveRef } from "./canvas"
import {
  type Star,
  startCartesianLoop,
  type Surface,
} from "./cartesian-loop"
import { useChart } from "./chart-context"
import { backingSize, bloomLayerStyle, resample } from "./dither-paint"

/**
 * Continuous dither canvas for area and line charts. Each series is reduced to a
 * `[top, floor]` band per backing column: areas fill from their value line down
 * to their floor; lines fill only a thin glow band hugging the line. The shared
 * {@link paintColumn} renders the ordered-dither scatter, capped by the bright
 * series line, with winking stars + scrub crosshair on top.
 */
export function CartesianCanvas() {
  const ctx = useChart()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)

  const { width, height } = ctx.plot
  const { cols, rows } = backingSize(width, height)
  const { ready, chartType, configKeys, bands, seriesSpecs, y, dataLength } = ctx

  // Memoized: the pricey bit in the render path — a `resample` per series to
  // the backing column count. The canvas re-renders on every hover/cursor tick
  // (it consumes ctx), so without this the whole surface is rebuilt each time.
  // Pinned to the exact ctx fields it reads, plus the backing geometry.
  const targets = useMemo(() => {
    const out: Record<string, Surface> = {}
    if (!ready) return out
    const h = height || 1
    const glow = Math.max(6, Math.round(rows * 0.16))
    const defaultKind = chartType === "line" ? "line" : "area"
    for (const key of configKeys) {
      const band = bands[key]
      if (!band) continue
      const line = (seriesSpecs[key]?.kind ?? defaultKind) === "line"
      const top = band.map((b) => (y(b[1]) / h) * (rows - 1))
      const floor = band.map((b, i) =>
        line ? Math.min(rows - 1, top[i] + glow) : (y(b[0]) / h) * (rows - 1)
      )
      out[key] = { top: resample(top, cols), floor: resample(floor, cols) }
    }
    return out
  }, [ready, chartType, configKeys, bands, seriesSpecs, y, height, rows, cols])

  // Memoized: the star field is deterministic — only its shape (series ×
  // column count) matters, so it need not be rebuilt on unrelated re-renders.
  const stars = useMemo(() => {
    const out: Star[] = []
    const per = Math.max(4, Math.round(cols / 14))
    configKeys.forEach((key, k) => {
      for (let i = 0; i < per; i++) {
        const seed = i * 67 + 13 + k * 131
        out.push({
          key,
          xi: seed % Math.max(dataLength, 1),
          depth: ((seed * 53 + 7) % 100) / 100,
          phase: (seed * 41) % 360,
        })
      }
    })
    return out
  }, [configKeys, dataLength, cols])

  // The RAF loop reads these through refs so it always sees the latest values
  // without re-subscribing.
  const stateRef = useLiveRef(ctx)
  const targetsRef = useLiveRef(targets)
  const starsRef = useLiveRef(stars)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return startCartesianLoop({
      canvas,
      bloomCanvas: bloomRef.current,
      cols,
      rows,
      state: stateRef,
      targets: targetsRef,
      stars: starsRef,
    })
  }, [cols, rows])

  const bloomActive = ctx.bloomOnHover
    ? ctx.isMouseInChart || ctx.hovered
    : true
  const bloom = bloomLayerStyle(ctx.bloom, bloomActive)
  const pos = {
    left: ctx.margins.left,
    top: ctx.margins.top,
    width,
    height,
  } as const

  return (
    <CanvasPair
      canvasRef={canvasRef}
      bloomRef={bloomRef}
      pos={pos}
      bloom={bloom}
    />
  )
}
