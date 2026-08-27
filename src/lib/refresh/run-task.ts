import type { SourceKey } from "@/lib/db/enums";
import { ProviderError } from "@/lib/providers/errors";
import { prisma } from "@/lib/prisma";

/**
 * The only writer of SourceFetch.
 *
 * Wrapping every task here is what lets the UI be honest about staleness: each
 * run stamps when it was attempted, whether it worked, how many items it saw
 * and how long it took. Without it the app would silently show yesterday's
 * numbers as though they were current.
 */

export type TaskResult = { itemCount: number; note?: string };

/**
 * Handed to every task so its loops can notice they have run out of time.
 *
 * Rejecting on a timeout does not stop the work behind it — an async function
 * cannot be cancelled from outside. A single request is already bounded by
 * politeFetch's own deadline, but a task that loops over twenty-five shares can
 * keep going for another twelve minutes after the timeout has fired, queuing
 * requests that later ticks then wait behind. Checking `expired()` between
 * items is what actually stops it.
 */
export type TaskContext = { expired: () => boolean };

export type RunOutcome =
  | { status: "OK"; itemCount: number; durationMs: number; note?: string }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: string; durationMs: number };

/** Base interval used to grow the backoff after repeated failures. */
const BASE_BACKOFF_MS = 2 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

/**
 * A ceiling on how long any single task may run.
 *
 * Learned from a backfill where the option-chain task spent fifteen minutes on
 * one uncooperative expiry. Per-request budgets are not enough on their own: a
 * task that loops over N items can blow past any of them N times over. The
 * poller ticks every sixty seconds, so a task that cannot finish in two minutes
 * has failed and should be recorded as such rather than holding the loop.
 */
const TASK_TIMEOUT_MS = 120_000;

class TaskTimeout extends Error {
  constructor(source: string, ms: number) {
    super(`${source} exceeded its ${Math.round(ms / 1000)}s budget`);
    this.name = "TaskTimeout";
  }
}

function withTimeout<T>(source: SourceKey, promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TaskTimeout(source, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runTask(
  source: SourceKey,
  run: (context: TaskContext) => Promise<TaskResult>,
  options: { ignoreBackoff?: boolean; timeoutMs?: number } = {},
): Promise<RunOutcome> {
  const existing = await prisma.sourceFetch.findUnique({ where: { source } });

  // Honoured by both the poller and the manual Refresh button, so a wedged
  // upstream is not hammered by someone clicking repeatedly.
  if (!options.ignoreBackoff && existing?.nextEligibleAt && existing.nextEligibleAt > new Date()) {
    const seconds = Math.ceil((existing.nextEligibleAt.getTime() - Date.now()) / 1000);
    return { status: "SKIPPED", reason: `backing off for another ${seconds}s` };
  }

  const started = Date.now();
  await prisma.sourceFetch.upsert({
    where: { source },
    update: { lastAttemptAt: new Date() },
    create: { source, lastAttemptAt: new Date() },
  });

  const timeoutMs = options.timeoutMs ?? TASK_TIMEOUT_MS;
  const deadline = started + timeoutMs;
  const context: TaskContext = { expired: () => Date.now() >= deadline };

  try {
    const result = await withTimeout(source, run(context), timeoutMs);
    const durationMs = Date.now() - started;

    await prisma.sourceFetch.update({
      where: { source },
      data: {
        lastSuccessAt: new Date(),
        lastStatus: "OK",
        lastError: null,
        itemCount: result.itemCount,
        durationMs,
        consecutiveFailures: 0,
        nextEligibleAt: null,
      },
    });

    return { status: "OK", itemCount: result.itemCount, durationMs, note: result.note };
  } catch (error) {
    const durationMs = Date.now() - started;
    const failures = (existing?.consecutiveFailures ?? 0) + 1;

    // A BLOCKED source gets a much longer rest than a flaky one: it has told us
    // to go away, and continuing to knock is what turns a soft block hard.
    const isBlocked = error instanceof ProviderError && error.kind === "BLOCKED";
    const backoff = Math.min(
      (isBlocked ? BASE_BACKOFF_MS * 15 : BASE_BACKOFF_MS) * 2 ** (failures - 1),
      MAX_BACKOFF_MS,
    );

    const message = error instanceof ProviderError ? error.toString() : String(error);

    await prisma.sourceFetch.update({
      where: { source },
      data: {
        lastStatus: "FAILED",
        lastError: message.slice(0, 500),
        durationMs,
        consecutiveFailures: failures,
        nextEligibleAt: new Date(Date.now() + backoff),
      },
    });

    return { status: "FAILED", error: message, durationMs };
  }
}
