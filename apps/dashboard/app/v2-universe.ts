import preservedUniverse from "../../../data/observations/current/universe_floor0.json";
import observationProvenance from "../../../data/observations/current/provenance.json";
import { isExcludedSecurityTicker } from "./security-exclusions";

// The expected shape of the current point-in-time observation comes from the
// ingestion receipt written alongside the data (scripts/
// ingest-v2-observation.node.mjs). The pin is still fail-closed — the loader
// refuses a payload that disagrees with its own receipt — but the receipt now
// travels with each scheduled observation instead of being frozen to the
// 2026-07-25 preserved archive.
const floor0Receipt = observationProvenance.files["universe_floor0.json"];

export const V2_UNIVERSE_EXPECTED = {
  rows: floor0Receipt.rows,
  stocks: floor0Receipt.stocks,
  etfs: floor0Receipt.etfs,
  sha256: floor0Receipt.sha256,
  sourceCommit: observationProvenance.v2_source_commit,
  bulkDataCommit: observationProvenance.bulk_data_commit,
  publishedAt: observationProvenance.observed_at,
} as const;

interface V2PresetCell {
  c: number | null;
  r: string | null;
}

interface V2UniverseRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCapB: number | null;
  marketCap: number | null;
  byPreset: {
    equal?: V2PresetCell;
  };
  raw: Record<string, number | null>;
}

interface V2UniversePayload {
  meta: {
    floor: number;
    n_total: number;
    n_stocks: number;
    n_etf: number;
    sectors: string[];
  };
  rows: V2UniverseRow[];
}

export interface UniverseDisplayRow {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCapB: number | null;
  composite: number | null;
  rating: string;
  isEtf: boolean;
  momentum1m: number | null;
  momentum3m: number | null;
  above50Sma: number | null;
  above200Sma: number | null;
}

export interface V2Universe {
  rows: UniverseDisplayRow[];
  sectors: string[];
  total: number;
  stocks: number;
  etfs: number;
  provenance: typeof V2_UNIVERSE_EXPECTED;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Authoritative V2 universe failed validation: ${message}`);
  }
}

export function validateV2UniversePayload(
  input: unknown,
  expected:
    | {
        rows: number;
        stocks: number;
        etfs: number;
      }
    | undefined,
): V2UniversePayload {
  invariant(typeof input === "object" && input !== null, "payload must be an object");

  const payload = input as Partial<V2UniversePayload>;
  invariant(typeof payload.meta === "object" && payload.meta !== null, "metadata is required");
  invariant(Array.isArray(payload.rows), "rows must be an array");
  invariant(payload.meta.floor === 0, "the user-facing source must be the no-floor payload");
  invariant(payload.meta.n_total === payload.rows.length, "metadata total must equal row length");
  invariant(
    payload.meta.n_stocks + payload.meta.n_etf === payload.meta.n_total,
    "stock and ETF totals must reconcile",
  );

  const tickers = new Set<string>();

  for (const [index, row] of payload.rows.entries()) {
    invariant(typeof row === "object" && row !== null, `row ${index} must be an object`);
    invariant(
      typeof row.ticker === "string" && row.ticker.trim().length > 0,
      `row ${index} is missing a ticker`,
    );
    invariant(!tickers.has(row.ticker), `duplicate ticker ${row.ticker}`);
    tickers.add(row.ticker);
    invariant(
      typeof row.name === "string" && row.name.trim().length > 0,
      `${row.ticker} is missing a name`,
    );
    invariant(typeof row.byPreset === "object" && row.byPreset !== null, `${row.ticker} scores`);
    invariant(typeof row.raw === "object" && row.raw !== null, `${row.ticker} raw metrics`);
  }

  if (expected !== undefined) {
    invariant(payload.rows.length === expected.rows, `expected ${expected.rows} rows`);
    invariant(payload.meta.n_stocks === expected.stocks, `expected ${expected.stocks} stocks`);
    invariant(payload.meta.n_etf === expected.etfs, `expected ${expected.etfs} ETFs`);
  }

  return payload as V2UniversePayload;
}

export function loadV2Universe(): V2Universe {
  const payload = validateV2UniversePayload(preservedUniverse, V2_UNIVERSE_EXPECTED);
  // The validated payload is the byte-identical preserved V2 archive; the
  // governed universe applies the exclusion registry at derivation so counts
  // below are recomputed, never patched.
  const rows = payload.rows
    .filter((row) => !isExcludedSecurityTicker(row.ticker))
    .map<UniverseDisplayRow>((row) => ({
      ticker: row.ticker,
      name: row.name ?? row.ticker,
      sector: row.sector?.trim() || "Unclassified",
      industry: row.industry?.trim() || "Unclassified",
      marketCapB: row.marketCapB,
      composite: row.byPreset.equal?.c ?? null,
      rating: row.byPreset.equal?.r ?? "Unavailable",
      isEtf: row.sector === "ETF",
      momentum1m: row.raw.momentum_1m ?? null,
      momentum3m: row.raw.momentum_3m ?? null,
      above50Sma: row.raw.momentum_vs_sma50 ?? null,
      above200Sma: row.raw.momentum_vs_sma200 ?? null,
    }));

  return {
    rows,
    sectors: [...new Set(rows.map(({ sector }) => sector))].sort((left, right) =>
      left.localeCompare(right),
    ),
    total: rows.length,
    stocks: rows.filter(({ isEtf }) => !isEtf).length,
    etfs: rows.filter(({ isEtf }) => isEtf).length,
    provenance: V2_UNIVERSE_EXPECTED,
  };
}
