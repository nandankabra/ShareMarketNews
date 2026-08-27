import type { BriefingEntry } from "@/lib/services/briefing/queries";

import { NoticeCard } from "./notice-card";

export function BriefingSection({
  title,
  note,
  entries,
  now,
  emptyLabel,
}: {
  title: string;
  note?: string;
  entries: BriefingEntry[];
  now: number;
  emptyLabel?: string;
}) {
  if (entries.length === 0 && !emptyLabel) return null;

  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b pb-1.5">
        <h2 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">{title}</h2>
        <span className="text-muted-foreground font-mono text-[10px]">
          {note ?? `${entries.length} ${entries.length === 1 ? "share" : "shares"}`}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((entry) => (
            <NoticeCard key={entry.share.id} entry={entry} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
