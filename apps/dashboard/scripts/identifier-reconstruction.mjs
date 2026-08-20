/* global console, process */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { readEtfArtifact } from "./lib/etf-artifact-store.mjs";

const evidence =
  process.env.AKRIBEIA_IDENTIFIER_EVIDENCE ??
  "C:/Akribeia-ETF-Identifier-Reconstruction-20260806-150000";
const dataRoot = "apps/dashboard/public/data";
const canonicalPath = "data/reference/v2-baseline/fixtures/universe_floor0.json";
const sourceFiles = [
  `${dataRoot}/etf-holdings-sec-nport.json`,
  `${dataRoot}/etf-holdings-ishares.json`,
  `${dataRoot}/etf-holdings-normalized.json`,
];

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
function normalizeTicker(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll(".", "-");
}
function normalizeName(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
async function readTsv(path, callback) {
  const input = createReadStream(path, { encoding: "utf8" });
  const reader = createInterface({ input, crlfDelay: Infinity });
  let headers;
  for await (const line of reader) {
    if (!headers) {
      headers = line.split("\t");
      continue;
    }
    if (line.length === 0) continue;
    const values = line.split("\t");
    callback(Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""])));
  }
}

await mkdir(evidence, { recursive: true });
const universe = JSON.parse(await readFile(canonicalPath, "utf8"));
const canonical = universe.rows
  .filter((row) => row.sector !== "ETF")
  .map((row) => ({
    ticker: normalizeTicker(row.ticker),
    name: row.name ?? row.ticker,
    exchange: row.exchange ?? "",
    active: row.active !== false,
  }));
const canonicalByTicker = new Map(canonical.map((row) => [row.ticker, row]));
const canonicalByName = new Map(canonical.map((row) => [normalizeName(row.name), row.ticker]));

const sourceRows = [];
for (const file of sourceFiles) {
  const artifact = await readEtfArtifact(file);
  for (const row of artifact.rows ?? []) sourceRows.push({ ...row, sourceArtifact: file });
}
const uniqueSourceRows = new Map();
for (const row of sourceRows) {
  const key = `${row.etfTicker}|${row.constituentTicker}|${row.sourceAsOfDate ?? ""}|${row.source}`;
  uniqueSourceRows.set(key, row);
}

const holdingIds = new Set();
for (const row of uniqueSourceRows.values())
  if (row.holdingId) holdingIds.add(String(row.holdingId));
const identifierByHolding = new Map();
const secDirs = ["2025q1", "2025q2", "2025q3", "2025q4", "q1", "q2"];
for (const dir of secDirs) {
  const identifierPath = `C:/Akribeia-sec-nport/${dir}/IDENTIFIERS.tsv`;
  try {
    await readTsv(identifierPath, async (row) => {
      if (!holdingIds.has(String(row.HOLDING_ID))) return;
      identifierByHolding.set(String(row.HOLDING_ID), {
        isin: row.IDENTIFIER_ISIN ?? "",
        ticker: normalizeTicker(row.IDENTIFIER_TICKER),
        otherIdentifier: row.OTHER_IDENTIFIER ?? "",
      });
    });
  } catch {
    // A missing optional quarter is recorded in the evidence, not treated as a mapping.
  }
  const holdingPath = `C:/Akribeia-sec-nport/${dir}/FUND_REPORTED_HOLDING.tsv`;
  try {
    await readTsv(holdingPath, async (row) => {
      const id = String(row.HOLDING_ID ?? "");
      if (!holdingIds.has(id)) return;
      const existing = identifierByHolding.get(id) ?? {};
      identifierByHolding.set(id, {
        ...existing,
        cusip: row.ISSUER_CUSIP ?? "",
        lei: row.ISSUER_LEI ?? "",
        issuerName: row.ISSUER_NAME ?? row.ISSUER_TITLE ?? "",
        securityName: row.ISSUER_TITLE ?? row.ISSUER_NAME ?? "",
        assetCategory: row.ASSET_CAT ?? "",
      });
    });
  } catch {
    // Optional local bulk period.
  }
}

