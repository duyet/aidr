"use client"

import { createContext, use } from "react"
import type {
  AreaVariant,
  ChartConfig,
  ChartType,
  Margins,
} from "./chart-context"
import type { CommonChart } from "./common-context"
import type { BloomInput } from "./dither-paint"
import type { Seed } from "./palette"
import type { PieSlice, RadarAxis } from "./polar"

type Row = Record<string, unknown>

const ROOT_OF: Record<string, string> = {
  pie: "<PieChart />",
  radar: "<RadarChart />",
}

export type PolarChartContextValue = {
  chartType: ChartType
  config: ChartConfig
  configKeys: string[]
  data: Row[]
  dataLength: number
  ready: boolean
  plot: { width: number; height: number }
  margins: Margins
  center: { x: number; y: number }
  outerRadius: number
  innerRadius: number
  animate: boolean
  animationDuration: number
  revision: number
  bloom: BloomInput
  bloomOnHover: boolean

  seedOf: (key: string) => Seed
  variantOf: (key: string) => AreaVariant
  registerVariant: (key: string, variant: AreaVariant) => void
  unregisterVariant: (key: string) => void

  selectedDataKey: string | null
  selectDataKey: (key: string | null) => void
  /** Legend-hover spotlight — dims every series but this one while set. */
  focusDataKey: string | null
  setFocusDataKey: (key: string | null) => void
  hoverIndex: number | null
  setHoverIndex: (i: number | null) => void
  setCursor: (px: number, py: number) => void
  isMouseInChart: boolean
  setMouseInChart: (over: boolean) => void

  pie: PieSlice[] | null // present for pie charts
  radar: { axes: RadarAxis[]; max: number } | null // present for radar charts

  common: CommonChart
}

const PolarChartContext = createContext<PolarChartContextValue | null>(null)

export function usePolarChart() {
  const ctx = use(PolarChartContext)
  if (!ctx) {
    throw new Error("Polar chart parts must be used within a polar chart root.")
  }
  return ctx
}

/** Boundary guard for polar parts (`<Pie>`, `<Radar>`). */
export function usePolarPart(part: string, kind: "pie" | "radar") {
  const ctx = use(PolarChartContext)
  if (!ctx) {
    throw new Error(`<${part} /> must be used within ${ROOT_OF[kind]}.`)
  }
  if (ctx.chartType !== kind) {
    throw new Error(
      `<${part} /> is not valid inside ${ROOT_OF[ctx.chartType]} — it belongs in ${ROOT_OF[kind]}.`
    )
  }
  return ctx
}

export { PolarChartContext }

// The controller hook lives in a sibling file; re-exported so this module
// keeps offering the whole polar chart-state surface from one import path.
export { usePolarController } from "./use-polar-controller"
