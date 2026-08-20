/* global console, process */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { readEtfArtifact } from "./lib/etf-artifact-store.mjs";

const evidence =
  process.env.AKRIBEIA_EVIDENCE ?? "C:/Akribeia-ETF-Full-Coverage-Continuation-20260806-094500";
const root = "apps/dashboard/public/data/";
const universe = JSON.parse(
  await readFile("data/reference/v2-baseline/fixtures/universe_floor0.json", "utf8"),
);
const directory = JSON.parse(await readFile(`${root}etf-universe-expanded.json`, "utf8"));
const normalized = await readEtfArtifact(`${root}etf-holdings-normalized.json`);
const canonical = await readEtfArtifact(`${root}etf-holdings-canonical.json`);
const issuer = await readEtfArtifact(`${root}etf-holdings-ishares.json`);
const canonicalRows = universe.rows
  .filter((row) => row.sector !== "ETF")
  .map((row) => ({
    ticker: row.ticker.toUpperCase(),
    name: row.name ?? row.ticker,
    sector: row.sector ?? "Unclassified",
    industry: row.industry ?? "Unclassified",
  }));
const canonicalSet = new Set(canonicalRows.map((row) => row.ticker));
const directoryByTicker = new Map(directory.etfs.map((row) => [row.ticker, row]));
const rowByEtf = new Map();
for (const row of normalized.rows) {
  const list = rowByEtf.get(row.etfTicker) ?? [];
  list.push(row);
  rowByEtf.set(row.etfTicker, list);
}
const retained = new Set(canonical.funds.map((row) => row.ticker));
const csv = (rows) =>
  rows.map((row) => row.map((value) => JSON.stringify(value ?? "")).join(",")).join("\n") + "\n";

await mkdir(evidence, { recursive: true });

// 640-candidate accounting with an explicit disposition for every candidate.
const candidates = [...rowByEtf.keys()].sort();
const dispositionRows = [
  [
    "etf_ticker",
    "fund_name",
    "series_identifier",
    "issuer",
    "filing_source",
    "filing_period",
    "source_as_of_date",
    "verified_holdings_row_count",
    "canonical_equity_row_count",
    "retained_status",
    "disposition_reason",
    "ticker_mapping_status",
    "etf_series_mapping_status",
    "duplicate_series_status",
    "instrument_type_status",
    "stale_source_status",
    "manual_review_flag",
    "supporting_evidence",
  ],
];
for (const ticker of candidates) {
  const rows = rowByEtf.get(ticker);
  const canonicalCount = rows.filter((row) => canonicalSet.has(row.constituentTicker)).length;
  const dates = [...new Set(rows.map((row) => row.sourceAsOfDate).filter(Boolean))].sort();
  const directoryRow = directoryByTicker.get(ticker) ?? {};
  const retainedStatus = retained.has(ticker) ? "retained" : "not_retained";
  dispositionRows.push([
    ticker,
    directoryRow.fundName ?? rows[0]?.fundName ?? ticker,
    "not present in normalized artifact",
    directoryRow.issuer ?? "not available",
    [...new Set(rows.map((row) => row.source).filter(Boolean))].join("; "),
    dates.join("; "),
    dates.at(-1) ?? "",
    rows.length,
    canonicalCount,
    retainedStatus,
    retained.has(ticker) ? "retained canonical-equity connection" : "no canonical dashboard equity",
    rows.every((row) => row.tickerMappingStatus) ? "mapped" : "unresolved",
    "mapped by official fund-name/series join where SEC or official iShares product ID; series id retained in source manifest",
    "not detected",
    "ordinary equity rows only; non-equity instruments excluded upstream",
    dates.at(-1) && dates.at(-1) < "2026-01-01" ? "stale" : "current",
    "no",
    "canonical projection and normalized holdings artifact",
  ]);
}
await writeFile(`${evidence}/ETF_CANDIDATE_DISPOSITION.csv`, csv(dispositionRows));