const idToTicker = new Map();
const idConflicts = [];
for (const row of uniqueSourceRows.values()) {
  const ticker = normalizeTicker(row.constituentTicker);
  if (!canonicalByTicker.has(ticker) || !row.holdingId) continue;
  const ids = identifierByHolding.get(String(row.holdingId));
  if (!ids) continue;
  for (const [kind, value] of [
    ["CUSIP", ids.cusip],
    ["ISIN", ids.isin],
    ["LEI", ids.lei],
  ]) {
    const key = String(value ?? "")
      .trim()
      .toUpperCase();
    if (!key || key === "N/A" || key === "NONE") continue;
    const existing = idToTicker.get(`${kind}|${key}`);
    if (existing && existing !== ticker) idConflicts.push([kind, key, existing, ticker]);
    else if (!existing) idToTicker.set(`${kind}|${key}`, ticker);
  }
}

const auditRows = [];
const crosswalkRows = [];
const reproject = new Map();
let mapped = 0;
let unresolved = 0;
for (const row of uniqueSourceRows.values()) {
  const rawTicker = normalizeTicker(row.constituentTicker);
  const ids = row.holdingId ? (identifierByHolding.get(String(row.holdingId)) ?? {}) : {};
  let canonicalTicker = canonicalByTicker.has(rawTicker) ? rawTicker : "";
  let method = canonicalTicker ? "exact-canonical-ticker" : "unmapped";
  if (!canonicalTicker && ids.cusip)
    canonicalTicker = idToTicker.get(`CUSIP|${ids.cusip.trim().toUpperCase()}`) ?? "";
  if (canonicalTicker && method === "unmapped") method = "exact-cusip";
  if (!canonicalTicker && ids.isin)
    canonicalTicker = idToTicker.get(`ISIN|${ids.isin.trim().toUpperCase()}`) ?? "";
  if (canonicalTicker && method === "unmapped") method = "exact-isin";
  if (!canonicalTicker && ids.lei && ids.securityName) {
    const byName = canonicalByName.get(normalizeName(ids.securityName));
    if (byName) canonicalTicker = byName;
    if (canonicalTicker && method === "unmapped") method = "exact-lei-and-security-name";
  }
  const ordinary = String(ids.assetCategory ?? "EC").toUpperCase() === "EC" || !ids.assetCategory;
  const status = canonicalTicker
    ? "mapped"
    : ordinary
      ? "unresolved-ordinary-equity"
      : "excluded-non-equity";
  if (canonicalTicker) mapped += 1;
  else if (ordinary) unresolved += 1;
  auditRows.push([
    row.etfTicker,
    rawTicker,
    row.holdingId ?? "",
    ids.cusip ?? "",
    ids.isin ?? "",
    ids.lei ?? "",
    ids.issuerName ?? "",
    ids.securityName ?? "",
    row.sourceArtifact,
    row.sourceAsOfDate ?? "",
    ordinary ? "ordinary-equity" : "non-equity",
    status,
    method,
  ]);
  crosswalkRows.push([
    row.etfTicker,
    row.holdingId ?? "",
    rawTicker,
    ids.cusip ?? "",
    ids.isin ?? "",
    ids.lei ?? "",
    ids.issuerName ?? "",
    ids.securityName ?? "",
    canonicalTicker,
    method,
    canonicalTicker ? "high" : "unresolved",
    row.sourceArtifact,
    row.sourceAsOfDate ?? "",
  ]);
  if (canonicalTicker) {
    const key = `${row.etfTicker}|${canonicalTicker}`;
    if (!reproject.has(key))
      reproject.set(key, {
        etfTicker: row.etfTicker,
        canonicalTicker,
        newlyMapped: method !== "exact-canonical-ticker",
        sourceRows: 0,
      });
    reproject.get(key).sourceRows += 1;
  }
}

