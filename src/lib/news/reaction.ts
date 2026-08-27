/**
 * How much has THIS share actually moved on days like this?
 *
 * The careful part of the whole app. It states what the share has already done
 * — never what it will do. There is no price target here, no direction call,
 * and no model. The inputs are the share's own realised moves and its own
 * volatility; the output is a range it has historically occupied.
 *
 * Where the evidence is thin, it says so instead of quoting a range off two
 * data points. A confident-looking number built on nothing is the failure mode
 * this module exists to avoid.
 */

export type ReactionInput = {
  /** Absolute daily percentage moves on the share's heaviest-news days. */
  newsDayMoves: number[];
  /** The share's ordinary daily swing — mean absolute move over 20 sessions. */
  avgAbsChangePercent20d: number | null;
  atrPercent: number | null;
};

export type Reaction =
  | {
      kind: "RANGE";
      typicalPercent: number | null;
      atrPercent: number | null;
      lowPercent: number;
      highPercent: number;
      sampleSize: number;
    }
  | {
      kind: "INSUFFICIENT";
      typicalPercent: number | null;
      atrPercent: number | null;
      sampleSize: number;
    };

/** Fewer than this many comparable days and no range is quoted. */
const MIN_SAMPLE = 3;

export function summariseReaction(input: ReactionInput): Reaction {
  const moves = input.newsDayMoves
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  if (moves.length < MIN_SAMPLE) {
    return {
      kind: "INSUFFICIENT",
      typicalPercent: input.avgAbsChangePercent20d,
      atrPercent: input.atrPercent,
      sampleSize: moves.length,
    };
  }

  // The 20th and 80th percentiles rather than min and max: one freak session
  // should not define the range a reader takes away from this.
  const low = percentile(moves, 0.2);
  const high = percentile(moves, 0.8);

  return {
    kind: "RANGE",
    typicalPercent: input.avgAbsChangePercent20d,
    atrPercent: input.atrPercent,
    lowPercent: low,
    highPercent: high,
    sampleSize: moves.length,
  };
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * The sentence shown under a story. Deliberately blunt about what it is.
 */
export function describeReaction(reaction: Reaction, symbol: string): string {
  const typical =
    reaction.typicalPercent != null
      ? `${symbol} typically swings ${reaction.typicalPercent.toFixed(1)}% a day`
      : `${symbol} has no settled daily range yet`;

  if (reaction.kind === "INSUFFICIENT") {
    return `${typical}. Not enough past news days to compare against.`;
  }

  return (
    `${typical}. On its ${reaction.sampleSize} heaviest-news days it moved ` +
    `${reaction.lowPercent.toFixed(1)}%–${reaction.highPercent.toFixed(1)}%.`
  );
}

/** Shown wherever a reaction range appears. Not optional. */
export const REACTION_DISCLAIMER = "Past reaction, not a forecast.";