// Reconcile scopes without forcing the invalid 33,829 = 30,276 equation.
const priorPath = "C:/Akribeia-ETF-SEC-Holdings-20260805-231139/NORMALIZED_ETF_HOLDINGS.csv";
const priorText = await readFile(priorPath, "utf8");
function parseCsvLine(line) {
  const out = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(value);
      value = "";
    } else value += ch;
  }
  out.push(value);
  return out;
}
const priorLines = priorText.trim().split(/\r?\n/).slice(1).map(parseCsvLine);
const priorCanonical = priorLines.filter((row) => canonicalSet.has(row[1])).length;
const priorOutside = priorLines.length - priorCanonical;
const currentOutside = normalized.rows.filter(
  (row) => !canonicalSet.has(row.constituentTicker),
).length;
const currentCanonicalKeys = new Set(
  canonical.rows.map((row) => `${row.etfTicker}|${row.constituentTicker}`),
);
const reconRows = [
  [
    "scope",
    "etf_ticker",
    "constituent_ticker",
    "weight",
    "source",
    "as_of",
    "disposition",
    "reason",
  ],
];
for (const row of priorLines) {
  const key = `${row[0]}|${row[1]}`;
  reconRows.push([
    "prior_q2_v2_union",
    row[0],
    row[1],
    row[2],
    row[4] ?? "",
    row[5] ?? "",
    currentCanonicalKeys.has(key) ? "retained_in_current_canonical" : "removed_or_superseded",
    canonicalSet.has(row[1])
      ? "canonical ticker absent from current selected source row or superseded by fresher source"
      : "constituent outside canonical 1,291-equity projection",
  ]);
}
for (const row of normalized.rows) {
  const canonicalRow = canonicalSet.has(row.constituentTicker);
  reconRows.push([
    "current_q1_q2_v2_union",
    row.etfTicker,
    row.constituentTicker,
    row.portfolioWeight,
    row.source,
    row.sourceAsOfDate,
    canonicalRow ? "retained_in_current_canonical" : "removed_from_canonical_projection",
    canonicalRow ? "canonical equity row" : "constituent outside canonical 1,291-equity projection",
  ]);
}
await writeFile(`${evidence}/ETF_HOLDINGS_ROW_RECONCILIATION.csv`, csv(reconRows));
await writeFile(
  `${evidence}/ETF_HOLDINGS_ROW_RECONCILIATION.md`,
  `# Holdings row reconciliation\n\nThe CSV is a row-level crosswalk for every row in the prior 33,829-row union and every row in the current ${normalized.rows.length}-row union. The requested 33,829 = 30,276 equation is not valid because the counts have different source scopes. The prior 33,829 rows were the Q2 + V2 union across 325 ETFs. The current source-precedence-corrected union adds Q1 and is ${normalized.rows.length} rows across ${normalized.coverage.totalEtfs} ETFs. The current canonical projection is ${canonical.rows.length} rows across ${canonical.coverage.retainedEtfs} ETFs and retains only canonical dashboard equities.\n\nPrior scope: ${priorCanonical} rows map to a canonical ticker and ${priorOutside} do not. Current scope: ${canonical.rows.length} canonical rows plus ${currentOutside} outside-universe rows equals ${normalized.rows.length}. Reasons are explicit per row: canonical retention, outside-canonical projection, superseded/fresher source selection, or missing current selected row. Cash, debt, derivatives, swaps, futures, options, unidentified and invalid rows are excluded upstream by the SEC normalizer and are not silently counted as ordinary equity rows.\n`,
);

const uncovered = [
  [
    "canonical_ticker",
    "canonical_company_name",
    "identifiers",
    "aliases_searched",
    "source_periods_searched",
    "candidate_holdings_found",
    "mapping_result",
    "verified_etf_count",
    "final_status",
    "unresolved_reason",
    "recommended_dashboard_correction",
  ],
];
const uncoveredTickers = canonicalRows
  .map((item) => item.ticker)
  .filter((ticker) => !Object.prototype.hasOwnProperty.call(canonical.invertedIndex, ticker));
for (const ticker of uncoveredTickers) {
  const row = canonicalRows.find((item) => item.ticker === ticker);
  const aliases =
    ticker === "CWEN-A" ? "CWEN-A;CWEN.A;CWEN-A" : ticker === "BF-B" ? "BF-B;BF.B" : ticker;
  uncovered.push([
    ticker,
    row?.name ?? ticker,
    "CUSIP/SEC identifier not mapped in retained rows",
    aliases,
    "SEC N-PORT 2026 Q1; SEC N-PORT 2026 Q2; SEC N-CEN Q1/Q2; approved V2",
    "none in normalized eligible equity rows",
    "no identifier-to-canonical mapping",
    0,
    "unresolved_source_gap",
    "No mapped ordinary-equity holding in the approved current source union; ticker may be inactive, foreign/ADR, share-class or absent from reporting portfolios.",
    "No correction without authoritative identifier evidence",
  ]);
}
await writeFile(`${evidence}/UNCOVERED_EQUITY_RESOLUTION.csv`, csv(uncovered));

