import { useCallback, useMemo, useState } from "react"
import type {
  ChartConfig,
  ChartContextValue,
  ChartType,
  Margins,
  SeriesSpec,
} from "./chart-context"
import type { CommonChart } from "./common-context"
import type { BloomInput } from "./dither-paint"
import { seedOfColor } from "./palette"
import {
  buildBandScale,
  buildXScale,
  buildYScale,
  computeBands,
  indexAtBand,
  nearestIndex,
  type StackType,
} from "./scales"
import type { Dimensions } from "./use-chart-dimensions"
import { useRevision } from "./use-revision"

type Row = Record<string, unknown>

/**
 * Builds the shared context value: resolves the plot rect from the measured
 * size minus margins, computes the x/y scales and the per-series stack bands,
 * and owns the selection + hover state every part reads.
 */
export function useChartController({
  chartType,
  data,
  config,
  stackType,
  dimensions,
  margins,
  animate = true,
  animationDuration = 900,
  replayToken = 0,
  markerIndex = null,
  hovered = false,
  bloom = "off",
  bloomOnHover = false,
  defaultSelectedDataKey = null,
  onSelectionChange,
}: {
  chartType: ChartType
  data: Row[]
  config: ChartConfig
  stackType: StackType
  dimensions: Dimensions
  margins: Margins
  animate?: boolean
  animationDuration?: number
  replayToken?: number
  markerIndex?: number | null
  hovered?: boolean
  bloom?: BloomInput
  bloomOnHover?: boolean
  defaultSelectedDataKey?: string | null
  onSelectionChange?: (key: string | null) => void
}): ChartContextValue {
  // This object becomes the ChartContext value, so its identity — and the
  // identity of every function/object it carries — must stay stable across
  // renders that don't change the underlying inputs. Otherwise every consumer
  // (axes, legend, tooltip, dots) re-renders on every parent render. So the
  // expensive derivations, the exposed callbacks, and the returned value are
  // memoized below; only cheap scalars (bandwidth, ready, plot sizes) are left
  // bare, since they're just recomputed reads, not identities anyone depends on.

  const configKeys = useMemo(() => Object.keys(config), [config])
  const revision = useRevision(data, replayToken)

  const [selectedDataKey, setSelectedDataKey] = useState<string | null>(
    defaultSelectedDataKey
  )
  const [focusDataKey, setFocusDataKey] = useState<string | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [cursorX, setCursorX] = useState(0)
  const [isMouseInChart, setMouseInChart] = useState(false)
  const [seriesSpecs, setSeriesSpecs] = useState<Record<string, SeriesSpec>>({})

  // useCallback because the series effects in area.tsx/bar.tsx list these as
  // deps — without stable identities the unregister/register effect re-fires
  // every render and its setState pair loops ("Maximum update depth exceeded").
  const registerSeries = useCallback((spec: SeriesSpec) => {
    setSeriesSpecs((prev) => {
      const cur = prev[spec.dataKey]
      return cur &&
        cur.kind === spec.kind &&
        cur.variant === spec.variant &&
        cur.strokeVariant === spec.strokeVariant
        ? prev
        : { ...prev, [spec.dataKey]: spec }
    })
  }, [])
  const unregisterSeries = useCallback((dataKey: string) => {
    setSeriesSpecs((prev) => {
      if (!(dataKey in prev)) return prev
      const next = { ...prev }
      delete next[dataKey]
      return next
    })
  }, [])

  const selectDataKey = useCallback(
    (key: string | null) => {
      setSelectedDataKey(key)
      onSelectionChange?.(key)
    },
    [onSelectionChange]
  )

  // The root spreads `{ ...DEFAULT_MARGINS, ...marginsProp }` fresh every
  // render, so `margins` never keeps its identity. Pin one off the four numbers
  // so it doesn't, on its own, invalidate the value or the plot geometry.
  const { top: mTop, right: mRight, bottom: mBottom, left: mLeft } = margins
  const stableMargins = useMemo(
    () => ({ top: mTop, right: mRight, bottom: mBottom, left: mLeft }),
    [mTop, mRight, mBottom, mLeft]
  )

  const plotWidth = Math.max(0, dimensions.width - mLeft - mRight)
  const plotHeight = Math.max(0, dimensions.height - mTop - mBottom)
  const ready = plotWidth > 0 && plotHeight > 0

  // The entrance gate flips true when the canvas reveal completes (via
  // `markEntranceDone`) so DOM markers fade in with the fill, and re-arms on
  // each replay. Adjust-state-during-render instead of an effect, so the reset
  // lands in the same render as the revision bump.
  const [entrance, setEntrance] = useState({ revision, done: !animate })
  if (entrance.revision !== revision) {
    setEntrance({ revision, done: !animate })
  }
  const entranceDone = entrance.revision === revision ? entrance.done : !animate
  const markEntranceDone = useCallback(
    () => setEntrance({ revision, done: true }),
    [revision]
  )

  const { bands, max, min } = useMemo(
    () => computeBands(data, configKeys, stackType),
    [data, configKeys, stackType]
  )

  const isBar = chartType === "bar"
  const xPoint = useMemo(
    () => buildXScale(data.length, plotWidth),
    [data.length, plotWidth]
  )
  const xBand = useMemo(
    () => buildBandScale(data.length, plotWidth),
    [data.length, plotWidth]
  )
  const bandwidth = isBar ? xBand.bandwidth() : 0
  const xCenter = useCallback(
    (i: number) =>
      isBar ? (xBand(i) ?? 0) + xBand.bandwidth() / 2 : (xPoint(i) ?? 0),
    [isBar, xBand, xPoint]
  )
  const indexAtX = useCallback(
    (px: number) =>
      isBar
        ? indexAtBand(px, data.length, plotWidth)
        : nearestIndex(px, data.length, plotWidth),
    [isBar, data.length, plotWidth]
  )
  const stacked = stackType === "stacked" || stackType === "percent"
  const barSlot = useCallback(
    (i: number, si: number, n: number) => {
      const center = xCenter(i)
      if (stacked) {
        const w = bandwidth * 0.9
        return { x: center - w / 2, width: w }
      }
      const slot = bandwidth / Math.max(n, 1)
      return {
        x: center - bandwidth / 2 + si * slot + slot * 0.08,
        width: slot * 0.84,
      }
    },
    [xCenter, stacked, bandwidth]
  )
  const y = useMemo(
    () => buildYScale(min, max, plotHeight),
    [min, max, plotHeight]
  )

  const seedOf = useCallback(
    (key: string) => seedOfColor(config[key]?.color ?? "grey"),
    [config]
  )

  const common: CommonChart = useMemo(() => ({
    names: configKeys,
    labelOf: (n) => config[n]?.label ?? n,
    seedOf,
    selectedDataKey,
    selectDataKey,
    focusDataKey,
    setFocusDataKey,
    hoverIndex,
    ready,
    tooltipLeft: Math.max(48, Math.min(plotWidth + mLeft - 48, cursorX)),
    // Follow the highest hovered node so the card rides the data path, but
    // keep enough headroom that the upward-lifted card never clips the top.
    tooltipTop: (() => {
      const floor = mTop + 44
      if (hoverIndex == null) return floor
      let minY = Number.POSITIVE_INFINITY
      for (const key of configKeys) {
        const b = bands[key]?.[hoverIndex]
        if (b) minY = Math.min(minY, y(b[1]))
      }
      if (!Number.isFinite(minY)) return floor
      return Math.max(floor, mTop + minY)
    })(),
    heading: (i, labelKey) =>
      labelKey ? String(data[i]?.[labelKey] ?? "") : null,
    itemsAt: (i) =>
      configKeys.map((name) => {
        const raw = data[i]?.[name]
        return {
          name,
          label: config[name]?.label ?? name,
          value: typeof raw === "number" ? raw : 0,
          seed: seedOf(name),
          dimmed: (() => {
            const emphasis = selectedDataKey ?? focusDataKey
            return emphasis !== null && emphasis !== name
          })(),
        }
      }),
  }), [
    configKeys,
    config,
    seedOf,
    selectedDataKey,
    selectDataKey,
    focusDataKey,
    setFocusDataKey,
    hoverIndex,
    ready,
    plotWidth,
    mLeft,
    mTop,
    cursorX,
    bands,
    y,
    data,
  ])

  return useMemo<ChartContextValue>(
    () => ({
      chartType,
      config,
      configKeys,
      data,
      dataLength: data.length,
      stackType,
      margins: stableMargins,
      plot: { width: plotWidth, height: plotHeight },
      ready,
      xCenter,
      bandwidth,
      indexAtX,
      barSlot,
      y,
      bands,
      max,
      min,
      selectedDataKey,
      selectDataKey,
      focusDataKey,
      setFocusDataKey,
      hoverIndex,
      setHoverIndex,
      markerIndex,
      cursorX,
      setCursorX,
      isMouseInChart,
      setMouseInChart,
      hovered,
      bloom,
      bloomOnHover,
      seriesSpecs,
      registerSeries,
      unregisterSeries,
      animate,
      animationDuration,
      revision,
      entranceDone,
      markEntranceDone,
      seedOf,
      common,
    }),
    [
      chartType,
      config,
      configKeys,
      data,
      stackType,
      stableMargins,
      plotWidth,
      plotHeight,
      ready,
      xCenter,
      bandwidth,
      indexAtX,
      barSlot,
      y,
      bands,
      max,
      min,
      selectedDataKey,
      selectDataKey,
      focusDataKey,
      setFocusDataKey,
      hoverIndex,
      setHoverIndex,
      markerIndex,
      cursorX,
      setCursorX,
      isMouseInChart,
      setMouseInChart,
      hovered,
      bloom,
      bloomOnHover,
      seriesSpecs,
      registerSeries,
      unregisterSeries,
      animate,
      animationDuration,
      revision,
      entranceDone,
      markEntranceDone,
      seedOf,
      common,
    ]
  )
}
