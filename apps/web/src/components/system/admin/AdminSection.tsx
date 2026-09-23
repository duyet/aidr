import type { ReactNode } from "react";

/** One labelled block inside the admin panel — a small muted title with an
 * optional right-aligned action (usually a Refresh button). */
export function AdminSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className={action ? "flex items-center justify-between" : undefined}>
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