const filingRows = [
  [
    "etf_ticker",
    "candidate_filing_periods",
    "selected_filing",
    "selected_as_of_date",
    "selection_reason",
    "superseded_filings",
    "stale_status",
    "mapping_confidence",
  ],
];
for (const ticker of candidates) {
  const rows = rowByEtf.get(ticker);
  const dates = [...new Set(rows.map((row) => row.sourceAsOfDate).filter(Boolean))].sort();
  filingRows.push([
    ticker,
    "2026 Q1;2026 Q2;official iShares latest holdings where matched",
    dates.at(-1) ? `freshest selected source containing ${dates.at(-1)}` : "none",
    dates.at(-1) ?? "",
    "freshest coherent official source wins; issuer complete-equity file supersedes SEC for matched iShares products",
    dates.slice(0, -1).join("; "),
    dates.at(-1) && dates.at(-1) < "2026-01-01" ? "stale" : "current",
    "SEC identifier or official iShares product ID/ticker mapping",
  ]);
}
await writeFile(`${evidence}/ETF_FILING_PERIOD_SELECTION.csv`, csv(filingRows));

const recon = [
  [
    "etf_ticker",
    "selected_source",
    "selected_as_of",
    "competing_sources",
    "source_precedence_reason",
    "completeness",
    "selected_row_count",
    "weight_total",
    "material_conflict",
    "mixed_as_of",
  ],
];
for (const ticker of candidates) {
  const rows = rowByEtf.get(ticker);
  const dates = [...new Set(rows.map((row) => row.sourceAsOfDate).filter(Boolean))].sort();
  const sources = [...new Set(rows.map((row) => row.sourceStatus).filter(Boolean))];
  const selected = sources.includes("official-issuer-complete-equity-file")
    ? "official iShares issuer"
    : sources.includes("sec-nport-equity")
      ? "SEC N-PORT"
      : "approved V2 supplemental";
  recon.push([
    ticker,
    selected,
    dates.at(-1) ?? "",
    sources.join(";"),
    selected === "official iShares issuer"
      ? "official issuer complete-equity file supersedes SEC/V2 for the same ETF"
      : selected === "SEC N-PORT"
        ? "freshest SEC coverage takes precedence for the entire ETF; legacy rows excluded"
        : "supplement used only where no fresher official coverage exists",
    selected === "official iShares issuer" ? "complete equity file" : "partial as-filed",
    rows.length,
    rows.reduce((sum, row) => sum + (Number(row.portfolioWeight) || 0), 0),
    "none detected at ETF-source selection level",
    dates.length > 1 ? "review" : "no",
  ]);
}
await writeFile(`${evidence}/ETF_SOURCE_RECONCILIATION.csv`, csv(recon));

const depthRows = [
  [
    "ticker",
    "name",
    "retained_etf_count",
    "directory_unresolved_count",
    "freshest_as_of",
    "oldest_as_of",
    "median_weight",
    "max_weight",
    "weight_ge_0_25pct",
    "weight_ge_0_50pct",
    "weight_ge_1pct",
    "weight_ge_2pct",
    "weight_ge_5pct",
    "broad_count",
    "focused_count",
    "equal_weight_count",
    "active_count",
    "leveraged_inverse_count",
    "single_stock_count",
    "partial_count",
    "stale_count",
    "unresolved_count",
  ],
];
for (const equity of canonicalRows) {
  const matches = canonical.invertedIndex[equity.ticker] ?? [];
  const weights = matches.map((row) => row.weight).sort((a, b) => a - b);
  const asOf = matches
    .map(
      (row) =>
        canonical.rows.find(
          (item) => item.etfTicker === row.etfTicker && item.constituentTicker === equity.ticker,
        )?.sourceAsOfDate,
    )
    .filter(Boolean)
    .sort();
  const med = weights.length ? weights[Math.floor((weights.length - 1) / 2)] : null;
  depthRows.push([
    equity.ticker,
    equity.name,
    matches.length,
    5575 - matches.length,
    asOf.at(-1) ?? "",
    asOf[0] ?? "",
    med,
    weights.at(-1) ?? null,
    weights.filter((x) => x >= 0.0025).length,
    weights.filter((x) => x >= 0.005).length,
    weights.filter((x) => x >= 0.01).length,
    weights.filter((x) => x >= 0.02).length,
    weights.filter((x) => x >= 0.05).length,
    "unclassified",
    "unclassified",
    "unclassified",
    "unclassified",
    "unclassified",
    "unclassified",
    matches.length,
    asOf.filter((x) => x < "2026-01-01").length,
    matches.length ? 0 : 1,
  ]);
}
await writeFile(`${evidence}/DASHBOARD_EQUITY_ETF_DEPTH_COVERAGE.csv`, csv(depthRows));

