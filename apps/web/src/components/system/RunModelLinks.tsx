import { anyrouterModelUrl, isValidAnyrouterModel } from "../../lib/anyrouter";
import { formatSafeDetail, shortModel } from "./run-format";

/** Models a run used, linked to AnyRouter when the id is a known model. */
export function RunModelLinks({ models }: { models: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
      {models.map((model, index) => (
        <span
          key={`${model}-${index}`}
          className="inline-flex items-center gap-1"
        >
          {index > 0 ? (
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
          ) : null}
          {isValidAnyrouterModel(model) ? (
            <a
              href={anyrouterModelUrl(model)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-accent"
              title={formatSafeDetail(model, 160)}
            >
              {shortModel(formatSafeDetail(model, 160))}
            </a>
          ) : (
            <span title={formatSafeDetail(model, 160)}>
              {shortModel(formatSafeDetail(model, 160))}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
