import { BarCanvas } from "./bar-canvas"
import { type CartesianChartProps, CartesianRoot } from "./cartesian-root"

// `object` rather than `Record<string, unknown>`: interfaces don't get an
// implicit index signature, so interface-typed rows failed to satisfy the
// generic. Internal layers still index rows through their own Row type.
type Row = object

export function BarChart<TData extends Row>(props: CartesianChartProps<TData>) {
  return <CartesianRoot chartType="bar" Canvas={BarCanvas} {...props} />
}
