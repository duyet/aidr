/** The yellow ";" mark (DESIGN.md "Logo"). Decorative: whatever holds it
 *  carries the name. */
export function LogoMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-signal font-bold leading-none text-signal-ink ${
        size === "sm"
          ? "size-4 rounded-[4px] text-[11px]"
          : "size-5 rounded-[5px] text-[13px]"
      }`}
    >
      ;
    </span>
  );
}