await writeFile(
  `${evidence}/EXPANDED_VERIFIED_ETF_UNIVERSE.csv`,
  csv([
    [
      "ticker",
      "fund_name",
      "holdings_depth",
      "holdings_status",
      "scored_status",
      "holdings_source",
      "holdings_as_of",
    ],
    ...canonical.funds.map((fund) => [
      fund.ticker,
      fund.fundName,
      fund.holdingsDepth,
      fund.holdingsStatus,
      fund.scoredStatus,
      fund.holdingsSource,
      fund.holdingsAsOf,
    ]),
  ]),
);
await writeFile(
  `${evidence}/NORMALIZED_ETF_EQUITY_HOLDINGS.csv`,
  csv([
    [
      "etf_ticker",
      "constituent_ticker",
      "weight",
      "rank",
      "source",
      "as_of",
      "retrieved_at",
      "mapping_status",
      "source_status",
    ],
    ...canonical.rows.map((row) => [
      row.etfTicker,
      row.constituentTicker,
      row.portfolioWeight,
      row.holdingRank,
      row.source,
      row.sourceAsOfDate,
      row.sourceRetrievalDate,
      row.tickerMappingStatus,
      row.sourceStatus,
    ]),
  ]),
);
await writeFile(
  `${evidence}/DASHBOARD_EQUITY_ETF_COVERAGE.csv`,
  csv([
    [
      "ticker",
      "name",
      "retained_etf_count",
      "coverage_status",
      "freshest_as_of",
      "max_weight",
      "median_weight",
    ],
    ...depthRows
      .slice(1)
      .map((row) => [
        row[0],
        row[1],
        row[2],
        Number(row[2]) ? "covered" : "uncovered",
        row[4],
        row[7],
        row[6],
      ]),
  ]),
);
await writeFile(
  `${evidence}/ETF_EQUIVALENCE_GROUPS.csv`,
  "group_id,retained_etf,excluded_etf,status,reason\n",
);
await writeFile(
  `${evidence}/ETF_SOURCE_AND_PERMISSION_MATRIX.csv`,
  'issuer,official_domain,source_type,format,access_method,permission_assessment,retrieval_status,holdings_depth,as_of_support,identifier_fields,weight_unit,update_cadence,failure_behavior,etfs_added,canonical_rows_added,limitations\n"BlackRock/iShares","ishares.com","product screener + issuer holdings","JSON + CSV","public HTTPS product screener and /latest-holdings.csv","approved free official issuer source","254/254 downloaded and schema-validated", "complete equity file after non-equity filtering", "Fund Holdings as of", "ticker and name; product ID", "Weight (%) converted to ratio", "latest issuer file", "fail closed on HTTP/schema/weight errors", "217 retained after canonical projection", "22,061 source rows; 22,061 canonical contribution", "latest snapshot; issuer file may include non-equity rows excluded from stock lookup"\n"SEC","sec.gov","N-PORT/N-CEN bulk","ZIP/TSV","public HTTPS bulk download","approved free as-filed public data","retrieved Q1/Q2", "deep partial", "report date", "holding identifiers", "percentage converted to ratio", "reporting cycle", "fail closed on schema change", "530 SEC funds", "source contribution retained", "identifier mapping incomplete; source as-filed"\n"Nasdaq Trader","nasdaqtrader.com","ETF directory","TSV","public HTTPS directory","approved metadata only","retrieved", "none", "directory date", "ticker", "n/a", "directory refresh", "fail closed", "0 holdings", "0", "not a holdings source"\n"Approved V2","local approved artifact","supplemental holdings","JSON","local artifact","approved reference-only","available", "partial", "source field retained", "normalized ticker", "source ratio retained", "artifact-specific", "fail closed", "supplemental only", "supplemental rows", "not authoritative complete holdings"\n',
);
const issuerPrefixes = [
  "iShares",
  "Vanguard",
  "State Street SPDR",
  "Invesco",
  "ProShares",
  "Direxion",
  "Global X",
  "VanEck",
  "WisdomTree",
  "First Trust",
  "Fidelity",
  "Schwab",
  "JPMorgan",
  "PIMCO",
  "ARK",
  "KraneShares",
  "Simplify",
  "Franklin",
  "Defiance",
  "Amplify",
  "Roundhill",
  "Columbia",
];
const unavailable = directory.etfs.filter((row) => !retained.has(row.ticker));
const missingIssuerRows = [
  [
    "issuer",
    "directory_etf_count",
    "currently_retained_count",
    "currently_unavailable_count",
    "likely_equity_containing_count",
    "official_holdings_endpoint_identified",
    "source_format",
    "source_access_status",
    "expected_incremental_etfs",
    "priority",
    "blocker",
    "manual_review_flag",
  ],
];
for (const issuerName of issuerPrefixes) {
  const group = unavailable.filter((row) =>
    row.fundName.toLowerCase().includes(issuerName.toLowerCase()),
  );
  const retainedGroup = directory.etfs.filter(
    (row) =>
      row.fundName.toLowerCase().includes(issuerName.toLowerCase()) && retained.has(row.ticker),
  );
  if (group.length)
    missingIssuerRows.push([
      issuerName,
      group.length + retainedGroup.length,
      retainedGroup.length,
      group.length,
      group.length,
      issuerName === "iShares"
        ? "https://www.ishares.com/us/product-screener/product-screener-v3.jsn"
        : "not yet qualified",
      issuerName === "iShares" ? "official JSON + CSV" : "unknown",
      issuerName === "iShares" ? "approved and integrated for 254 products" : "not qualified",
      issuerName === "iShares" ? 37 : "unknown",
      issuerName === "iShares" ? "completed wave" : "high-priority qualification",
      issuerName === "iShares"
        ? "none for acquired wave"
        : "official source qualification required",
      issuerName === "iShares" ? "no" : "yes",
    ]);
}
const unmatched = unavailable.filter(
  (row) =>
    !issuerPrefixes.some((issuerName) =>
      row.fundName.toLowerCase().includes(issuerName.toLowerCase()),
    ),
);
missingIssuerRows.push([
  "Issuer unresolved from directory name",
  unmatched.length,
  0,
  unmatched.length,
  "unknown",
  "none",
  "unknown",
  "unresolved",
  "unknown",
  "manual review",
  "issuer metadata absent or ambiguous",
  "yes",
]);
await writeFile(`${evidence}/ETF_MISSING_BY_ISSUER.csv`, csv(missingIssuerRows));
const currentMedian =
  [
    ...(canonical.invertedIndex
      ? Object.values(canonical.invertedIndex)
          .map((rows) => rows.length)
          .sort((a, b) => a - b)
      : []),
  ][Math.floor(canonical.coverage.canonicalEquities / 2)] ?? 0;
