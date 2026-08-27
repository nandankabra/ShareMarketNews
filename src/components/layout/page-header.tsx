import { cn } from "@/lib/utils";

export function PageShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6", className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        {eyebrow ? (
          <p className="text-muted-foreground font-mono text-[11px] tracking-[0.16em] uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <div className="text-muted-foreground text-sm">{description}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
