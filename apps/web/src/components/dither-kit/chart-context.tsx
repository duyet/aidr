import type { ScaleLinear } from "d3-scale"
import { createContext, use } from "react"
import type { CommonChart } from "./common-context"
import type { BloomInput } from "./dither-paint"
import type { DitherColor, Seed } from "./palette"
import type { StackType } from "./scales"

/** Which chart root a part is composed under — drives the boundary guards. */
export type ChartType = "area" | "bar" | "line" | "pie" | "radar"

export type ChartConfig = Record<string, { label?: string; color: DitherColor }>

export type Margins = {
  top: number
  right: number
  bottom: number
  left: number
}

type Row = Record<string, unknown>

export type AreaVariant = "gradient" | "dotted" | "hatched" | "solid"
export type StrokeVariant = "solid" | "dashed"
export type SeriesKind = "area" | "line" | "bar"

/** What each series part (<Area />, <Line />, <Bar />) registers so the canvas
 * knows which series to paint and how. */
export type SeriesSpec = {
  dataKey: string
  kind: SeriesKind
  variant: AreaVariant
  strokeVariant: StrokeVariant
}

export type ChartContextValue = {
  chartType: ChartType // which root this part is under
  config: ChartConfig
  configKeys: string[] // series order — drives stacking + legend
  data: Row[]
  dataLength: number
  stackType: StackType

  margins: Margins
  plot: { width: number; height: number } // inner drawing area
  ready: boolean // true once measured (width > 0)

  xCenter: (index: number) => number // category centre px within the plot
  bandwidth: number // category slot width (0 for point/area scales)
  indexAtX: (px: number) => number // nearest category for a pointer x
  // Bar geometry in plot px — one source of truth for the canvas + click rects.
  barSlot: (
    index: number,
    seriesIndex: number,
    seriesCount: number
  ) => { x: number; width: number }
  y: ScaleLinear<number, number> // value → px within the plot
  bands: Record<string, [number, number][]> // per-series [y0, y1] per row
  max: number
  min: number // most-negative value (0 when nothing dips below the baseline)

  // Interaction state, shared by every part.
  selectedDataKey: string | null
  selectDataKey: (key: string | null) => void
  /** Legend-hover spotlight — dims every series but this one while set. */
  focusDataKey: string | null
  setFocusDataKey: (key: string | null) => void
  hoverIndex: number | null
  setHoverIndex: (index: number | null) => void
  markerIndex: number | null // controlled crosshair override (e.g. committed point)
  cursorX: number
  setCursorX: (px: number) => void
  isMouseInChart: boolean
  setMouseInChart: (over: boolean) => void
  hovered: boolean // parent-driven hover (e.g. the whole card) — lifts the fill
  bloom: BloomInput // glow on the dither canvas
  bloomOnHover: boolean // only bloom while hovered

  // Series register themselves so the canvas knows what (and how) to paint.
  seriesSpecs: Record<string, SeriesSpec>
  registerSeries: (spec: SeriesSpec) => void
  unregisterSeries: (dataKey: string) => void

  // Entrance animation (prop-driven). `revision` bumps when the data changes or
  // the replay token advances, so the canvas can re-play its entrance.
  animate: boolean
  animationDuration: number
  revision: number
  entranceDone: boolean // true once the entrance has played — gates SVG markers
  markEntranceDone: () => void // the canvas calls this when its reveal completes

  // Helpers.
  seedOf: (key: string) => Seed
  common: CommonChart // shared surface for <Legend> / <Tooltip>
}

const ChartContext = createContext<ChartContextValue | null>(null)

const ROOT_OF: Record<ChartType, string> = {
  area: "<AreaChart />",
  bar: "<BarChart />",
  line: "<LineChart />",
  pie: "<PieChart />",
  radar: "<RadarChart />",
}

/** Generic accessor for internal layers (canvas/overlay) that work for any root. */
export function useChart() {
  const ctx = use(ChartContext)
  if (!ctx) {
    throw new Error(
      "Chart parts must be used within a chart root (e.g. <AreaChart />)."
    )
  }
  return ctx
}

/**
 * Boundary guard for a composable part. Throws a precise error when used outside
 * a root, or inside the wrong chart type — e.g. `<Bar />` placed in an area
 * chart. `kind` omitted means the part works under any root (grid, axes, …).
 */
export function useChartPart(
  part: string,
  kind?: ChartType | ChartType[]
): ChartContextValue {
  const ctx = use(ChartContext)
  if (!ctx) {
    const where = kind
      ? ROOT_OF[Array.isArray(kind) ? kind[0] : kind]
      : "a chart root"
    throw new Error(`<${part} /> must be used within ${where}.`)
  }
  if (kind) {
    const allowed = Array.isArray(kind) ? kind : [kind]
    if (!allowed.includes(ctx.chartType)) {
      throw new Error(
        `<${part} /> is not valid inside ${ROOT_OF[ctx.chartType]} — it belongs in ${allowed
          .map((k) => ROOT_OF[k])
          .join(" or ")}.`
      )
    }
  }
  return ctx
}

export { ChartContext }

// The hooks live in sibling files; re-exported so the context module keeps
// offering the whole chart-state surface from one import path.
export { useChartController } from "./use-chart-controller"
export { useRevision } from "./use-revision"