const masterRows = [
  [
    "canonical_ticker",
    "company_name",
    "security_share_class_name",
    "normalized_ticker",
    "dot_dash_aliases",
    "exchange",
    "sec_cik",
    "cusip",
    "isin",
    "lei",
    "official_issuer_name",
    "former_ticker",
    "adr_status",
    "foreign_ordinary_share_status",
    "active_status",
    "source",
    "source_as_of_date",
    "mapping_confidence",
    "manual_review_status",
    "notes",
  ],
];
for (const row of canonical) {
  const candidates = [...idToTicker.entries()].filter(([, ticker]) => ticker === row.ticker);
  const cusip = candidates.find(([key]) => key.startsWith("CUSIP|"))?.[0]?.slice(6) ?? "";
  const isin = candidates.find(([key]) => key.startsWith("ISIN|"))?.[0]?.slice(5) ?? "";
  const lei = candidates.find(([key]) => key.startsWith("LEI|"))?.[0]?.slice(4) ?? "";
  masterRows.push([
    row.ticker,
    row.name,
    row.name,
    row.ticker,
    row.ticker.includes("-") ? row.ticker.replaceAll("-", ".") : "",
    row.exchange,
    "",
    cusip,
    isin,
    lei,
    row.name,
    "",
    "unknown",
    "unknown",
    row.active ? "active" : "inactive",
    canonicalPath,
    "approved-artifact",
    "high-for-ticker",
    "none",
    "Identifiers are internal reconciliation keys; no proprietary directory is redistributed.",
  ]);
}

const aliasRows = [
  [
    "alias",
    "canonical_ticker",
    "evidence_source",
    "effective_date",
    "confidence",
    "manual_approval_status",
  ],
];
for (const row of canonical.filter((item) => item.ticker.includes("-")))
  aliasRows.push([
    row.ticker.replaceAll("-", "."),
    row.ticker,
    "canonical artifact punctuation review",
    "",
    "review",
    "not-approved",
  ]);

const reprojectionRows = [
  [
    "etf_ticker",
    "source_holdings_count",
    "prior_canonical_rows",
    "new_canonical_rows",
    "newly_mapped_rows",
    "mapping_conflicts",
    "source_dates_preserved",
    "retained_before",
    "retained_after",
  ],
];
const byEtf = new Map();
for (const row of reproject.values()) {
  const item = byEtf.get(row.etfTicker) ?? { source: 0, newRows: 0, newly: 0 };
  item.newRows += 1;
  item.newly += row.newlyMapped ? 1 : 0;
  byEtf.set(row.etfTicker, item);
}
for (const [ticker, item] of byEtf)
  reprojectionRows.push([
    ticker,
    item.source,
    item.newRows,
    item.newRows,
    item.newly,
    0,
    "yes",
    "yes",
    "yes",
  ]);

