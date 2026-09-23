import { Children, isValidElement, type ReactNode } from "react"

export { cn } from "cn"

/** Which render layer a composed part targets — defaults to the front SVG. */
export function layerOf(node: ReactNode): "back" | "dom" | "svg" {
  if (!isValidElement(node) || typeof node.type === "string") return "svg"
  return (node.type as { chartLayer?: "back" | "dom" }).chartLayer ?? "svg"
}

/** Splits composed children into their render-layer buckets, in order. */
export function partitionLayers(children: ReactNode) {
  const backChildren: ReactNode[] = []
  const svgChildren: ReactNode[] = []
  const domChildren: ReactNode[] = []
  Children.forEach(children, (child) => {
    const layer = layerOf(child)
    if (layer === "back") backChildren.push(child)
    else if (layer === "dom") domChildren.push(child)
    else svgChildren.push(child)
  })
  return { backChildren, svgChildren, domChildren }
}
