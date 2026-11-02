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
    <Card className={cn("rounded-lg border-border shadow-none", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-3.5 pb-0 pt-3 sm:px-4">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="text-[15px] font-medium leading-snug tracking-[-0.01em] text-foreground">
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
      <CardContent className="px-3.5 pb-3.5 pt-2.5 sm:px-4">
        {children}
      </CardContent>
    </Card>
  );
}
