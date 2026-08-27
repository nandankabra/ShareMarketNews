/** One price bar. `t` is the bar start as an epoch millisecond value. */
export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

/** A series value aligned to its candle index; null until the period fills. */
export type Series = Array<number | null>;
