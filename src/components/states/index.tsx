import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-border flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center", className)}>
      <p className="font-medium">{title}</p>
      {description ? <p className="text-muted-foreground max-w-prose text-sm">{description}</p> : null}
      {action}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="bg-muted h-9 animate-pulse rounded-md" />
      ))}
    </div>
  );
}
