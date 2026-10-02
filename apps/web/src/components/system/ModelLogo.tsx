import { modelLogoUrl } from "../../lib/anyrouter";

/** Small mark beside a model id. Decorative: the name is the accessible label. */
export function ModelLogo({ model }: { model: string }) {
  const src = modelLogoUrl(model);
  if (!src) return null;
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
