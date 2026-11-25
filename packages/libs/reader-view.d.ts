export declare const DEFAULT_THEME: "light";
export declare const TLDR_VIEWS: readonly ["image", "rows2", "rows3"];
export type TldrView = (typeof TLDR_VIEWS)[number];
export declare const DEFAULT_TLDR_VIEW: "rows2";
export declare function normalizeTldrView(value: unknown): TldrView;
export declare function tldrRows(view: TldrView): 2 | 3;
export declare const TLDR_VIEW_ICONS: Record<
  TldrView,
  ReadonlyArray<readonly [string, Record<string, string>]>
>;
