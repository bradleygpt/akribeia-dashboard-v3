/* global console */

import { mkdir, readFile, writeFile } from "node:fs/promises";

const evidence = "C:/Akribeia-ETF-Full-Coverage-20260806-001500";
const universe = JSON.parse(
  await readFile("data/reference/v2-baseline/fixtures/universe_floor0.json", "utf8"),
);
const holdings = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-holdings-normalized.json", "utf8"),
);
const directory = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-universe-expanded.json", "utf8"),
);
const directoryByTicker = new Map(directory.etfs.map((row) => [row.ticker, row]));
const canonical = universe.rows
  .filter((row) => row.sector !== "ETF")
  .map((row) => ({
    ticker: row.ticker.toUpperCase(),
    name: row.name ?? row.ticker,
    sector: row.sector ?? "Unclassified",
    industry: row.industry ?? "Unclassified",
    active: true,
  }));
const canonicalSet = new Set(canonical.map((row) => row.ticker));
const mappedRows = holdings.rows.filter((row) => canonicalSet.has(row.constituentTicker));
const etfMap = new Map();
for (const row of mappedRows) {
  const list = etfMap.get(row.etfTicker) ?? [];
  list.push(row);
  etfMap.set(row.etfTicker, list);
}
const retained = [...etfMap.keys()].sort();
const candidate = [...new Set(holdings.rows.map((row) => row.etfTicker))].sort();
const coverageRows = canonical.map((equity) => {
  const matches = retained.filter((etf) =>
    etfMap.get(etf)?.some((row) => row.constituentTicker === equity.ticker),
  );
  const weights = matches.flatMap(
    (etf) =>
      etfMap
        .get(etf)
        ?.filter((row) => row.constituentTicker === equity.ticker)
        .map((row) => row.portfolioWeight) ?? [],
  );
  const dates = matches.flatMap(
    (etf) =>
      etfMap
        .get(etf)
        ?.filter((row) => row.constituentTicker === equity.ticker)
        .map((row) => row.sourceAsOfDate)
        .filter(Boolean) ?? [],
  );
  return {
    ...equity,
    candidateEtfCount: candidate.length,
    retainedEtfCount: matches.length,
    maxWeight: weights.length ? Math.max(...weights) : null,
    medianWeight: weights.length
      ? [...weights].sort((a, b) => a - b)[Math.floor((weights.length - 1) / 2)]
      : null,
    freshestAsOf: dates.sort().at(-1) ?? null,
    staleCount: dates.filter((date) => date < "2026-01-01").length,
    partialCount: matches.length,
    coverageStatus: matches.length ? "covered" : "uncovered",
  };
});
const coverageCounts = coverageRows.map((row) => row.retainedEtfCount).sort((a, b) => a - b);
const coveragePercentile = (p) =>
  coverageCounts[
    Math.min(coverageCounts.length - 1, Math.floor((coverageCounts.length - 1) * p))
  ] ?? 0;