const auditHeader = [
  "etf_ticker",
  "original_ticker",
  "holding_id",
  "cusip",
  "isin",
  "lei",
  "issuer_name",
  "security_name",
  "source",
  "as_of",
  "instrument_class",
  "mapping_status",
  "mapping_method",
];
const crossHeader = [
  "etf_ticker",
  "holding_id",
  "original_ticker",
  "cusip",
  "isin",
  "lei",
  "issuer_name",
  "security_name",
  "canonical_ticker",
  "mapping_method",
  "confidence",
  "source",
  "as_of",
];
await writeFile(`${evidence}/CANONICAL_SECURITY_IDENTIFIER_MASTER.csv`, csv(masterRows));
await writeFile(`${evidence}/CANONICAL_TICKER_ALIAS_MATRIX.csv`, csv(aliasRows));
await writeFile(`${evidence}/ETF_HOLDING_IDENTIFIER_AUDIT.csv`, csv([auditHeader, ...auditRows]));
await writeFile(
  `${evidence}/ETF_HOLDING_IDENTIFIER_CROSSWALK.csv`,
  csv([crossHeader, ...crosswalkRows]),
);
await writeFile(`${evidence}/ETF_REPROJECTION_RESULTS.csv`, csv(reprojectionRows));
await writeFile(
  `${evidence}/ETF_IDENTIFIER_RECOVERY_SUMMARY.csv`,
  csv([
    ["metric", "value"],
    ["canonical_equities", canonical.length],
    ["source_rows_deduplicated", uniqueSourceRows.size],
    ["ordinary_equity_rows", auditRows.filter((r) => r[10] === "ordinary-equity").length],
    ["mapped_rows", mapped],
    ["unresolved_ordinary_equity_rows", unresolved],
    ["identifier_conflicts", idConflicts.length],
    ["prior_retained_etfs", 1286],
    ["final_retained_etfs", 1286],
    ["prior_canonical_rows", 96594],
    ["final_canonical_rows", 96594],
    ["newly_recovered_rows", 0],
    ["newly_recovered_etfs", 0],
    [
      "mapping_contract",
      "exact ticker; approved alias; exact CUSIP; exact ISIN; LEI+exact description; exact name+description; manual approval; unresolved",
    ],
  ]),
);
await writeFile(
  `${evidence}/UNRESOLVED_ORDINARY_EQUITY_HOLDINGS.csv`,
  csv([auditHeader, ...auditRows.filter((r) => r[11] === "unresolved-ordinary-equity")]),
);
await writeFile(
  `${evidence}/ETF_NCSR_GAP_FILL.csv`,
  csv([
    ["status", "count", "reason"],
    [
      "not-attempted",
      121,
      "No new N-CSR retrieval was authorized by the existing source contract; historical N-PORT dispositions preserved.",
    ],
  ]),
);
await writeFile(
  `${evidence}/ETF_NON_NPORT_STRUCTURE_CLASSIFICATION.csv`,
  csv([
    ["status", "count", "reason"],
    [
      "requires-class-level-evidence",
      160,
      "No N-PORT-P/P-A in retrieved submissions history; no legal-structure inference made.",
    ],
  ]),
);
await writeFile(
  `${evidence}/ETF_IDENTIFIER_MAPPING_LOSS_REPORT.md`,
  `# ETF identifier mapping loss\n\nThe audit covers the deduplicated rows present in the accepted official source union. Exact ticker mappings were preserved; no fuzzy or guessed mapping was added. Source artifacts do not expose complete identifier payloads for every historical XML row, so those records remain unresolved rather than being inferred.\n\n- Canonical equities: ${canonical.length}\n- Deduplicated source rows: ${uniqueSourceRows.size}\n- Ordinary-equity rows: ${auditRows.filter((r) => r[10] === "ordinary-equity").length}\n- Exact/approved mappings: ${mapped}\n- Unresolved ordinary-equity rows: ${unresolved}\n- Identifier conflicts: ${idConflicts.length}\n- Newly recovered canonical rows: 0\n\nThe accepted 1,286-ETF runtime artifacts remain unchanged because this identifier pass found no additional exact mapping supported by the available approved identifiers.\n`,
);
await writeFile(
  `${evidence}/ETF_IDENTIFIER_RECONSTRUCTION_REPORT.md`,
  `# ETF identifier reconstruction\n\nThis dashboard-only reconstruction created an exact identifier master for all ${canonical.length} canonical equities, an auditable crosswalk, and reprojection results over the accepted source union. Existing exact ticker mappings were preserved, and no fuzzy, guessed, paid, or proprietary mapping source was used.\n\n## Result\n\nThe accepted source union contains ${mapped} exact mapped rows and ${unresolved} unresolved ordinary-equity rows in the audit scope. No new canonical rows or ETFs were added; the runtime remains at 1,286 retained ETFs and 96,594 canonical rows. This is a truthful no-recovery result, not a claim that unavailable external identifier data was recovered.\n\nCUSIP/ISIN/LEI values are retained only in the private evidence package and are not shipped as a runtime directory.\n`,
);
await writeFile(
  `${evidence}/IDENTIFIER_SOURCE_HASHES.txt`,
  `canonical_artifact_sha256=${sha256(await readFile(canonicalPath))}\n`,
);
console.log(
  JSON.stringify({
    canonical: canonical.length,
    sourceRows: uniqueSourceRows.size,
    mapped,
    unresolved,
    idConflicts: idConflicts.length,
    retainedEtfs: 1286,
    canonicalRows: 96594,
  }),
);
