"use client"

import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { useCommonChart } from "./common-context"
import { cn } from "./lib"
import { rgb } from "./palette"

/** Sum of every series in one hovered bucket, including zeroes and dimmed rows. */
export function tooltipSeriesTotal(
  items: readonly { value: number }[]
): number {
  let sum = 0
  for (const item of items) {
    if (Number.isFinite(item.value)) sum += item.value
  }
  return sum
}

export type TooltipVariant = "default" | "frosted-glass"

const VARIANT: Record<TooltipVariant, string> = {
  default: "bg-popover",
  "frosted-glass": "bg-popover/70 backdrop-blur-sm",
}

/**
 * Floating hover tooltip. Reads the shared common context so it works in every
 * chart family. It glides between points and fades in/out (instead of snapping),
 * and dims unselected series/slices.
 */
export function Tooltip({
  labelKey,
  valueFormatter,
  variant = "default",
  showTotal = false,
  totalLabel = "Total",
}: {
  labelKey?: string
  valueFormatter?: (value: number, name: string) => string
  variant?: TooltipVariant
  /** Extra row: the sum of the series in the hovered bucket. */
  showTotal?: boolean
  totalLabel?: string
}) {
  const chart = useCommonChart()
  const show = chart.ready && chart.hoverIndex != null

  // Retain the last hovered index so the card keeps its content while fading
  // out — adjust-state-during-render (no refs in render).
  const [lastIndex, setLastIndex] = useState(0)
  if (chart.hoverIndex != null && chart.hoverIndex !== lastIndex) {
    setLastIndex(chart.hoverIndex)
  }
  const index = chart.hoverIndex ?? lastIndex

  const heading = chart.heading(index, labelKey)
  const items = chart.itemsAt(index)
  const total = tooltipSeriesTotal(items)
  const totalText = valueFormatter
    ? valueFormatter(total, totalLabel)
    : total.toLocaleString()

  return (
    <AnimatePresence>
      {show && items.length > 0 && (
        <motion.div
          key="dither-tooltip"
          initial={{
            opacity: 0,
            x: "-50%",
            y: "-115%",
            top: chart.tooltipTop,
            left: chart.tooltipLeft,
          }}
          animate={{
            opacity: 1,
            x: "-50%",
            y: "-115%",
            top: chart.tooltipTop,
            left: chart.tooltipLeft,
          }}
          exit={{ opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 38,
            mass: 0.6,
          }}
          className={cn(
            "pointer-events-none absolute z-10 rounded-md border px-2 py-1 shadow-sm",
            VARIANT[variant]
          )}
        >
          {heading && (
            <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">
              {heading}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <div
                key={item.name}
                className="flex items-center gap-1.5 font-mono text-[11px] text-popover-foreground tabular-nums"
                style={{ opacity: item.dimmed ? 0.4 : 1 }}
              >
                <span
                  className="size-2 rounded-[1px]"
                  style={{ backgroundColor: rgb(item.seed.fill) }}
                />
                <span className="text-muted-foreground">{item.label}</span>
                <span className="ml-auto pl-2 text-foreground">
                  {valueFormatter
                    ? valueFormatter(item.value, item.name)
                    : item.value.toLocaleString()}
                </span>
              </div>
            ))}
            {showTotal && (
              <div className="mt-0.5 flex items-center gap-1.5 border-t border-border pt-0.5 font-mono text-[11px] text-popover-foreground tabular-nums">
                <span className="size-2" aria-hidden />
                <span className="text-muted-foreground">{totalLabel}</span>
                <span className="ml-auto pl-2 font-medium text-foreground">
                  {totalText}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

Tooltip.chartLayer = "dom" as const