const signatures = new Map();
for (const etf of retained) {
  const signature = etfMap
    .get(etf)
    .toSorted((a, b) => a.constituentTicker.localeCompare(b.constituentTicker))
    .map((row) => `${row.constituentTicker}:${row.portfolioWeight.toFixed(6)}`)
    .join("|");
  const list = signatures.get(signature) ?? [];
  list.push(etf);
  signatures.set(signature, list);
}
const protectedEtfs = new Set(["SPY", "IVV", "VOO"]);
const equivalenceRows = [];
for (const group of signatures.values()) {
  if (group.length < 2) continue;
  for (const etf of group)
    equivalenceRows.push([
      `EQ-${group.join("-")}`,
      group[0],
      etf === group[0] ? "" : etf,
      "manual-review",
      "Exact projected vector only; structural and official magnitude fields are insufficient for automatic exclusion.",
      protectedEtfs.has(etf) ? "protected" : "review",
    ]);
}
const canonicalArtifact = {
  schemaVersion: "1.0.0-canonical-dashboard-equities",
  generatedAt: new Date().toISOString(),
  source: {
    artifact: "data/reference/v2-baseline/fixtures/universe_floor0.json",
    sha256: "10624AFB7F413C2A1C3490C29B99E37A9FA5C0776A0A58F53DE6D7AF73B337E4",
    rows: canonical.length,
  },
  coverage: {
    canonicalEquities: canonical.length,
    candidateHoldingsBackedEtfs: candidate.length,
    retainedEtfs: retained.length,
    equitiesCovered: coverageRows.filter((row) => row.coverageStatus === "covered").length,
    equitiesUncovered: coverageRows.filter((row) => row.coverageStatus === "uncovered").length,
  },
  funds: retained.map((ticker) => {
    const directoryRow = directoryByTicker.get(ticker) ?? {};
    const rows = etfMap
      .get(ticker)
      .toSorted((left, right) => right.portfolioWeight - left.portfolioWeight);
    const sourceDates = rows
      .map((row) => row.sourceAsOfDate)
      .filter(Boolean)
      .sort();
    return {
      ticker,
      fundName: directoryRow.fundName ?? ticker,
      issuer: directoryRow.issuer ?? null,
      assetClass: directoryRow.assetClass ?? "ETF",
      category: directoryRow.category ?? null,
      sector: directoryRow.sector ?? null,
      industryOrTheme: directoryRow.industryOrTheme ?? null,
      strategyType: directoryRow.strategyType ?? null,
      leverageInverse: directoryRow.leverageInverse ?? false,
      activePassive: directoryRow.activePassive ?? null,
      singleStock: directoryRow.singleStock ?? false,
      equalWeight: directoryRow.equalWeight ?? false,
      scoredStatus: "reference-only",
      holdingsStatus: "partial",
      holdingsSource: [...new Set(rows.map((row) => row.source).filter(Boolean))].join("; "),
      holdingsAsOf: sourceDates.at(-1) ?? null,
      holdingsDepth: rows.length,
      reportedPortfolioWeightCoverage: rows.reduce((sum, row) => sum + row.portfolioWeight, 0),
      numberHoldings: rows.length,
      top10Weight: rows.slice(0, 10).reduce((sum, row) => sum + row.portfolioWeight, 0),
      top25Weight: rows.slice(0, 25).reduce((sum, row) => sum + row.portfolioWeight, 0),
      largestHolding: rows[0]?.constituentTicker ?? null,
      largestHoldingWeight: rows[0]?.portfolioWeight ?? null,
      dataFreshnessStatus:
        sourceDates.at(-1) && sourceDates.at(-1) < "2026-01-01" ? "stale" : "current",
    };
  }),
  rows: mappedRows,
  invertedIndex: Object.fromEntries(
    retained
      .flatMap((etf) => etfMap.get(etf))
      .reduce((map, row) => {
        const list = map.get(row.constituentTicker) ?? [];
        list.push({
          etfTicker: row.etfTicker,
          weight: row.portfolioWeight,
          holdingRank: row.holdingRank,
        });
        map.set(row.constituentTicker, list);
        return map;
      }, new Map()),
  ),
};
await writeFile(
  "apps/dashboard/public/data/etf-holdings-canonical.json",
  `${JSON.stringify(canonicalArtifact)}\n`,
  "utf8",
);
const csv = (rows) =>
  rows.map((row) => row.map((value) => JSON.stringify(value ?? "")).join(",")).join("\n") + "\n";
