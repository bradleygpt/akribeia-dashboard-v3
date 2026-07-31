export interface MarketIndexSnapshot {
  name: string;
  ok: boolean;
  price?: number;
  allTimeHigh?: number;
  distanceFromAthPct?: number | null;
  change1dPct?: number | null;
  change5dPct?: number | null;
  change1mPct?: number | null;
  change3mPct?: number | null;
  ytdPct?: number | null;
}

export interface LiveMarketSnapshot {
  indices: MarketIndexSnapshot[];
  dxy: {
    ok: boolean;
    current?: number;
    change1dPct?: number | null;
    ytdPct?: number | null;
  };
  spy: {
    ok: boolean;
    price?: number;
    sma50?: number | null;
    sma200?: number | null;
    return3mPct?: number | null;
  };
  vix: {
    ok: boolean;
    current?: number;
    average1y?: number;
    high1y?: number;
    low1y?: number;
    percentile?: number;
    level?: string;
    score?: number;
  };
  yields: {
    ok: boolean;
    y10?: number;
    y2?: number;
    spread?: number;
  };
  buffett: {
    ok: boolean;
    ratio?: number;
    level?: string;
    score?: number;
    marketCapTrillions?: number;
    gdpTrillions?: number;
  };
  pgi: {
    ok: boolean;
    value?: number;
    moneyMarketTrillions?: number;
    totalMarketCapTrillions?: number;
    level?: string;
    score?: number;
    fredKeyless?: boolean;
    source?: "live" | "baked" | "estimate";
    asOf?: string | null;
    stale?: boolean;
  };
  dots: {
    ok: boolean;
    medianCurrentYear?: number;
    medianLongerRun?: number;
  };
}

export interface MacroSignal {
  id: string;
  label: string;
  unit: string;
  risk_dir: "higher" | "lower" | null;
  value: number;
  date: string;
}

export interface MarketStaticData {
  generated_at?: string;
  macro_data?: Record<string, unknown>;
  earnings_forecast?: {
    sp500_earnings_growth?: number;
    scenarios?: Record<
      string,
      {
        earnings_growth?: number;
        cpi?: number;
        unemployment?: number;
        ism?: number;
        description?: string;
      }
    >;
    sector_forecasts?: Record<string, number>;
  };
  fed_outlook?: Record<string, unknown>;
  economic_calendar?: Array<Record<string, unknown>>;
  fomc_meetings?: string[];
  macro_signals?: {
    signals?: MacroSignal[];
    as_of?: string | null;
    source?: string;
  };
  forward_earnings?: {
    as_of?: string | null;
    source?: string;
    note?: string;
    path?: Array<{
      year: string;
      pce_inflation: number;
      unemployment: number;
      ism_assumed: number;
      sp500_earnings_growth: number;
    }>;
  };
}

export type MarketHealthAvailability = "healthy" | "partial" | "unavailable";

export interface MarketHealthApiResponse {
  status: MarketHealthAvailability;
  generatedAt: string;
  source: {
    v2AppCommit: string;
    v2SourceCommit: string;
    staticUrl: string;
    pgiBakedUrl: string;
    staticAsOf: string | null;
    liveProvider: "Yahoo Finance chart API + FRED fredgraph.csv";
  };
  staticData: MarketStaticData | null;
  live: LiveMarketSnapshot;
  unavailable: string[];
}
