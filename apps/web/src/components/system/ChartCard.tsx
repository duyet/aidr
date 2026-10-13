import { cn } from "@aidr/libs/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aidr/ui";
import type { ReactNode } from "react";

interface ChartCardProps {
  /** Plain string for most cards; a node when the title needs a mark or icon
   *  beside the words. */
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  children,
  className,
  action,
}: ChartCardProps) {
  return (
    <Card className={cn("rounded-md border-border/70 shadow-none", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-4 pb-0 pt-3.5">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="font-sans text-sm font-medium tracking-tight text-foreground">
            {title}
          </CardTitle>
          {subtitle ? (
            <CardDescription className="text-xs leading-relaxed text-muted-foreground">
              {subtitle}
            </CardDescription>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center">{action}</div>
        ) : null}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-3">{children}</CardContent>
    </Card>
  );
}