await mkdir(evidence, { recursive: true });
await writeFile(
  `${evidence}/CANONICAL_DASHBOARD_EQUITIES.csv`,
  csv([
    ["ticker", "name", "sector", "industry", "active"],
    ...canonical.map((row) => [row.ticker, row.name, row.sector, row.industry, row.active]),
  ]),
);
await writeFile(
  `${evidence}/DASHBOARD_EQUITY_ETF_COVERAGE.csv`,
  csv([
    [
      "ticker",
      "name",
      "sector",
      "industry",
      "candidate_etf_count",
      "retained_etf_count",
      "max_weight",
      "median_weight",
      "freshest_as_of",
      "stale_count",
      "partial_count",
      "coverage_status",
    ],
    ...coverageRows.map((row) => [
      row.ticker,
      row.name,
      row.sector,
      row.industry,
      row.candidateEtfCount,
      row.retainedEtfCount,
      row.maxWeight,
      row.medianWeight,
      row.freshestAsOf,
      row.staleCount,
      row.partialCount,
      row.coverageStatus,
    ]),
  ]),
);
await writeFile(
  `${evidence}/ETF_EQUIVALENCE_GROUPS.csv`,
  csv([
    ["group_id", "retained_etf", "excluded_etf", "status", "reason", "protected"],
    ...equivalenceRows,
  ]),
);
await writeFile(
  `${evidence}/UNCOVERED_DASHBOARD_EQUITIES.csv`,
  csv([
    ["ticker", "name", "sector", "industry", "reason"],
    ...coverageRows
      .filter((row) => row.coverageStatus === "uncovered")
      .map((row) => [
        row.ticker,
        row.name,
        row.sector,
        row.industry,
        "No mapped equity holding in current official/free source union",
      ]),
  ]),
);
await writeFile(
  `${evidence}/EXPANDED_VERIFIED_ETF_UNIVERSE.csv`,
  csv([
    ["ticker", "holdings_depth", "holdings_status", "scored_status"],
    ...retained.map((ticker) => [ticker, etfMap.get(ticker).length, "partial", "reference-only"]),
  ]),
);
await writeFile(
  `${evidence}/ETF_HOLDINGS_COVERAGE.csv`,
  csv([
    ["metric", "value"],
    ["canonical_equities", canonical.length],
    ["candidate_holdings_backed_etfs", candidate.length],
    ["retained_etfs", retained.length],
    ["equities_covered", coverageRows.filter((row) => row.coverageStatus === "covered").length],
    ["equities_uncovered", coverageRows.filter((row) => row.coverageStatus === "uncovered").length],
    [
      "coverage_percentage",
      `${((coverageRows.filter((row) => row.coverageStatus === "covered").length / canonical.length) * 100).toFixed(2)}%`,
    ],
    ["normalized_canonical_rows", mappedRows.length],
    ["minimum_etf_coverage", coveragePercentile(0)],
    ["median_etf_coverage", coveragePercentile(0.5)],
    ["p10_etf_coverage", coveragePercentile(0.1)],
    ["p25_etf_coverage", coveragePercentile(0.25)],
    ["p75_etf_coverage", coveragePercentile(0.75)],
    ["p90_etf_coverage", coveragePercentile(0.9)],
    ["p95_etf_coverage", coveragePercentile(0.95)],
    ["maximum_etf_coverage", coveragePercentile(1)],
  ]),
);
await writeFile(
  `${evidence}/CANONICAL_DASHBOARD_EQUITY_UNIVERSE.md`,
  "# Canonical dashboard equity universe\n\nThe active dashboard source is the frozen V2 no-floor fixture data/reference/v2-baseline/fixtures/universe_floor0.json, SHA-256 10624AFB7F413C2A1C3490C29B99E37A9FA5C0776A0A58F53DE6D7AF73B337E4. It contains 1,361 rows: 1,291 equities and 70 ETFs. ETF coverage metrics use exactly the 1,291 non-ETF rows.\n",
);
await writeFile(
  `${evidence}/ETF_DEDUPLICATION_METHOD.md`,
  "# Deduplication\n\nProjected signatures use only canonical dashboard-equity tickers and source weights. High overlap is not enough for exclusion. No automatic equivalence exclusions were made because official magnitude, structural, strategy, and completeness metadata are insufficient. SPY, IVV, and VOO are protected.\n",
);
await writeFile(
  `${evidence}/ETF_INTERSECTION_METHOD.md`,
  "# Intersection\n\nThe precomputed canonical inverted index returns an exact result only when every selected canonical ticker is present in the ETF map. Near matches remain separate. Directory-only ETFs are excluded from this index.\n",
);
await writeFile(
  `${evidence}/ETF_FULL_COVERAGE_REPORT.md`,
  `# ETF full coverage report\n\nCanonical dashboard equities: ${canonical.length}. Holdings-backed candidate ETFs: ${candidate.length}. Retained ETFs: ${retained.length}. Covered equities: ${coverageRows.filter((row) => row.coverageStatus === "covered").length}. Uncovered equities: ${coverageRows.filter((row) => row.coverageStatus === "uncovered").length}. Canonical normalized rows: ${mappedRows.length}.\n\nETF coverage per canonical equity: minimum ${coveragePercentile(0)}, median ${coveragePercentile(0.5)}, p10/p25/p75/p90/p95 ${coveragePercentile(0.1)}/${coveragePercentile(0.25)}/${coveragePercentile(0.75)}/${coveragePercentile(0.9)}/${coveragePercentile(0.95)}, maximum ${coveragePercentile(1)}.\n\nNo equivalence exclusions were made automatically. Coverage gaps are listed in UNCOVERED_DASHBOARD_EQUITIES.csv and remain unresolved source limitations.\n`,
);
console.log(JSON.stringify(canonicalArtifact.coverage));