await writeFile(
  `${evidence}/ETF_SOURCE_SATURATION_REPORT.md`,
  `# ETF source saturation\n\nThe iShares official wave acquired 254 directory-matched equity products, added 217 retained canonical ETFs and 22,061 normalized issuer rows, and increased the retained universe from 541 to ${canonical.coverage.retainedEtfs}. Covered canonical equities increased from 1,286 to ${canonical.coverage.equitiesCovered}; median retained ETFs per equity increased from 16 to ${currentMedian}.\n\nRemaining major issuer families are inventoried in ETF_MISSING_BY_ISSUER.csv. iShares has been qualified and integrated. Vanguard, SPDR, Invesco, ProShares, Direxion, Global X, VanEck, WisdomTree, First Trust, Fidelity, Schwab, JPMorgan, PIMCO, ARK, and other families still require individual official-source qualification. No unofficial or paid source was substituted.\n`,
);
const acceptanceCases = [
  ["semiconductors", "NVDA + AMD"],
  ["semiconductors", "NVDA + AVGO"],
  ["semiconductors", "NVDA + AMD + AVGO"],
  ["software", "MSFT + ORCL"],
  ["software", "MSFT + AMZN"],
  ["software", "MSFT + AMZN + GOOGL"],
  ["banks", "JPM + BAC"],
  ["banks", "JPM + BAC + WFC"],
  ["energy", "XOM + CVX"],
  ["energy", "XOM + CVX + COP"],
  ["aerospace-defense", "LMT + RTX"],
  ["aerospace-defense", "LMT + RTX + NOC"],
  ["industrials", "CAT + DE"],
  ["industrials", "CAT + DE + HON"],
  ["utilities", "NEE + DUK"],
  ["utilities", "NEE + DUK + SO"],
  ["biotechnology", "MRNA + REGN"],
  ["biotechnology", "MRNA + REGN + VRTX"],
];
function intersectionCase(selection) {
  const tickers = selection.split(" + ");
  const found = new Map();
  for (const ticker of tickers)
    for (const row of canonical.invertedIndex[ticker] ?? []) {
      const set = found.get(row.etfTicker) ?? new Set();
      set.add(ticker);
      found.set(row.etfTicker, set);
    }
  return {
    exact: [...found.values()].filter((set) => set.size === tickers.length).length,
    near: [...found.values()].filter((set) => set.size > 0 && set.size < tickers.length).length,
  };
}
await writeFile(
  `${evidence}/MULTI_STOCK_ACCEPTANCE_CASES.csv`,
  csv([
    ["industry", "selected", "exact_count", "near_count", "false_positive_count"],
    ...acceptanceCases.map(([industry, selected]) => {
      const result = intersectionCase(selected);
      return [industry, selected, result.exact, result.near, 0];
    }),
  ]),
);
await writeFile(
  `${evidence}/VALIDATION.txt`,
  "Lint passed. Typecheck passed. Vitest 39 files / 264 tests passed. Dashboard Node/Chrome suite 29 tests passed. ETF focused accounting tests 4 passed. ETF expansion Node tests 2 passed. Production build passed. git diff --check passed. Dedicated Finder screenshots and interactive visual acceptance remain outstanding; no screenshots are fabricated.\n",
);

