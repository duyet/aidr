import { buttonVariants } from "@aidr/ui";
import { Link } from "@tanstack/react-router";
import { useLang } from "../lib/lang-context";
import { notFoundCopy } from "../lib/not-found";

export function NotFoundPage() {
  const lang = useLang();
  const copy = notFoundCopy(lang);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-[56px] font-medium leading-none tracking-[-0.04em] tabular-nums text-foreground">
          {copy.heading}
        </h1>
        <p className="mt-3 text-[15px] text-muted-foreground">{copy.body}</p>
        <Link
          to="/"
          search={{ lang }}
          className={buttonVariants({
            variant: "outline",
            className: "mt-6 text-[13px] max-sm:h-11",
          })}
        >
          {copy.home}
        </Link>
      </div>
    </div>
  );
}
