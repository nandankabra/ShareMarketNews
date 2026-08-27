import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-muted-foreground font-mono text-[11px] tracking-[0.16em] uppercase">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-muted-foreground max-w-prose text-sm">
        That sector or share is not in the tracked universe.
      </p>
      <Link href="/sectors" className="text-primary text-sm font-medium underline underline-offset-2">
        Back to sectors
      </Link>
    </div>
  );
}
