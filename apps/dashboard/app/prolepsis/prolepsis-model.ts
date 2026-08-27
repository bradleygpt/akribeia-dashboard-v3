// UI DECISIONS 2026-08-10 (Bradley): the 12-month prediction is displayed ONLY as a
// percentile ranking ("12-Month ML Ranking"). The return-space level is mechanically
// conservative (regression toward the mean compresses the output range to ~27% max when
// true annual winners run multiples of that), so it must never be presented as an
// expected return or price target. The ranking preserves what the model actually
// delivers — which stocks are most attractive relative to the universe. pred_3m and all
// target_* price columns are removed (no validated fenced signal / level-based).

export const RANKING_EXPLAINER =
  "Relative-attractiveness ranking, not an expected return. The ensemble's raw return " +
  "outputs are mechanically conservative (regression toward the mean compresses the " +
  "range), so magnitudes are not meaningful — the cross-sectional ranking is what the " +
  "model validates on.";

// "0.948" -> "95th"; "0.998" -> "99.8th" (one decimal only when it changes the story)
export function fmtPercentile(rank: number): string {
  const pct = rank * 100;
  if (pct < 1) return "<1st";
  const v = pct >= 99 ? Math.round(pct * 10) / 10 : Math.round(pct);
  const isInt = Number.isInteger(v);
  const suffix = !isInt
    ? "th"
    : v % 100 >= 11 && v % 100 <= 13
      ? "th"
      : v % 10 === 1
        ? "st"
        : v % 10 === 2
          ? "nd"
          : v % 10 === 3
            ? "rd"
            : "th";
  return `${v}${suffix}`;
}

/**
 * The artifact is a single-date snapshot carrying only the return-space pred_12m level,
 * so the percentile rank of the levels IS the per-date rank — derive it client-side
 * (V2 legacy-payload fallback). Rows without a level (return-engine gaps such as
 * not_in_return_engine_artifact) get a null rank and are excluded from the percentile
 * pool entirely.
 */
export function derivePercentileRanks<T extends { pred_12m: number | null }>(
  rows: T[],
): (T & { pred_12m_rank: number | null })[] {
  const levels = rows
    .map((row) => row.pred_12m)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right);
  return rows.map((row) => {
    if (row.pred_12m === null || !Number.isFinite(row.pred_12m) || levels.length === 0) {
      return { ...row, pred_12m_rank: null };
    }
    // count of levels <= value, via binary search for the upper bound
    let low = 0;
    let high = levels.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (levels[mid] <= row.pred_12m) low = mid + 1;
      else high = mid;
    }
    return { ...row, pred_12m_rank: low / levels.length };
  });
}

export const STREAM_IDS = [
  "Pr1",
  "Pr2",
  "Pr3",
  "Pr4",
  "Pr5",
  "Pr6",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "P1",
  "P1_sec_fullhist",
  "E3",
  "N1",
] as const;

export interface StreamBreakdownRow {
  stream: string;
  signal: number;
  p12m: number;
}

/**
 * Reshape the artifact's flat per-stream columns (Pr1_signal / Pr1_pred_12m / …) into
 * the V2 streams record: one row per stream with a finite z-scored signal and a finite
 * calibrated 12-month output, sorted by the 12-month output descending.
 */
export function streamBreakdown(row: Record<string, unknown>): StreamBreakdownRow[] {
  const rows: StreamBreakdownRow[] = [];
  for (const stream of STREAM_IDS) {
    const signal = row[`${stream}_signal`];
    const p12m = row[`${stream}_pred_12m`];
    if (
      typeof signal === "number" &&
      Number.isFinite(signal) &&
      typeof p12m === "number" &&
      Number.isFinite(p12m)
    ) {
      rows.push({ stream, signal, p12m });
    }
  }
  return rows.sort((left, right) => right.p12m - left.p12m);
}
