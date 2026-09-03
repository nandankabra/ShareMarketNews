import Link from "next/link";

import type { ActionsAhead, UpcomingAction } from "@/lib/services/corporate/queries";
import { formatInr } from "@/lib/utils";

function humanDay(dayKey: string, today: string): string {
  if (dayKey === today) return "today";
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function ActionRow({ action, today }: { action: UpcomingAction; today: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0">
      <div className="min-w-0">
        <Link
          href={`/shares/${action.symbol}`}
          className="font-mono text-xs font-semibold hover:underline"
        >
          {action.symbol}
        </Link>
        {action.company ? (
          <span className="text-muted-foreground ml-2 truncate text-[11px]">{action.company}</span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-baseline gap-2 font-mono text-[10px]">
        {action.amount != null ? (
          <span className="font-semibold">₹{formatInr(action.amount)}</span>
        ) : null}
        {/* An expected action is a scheduled meeting, not a declared payout.
            Saying so on the row is the difference between reporting a calendar
            and inventing a dividend. */}
        {action.stage === "EXPECTED" ? (
          <span className="text-muted-foreground" title="A board meeting is scheduled to consider this. It may not happen.">
            to consider
          </span>
        ) : null}
        <span className="text-muted-foreground">{humanDay(action.date, today)}</span>
      </div>
    </li>
  );
}

function Column({
  title,
  actions,
  today,
  emptyLabel,
}: {
  title: string;
  actions: UpcomingAction[];
  today: string;
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 border-b pb-1">
        <h3 className="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase">{title}</h3>
        <span className="text-muted-foreground font-mono text-[10px]">{actions.length}</span>
      </div>

      {actions.length === 0 ? (
        <p className="text-muted-foreground py-1.5 text-xs">{emptyLabel}</p>
      ) : (
        <ul>
          {actions.map((action) => (
            <ActionRow key={`${action.symbol}:${action.date}`} action={action} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Buybacks and dividends scheduled in the next month.
 *
 * Descriptive, like everything else here: these are dates a company has put in
 * the calendar. The panel says what is scheduled and when, and nothing about
 * whether any of it is worth owning.
 */
export function ActionsAheadPanel({ data, today }: { data: ActionsAhead; today: string }) {
  if (!data.available && data.buybacks.length === 0 && data.dividends.length === 0) {
    return null;
  }

  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b pb-1.5">
        <h2 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
          Corporate actions ahead
        </h2>
        <span className="text-muted-foreground font-mono text-[10px]">next 30 days</span>
      </div>

      {!data.available ? (
        <p className="text-muted-foreground mb-2 text-xs">
          NSE&apos;s corporate actions feed did not answer, so this is board meetings only — no
          ex-dates or amounts.
        </p>
      ) : null}

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Column
          title="Buyback"
          actions={data.buybacks}
          today={today}
          emptyLabel="No buyback scheduled. They are rare — most months have none."
        />
        <Column
          title="Dividend"
          actions={data.dividends}
          today={today}
          emptyLabel="No dividend scheduled."
        />
      </div>
    </section>
  );
}
