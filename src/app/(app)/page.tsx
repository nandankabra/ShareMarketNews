import type { Metadata } from "next";

import { BriefingSection } from "@/components/briefing/briefing-section";
import { NewsPulse } from "@/components/briefing/news-pulse";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { StaleBanner } from "@/components/market/stale-banner";
import { EmptyState } from "@/components/states";
import { serverNow } from "@/lib/server-now";
import { getBriefing } from "@/lib/services/briefing/queries";
import { getMarketHeader } from "@/lib/services/market/queries";

/**
 * Vercel defaults server functions to ten seconds. On a cold cache this page
 * fetches sequentially — one request in flight per host, at the politeness gap
 * — which is comfortably more than that. Sixty is the Hobby ceiling, and the
 * budgets in the data layer are sized against it.
 */
export const maxDuration = 60;


export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

function humanDate(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default async function TodayPage() {
  const [briefing, header, now] = await Promise.all([getBriefing(), getMarketHeader(), serverNow()]);

  const total =
    briefing.happeningToday.length +
    briefing.tomorrowEntries.length +
    briefing.movingOrInNews.length +
    briefing.fromWatchlist.length;

  return (
    <PageShell>
      <NewsPulse />

      <PageHeader
        eyebrow="What to keep an eye on"
        title="Today & Tomorrow"
        description={`${briefing.scanned} shares scanned · ${total} worth a look`}
      />

      <StaleBanner lastSuccessAt={header.quotesLastSuccessAt} now={now} />

      {!briefing.eventsAvailable ? (
        <div className="border-down/30 bg-down-muted/40 mb-4 rounded-md border px-3 py-2 text-sm">
          NSE&apos;s event calendar is unavailable, so this briefing is running on news and price
          movement alone. Scheduled board meetings and ex-dates are missing.
        </div>
      ) : null}

      {total === 0 ? (
        <EmptyState
          title="Nothing is flagged"
          description="No share has an event dated today or tomorrow, fresh news, or an unusual move. A quiet market is a real answer."
        />
      ) : (
        <>
          <BriefingSection
            title={`Happening today · ${humanDate(briefing.today)}`}
            entries={briefing.happeningToday}
            now={now}
            emptyLabel="Nothing scheduled for today."
          />
          <BriefingSection
            title={`Tomorrow · ${humanDate(briefing.tomorrow)}`}
            entries={briefing.tomorrowEntries}
            now={now}
            emptyLabel="Nothing scheduled for tomorrow."
          />
          <BriefingSection title="Moving, or in the news" entries={briefing.movingOrInNews} now={now} />
          <BriefingSection
            title="From your watchlist"
            note="watched, but quiet"
            entries={briefing.fromWatchlist}
            now={now}
          />
        </>
      )}
    </PageShell>
  );
}
