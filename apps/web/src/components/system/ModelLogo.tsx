import { modelLogoUrl } from "../../lib/anyrouter";
import { modelMonogram } from "./model-mark";

/** Small mark beside a model id. Decorative: the name is the accessible label. */
export function ModelLogo({ model }: { model: string }) {
  const src = modelLogoUrl(model);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={14}
        height={14}
        className="size-3.5 shrink-0"
      />
    );
  }
  const mark = modelMonogram(model);
  if (!mark) return null;
  return (
    <span
      aria-hidden
      className={`inline-flex size-3.5 shrink-0 select-none items-center justify-center rounded-[3px] font-sans text-[7px] font-bold leading-none text-white ${mark.tone}`}
    >
      {mark.letters}
    </span>
  );
}
