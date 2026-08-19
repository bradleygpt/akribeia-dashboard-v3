/* global console, process */

// Applies the governed security-exclusion registry to the canonical ETF
// coverage artifact by full recomputation of rows, inverted index, and
// coverage counts — never by cosmetically subtracting from displayed numbers.
// The preserved V2 baseline fixture is read-only input and is never modified.

import { readFile, writeFile } from "node:fs/promises";

const registry = JSON.parse(
  await readFile("data/reference/governed-security-exclusions.json", "utf8"),
);
const excluded = new Set(registry.exclusions.map(({ ticker }) => ticker.toUpperCase()));
if (excluded.size === 0) {
  console.log("No governed exclusions; nothing to apply.");
  process.exit(0);
}

const canonicalPath = "apps/dashboard/public/data/etf-holdings-canonical.json";
const canonical = JSON.parse(await readFile(canonicalPath, "utf8"));
const universe = JSON.parse(
  await readFile("data/reference/v2-baseline/fixtures/universe_floor0.json", "utf8"),
);

const before = {
  canonicalEquities: canonical.coverage.canonicalEquities,
  equitiesCovered: canonical.coverage.equitiesCovered,
  equitiesUncovered: canonical.coverage.equitiesUncovered,
  retainedEtfs: canonical.coverage.retainedEtfs,
  rows: canonical.rows.length,
  funds: canonical.funds.length,
  excludedRowsPresent: canonical.rows.filter((row) => excluded.has(row.constituentTicker)).length,
};

// Governed equity universe = preserved archive equities minus exclusions.
const governedEquities = universe.rows
  .filter((row) => row.sector !== "ETF" && !excluded.has(row.ticker.toUpperCase()))
  .map((row) => row.ticker.toUpperCase());
const governedEquitySet = new Set(governedEquities);

// Recompute rows and funds from scratch against the governed universe.
const rows = canonical.rows.filter((row) => governedEquitySet.has(row.constituentTicker));
const retainedEtfSet = new Set(rows.map((row) => row.etfTicker));
const funds = canonical.funds.filter((fund) => retainedEtfSet.has(fund.ticker));
const coveredEquities = new Set(rows.map((row) => row.constituentTicker));

// Recompute the inverted index from the governed rows.
const invertedIndex = {};
for (const row of rows) {
  const list = invertedIndex[row.constituentTicker] ?? [];
  list.push({
    etfTicker: row.etfTicker,
    weight: row.portfolioWeight,
    holdingRank: row.holdingRank,
  });
  invertedIndex[row.constituentTicker] = list;
}
// Preserve the original artifact's per-ticker ordering semantics (as-built
// order comes from row order, which is preserved by the filter above).

const artifact = {
  ...canonical,
  coverage: {
    ...canonical.coverage,
    canonicalEquities: governedEquities.length,
    retainedEtfs: funds.length,
    equitiesCovered: coveredEquities.size,
    equitiesUncovered: governedEquities.length - coveredEquities.size,
  },
  source: {
    ...canonical.source,
    governedExclusions: [...excluded].sort(),
    governedExclusionsRegistry: "data/reference/governed-security-exclusions.json",
    note: "The preserved V2 baseline archive is unmodified; exclusions are applied at derivation and all counts above are recomputed from the governed universe.",
  },
  funds,
  rows,
  invertedIndex,
};

await writeFile(canonicalPath, JSON.stringify(artifact));

const after = {
  canonicalEquities: artifact.coverage.canonicalEquities,
  equitiesCovered: artifact.coverage.equitiesCovered,
  equitiesUncovered: artifact.coverage.equitiesUncovered,
  retainedEtfs: artifact.coverage.retainedEtfs,
  rows: rows.length,
  funds: funds.length,
  excludedRowsPresent: rows.filter((row) => excluded.has(row.constituentTicker)).length,
  invertedIndexHasExcluded: [...excluded].filter((ticker) => ticker in invertedIndex),
};
console.log(JSON.stringify({ excludedTickers: [...excluded], before, after }, null, 2));
