import type { ReactNode } from "react";

export const PAGE_LINK =
  "text-accent underline underline-offset-2 hover:no-underline";

export function ContentPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="typeset typeset-page py-12" lang="en">
      <h1>{title}</h1>
      <p className="text-muted-foreground">{lede}</p>
      {children}
    </article>
  );
}

export function PageSection({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 text-muted-foreground">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
