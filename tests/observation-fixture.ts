// Shared test constants derived from the CURRENT point-in-time observation and
// its ingestion receipt, so observation-coupled assertions track each scheduled
// refresh instead of freezing literals from one preserved archive.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import currentProvenance from "../data/observations/current/provenance.json";

interface UniverseRow {
  ticker: string;
  sector: string | null;
  raw?: Record<string, number | null>;
  byPreset?: { equal?: { c: number | null; r: string | null } };
}

const universe = JSON.parse(
  readFileSync(resolve("data/observations/current/universe_floor0.json"), "utf8"),
) as { rows: UniverseRow[] };
const exclusions = JSON.parse(
  readFileSync(resolve("data/reference/governed-security-exclusions.json"), "utf8"),
) as { exclusions: { ticker: string }[] };

const excluded = new Set(exclusions.exclusions.map((entry) => entry.ticker.toUpperCase()));
const governedRows = universe.rows.filter((row) => !excluded.has(row.ticker.trim().toUpperCase()));

export const provenance = currentProvenance;

/** governed no-floor universe counts (source rows minus registry exclusions). */
export const GOVERNED_TOTAL = governedRows.length;
export const GOVERNED_STOCKS = governedRows.filter((row) => row.sector !== "ETF").length;
export const GOVERNED_ETFS = GOVERNED_TOTAL - GOVERNED_STOCKS;

/** raw observation counts (before exclusions). */
export const OBSERVED_FLOOR0_ROWS = universe.rows.length;

export const FLOOR0_SHA256 = currentProvenance.files["universe_floor0.json"].sha256;
export const OBSERVED_AT = currentProvenance.observed_at;
export const AS_OF_DATE = currentProvenance.observed_at.slice(0, 10);
export const V2_SOURCE_COMMIT = currentProvenance.v2_source_commit;
export const BULK_DATA_COMMIT = currentProvenance.bulk_data_commit;

/** the raw source row for a ticker from the current no-floor observation. */
export function floor0Row(ticker: string): UniverseRow | undefined {
  return universe.rows.find((row) => row.ticker === ticker);
}
