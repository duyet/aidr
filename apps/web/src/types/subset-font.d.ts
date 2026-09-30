// subset-font ships no types. This covers the call scripts/subset-fonts.ts makes.
declare module "subset-font" {
  export default function subsetFont(
    font: Buffer | Uint8Array,
    text: string,
    options?: {
      targetFormat?: "woff2" | "woff" | "truetype" | "sfnt";
      preserveNameIds?: number[];
      variationAxes?: Record<string, number | { min: number; max: number }>;
    }
  ): Promise<Buffer>;
}