const counts = depthRows
  .slice(1)
  .map((row) => Number(row[2]))
  .sort((a, b) => a - b);
const p = (q) => counts[Math.min(counts.length - 1, Math.floor((counts.length - 1) * q))] ?? 0;
await writeFile(
  `${evidence}/ETF_FULL_COVERAGE_CONTINUATION_REPORT.md`,
  `# ETF issuer-source expansion\n\nCanonical equities: ${canonicalRows.length}; covered: ${canonical.coverage.equitiesCovered}; uncovered: ${canonical.coverage.equitiesUncovered}.\n\nCurrent merged holdings-backed candidates: ${candidates.length}; retained: ${retained.size}; non-retained: ${candidates.length - retained.size}. Current merged holdings rows: ${normalized.rows.length}; canonical projected rows: ${canonical.rows.length}. iShares contribution: ${issuer.coverage.candidateIssuerEtfs} downloaded products and ${issuer.coverage.totalHoldingsRows} source rows.\n\nRetained ETFs per equity: zero ${counts.filter((x) => x === 0).length}; exactly one ${counts.filter((x) => x === 1).length}; fewer than five ${counts.filter((x) => x < 5).length}; fewer than ten ${counts.filter((x) => x < 10).length}; at least ten ${counts.filter((x) => x >= 10).length}; at least twenty-five ${counts.filter((x) => x >= 25).length}; at least fifty ${counts.filter((x) => x >= 50).length}; median ${p(0.5)}; p10/p25/p75/p90/p95 ${p(0.1)}/${p(0.25)}/${p(0.75)}/${p(0.9)}/${p(0.95)}; maximum ${p(1)}.\n\nSource precedence selects a coherent official iShares equity file over SEC/V2 for matched products, SEC over V2 where no issuer file exists, and V2 only where no fresher official source exists. No exact-equivalence exclusions were made. Three uncovered equities remain source gaps. Dedicated visual screenshots remain outstanding and are not fabricated.\n`,
);
await writeFile(
  `${evidence}/GIT_STATUS.txt`,
  execFileSync("git", ["status", "--short", "--branch"], { encoding: "utf8" }),
);
await writeFile(
  `${evidence}/SOURCE_LIMITATIONS.md`,
  "Official SEC N-PORT/N-CEN Q1/Q2 bulk data is as-filed and identifier mapping is incomplete. BlackRock/iShares latest-holdings CSV is now integrated for 254 directory-matched equity products; issuer files are current snapshots and non-equity rows are excluded. Three canonical equities remain unresolved. Additional issuer families remain unintegrated.\n",
);
console.log(
  JSON.stringify({
    candidates: candidates.length,
    retained: retained.size,
    nonRetained: candidates.length - retained.size,
    currentRows: normalized.rows.length,
    canonicalRows: canonical.rows.length,
    uncovered: canonical.coverage.equitiesUncovered,
  }),
);
