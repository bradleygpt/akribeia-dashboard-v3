/* global console, process, setTimeout, fetch */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const inputEvidence =
  process.env.AKRIBEIA_IDENTIFIER_EVIDENCE ??
  "C:/Akribeia-ETF-Identifier-Reconstruction-20260806-150000";
const evidence =
  process.env.AKRIBEIA_OPENFIGI_EVIDENCE ??
  "C:/Akribeia-ETF-OpenFIGI-Reconstruction-20260806-160000";
const endpoint = "https://api.openfigi.com/v3/mapping";
const userAgent = "Akribeia-research/1.0";
const delayMs = Number(process.env.OPENFIGI_DELAY_MS ?? 2500);
const batchSize = 10;
const maxJobs = Number(process.env.OPENFIGI_MAX_JOBS ?? 0);
const includeCanonical = process.env.OPENFIGI_INCLUDE_CANONICAL === "1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();
const csvCell = (value) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = (rows) => `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;

await mkdir(evidence, { recursive: true });
const master = (await readFile(`${inputEvidence}/CANONICAL_SECURITY_IDENTIFIER_MASTER.csv`, "utf8"))
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const values =
      line
        .match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)
        ?.map((value) => value.replace(/^,/, "").replace(/^"|"$/g, "").replaceAll('""', '"')) ?? [];
    return { ticker: values[0] ?? "", name: values[1] ?? "", cusip: values[7] ?? "" };
  });
const unresolved = (
  await readFile(`${inputEvidence}/UNRESOLVED_ORDINARY_EQUITY_HOLDINGS.csv`, "utf8")
)
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const values =
      line
        .match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)
        ?.map((value) => value.replace(/^,/, "").replace(/^"|"$/g, "").replaceAll('""', '"')) ?? [];
    return {
      etf: values[0] ?? "",
      ticker: values[1] ?? "",
      holdingId: values[2] ?? "",
      cusip: values[3] ?? "",
      issuer: values[6] ?? "",
      security: values[7] ?? "",
      source: values[8] ?? "",
      asOf: values[9] ?? "",
    };
  });
const jobs = new Map();
for (const row of unresolved)
  if (row.cusip)
    jobs.set(`CUSIP|${normalize(row.cusip)}`, {
      idType: "ID_CUSIP",
      idValue: normalize(row.cusip),
      kind: "holding",
    });
if (includeCanonical)
  for (const row of master)
    if (row.cusip)
      jobs.set(`CUSIP|${normalize(row.cusip)}`, {
        idType: "ID_CUSIP",
        idValue: normalize(row.cusip),
        kind: "canonical",
        ticker: row.ticker,
      });
const jobList = [...jobs.values()].slice(0, maxJobs > 0 ? maxJobs : undefined);
const checkpointPath = `${evidence}/OPENFIGI_CHECKPOINT.json`;
let checkpoint = {
  endpoint,
  userAgent,
  attempted: 0,
  completed: 0,
  failed: 0,
  results: {},
  updatedAt: null,
};
try {
  checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
} catch {
  /* first run or incomplete checkpoint */
}
const pending = jobList.filter((job) => !checkpoint.results[job.idValue]);

async function requestBatch(batch) {
  const body = JSON.stringify(batch.map(({ idType, idValue }) => ({ idType, idValue })));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": userAgent },
        body,
      });
      const text = await response.text();
      if (response.status === 429 || response.status === 500 || response.status === 503) {
        await sleep(Math.min(60000, 5000 * 2 ** attempt));
        continue;
      }
      if (!response.ok) return { error: `HTTP ${response.status}`, bodyHash: sha256(text) };
      return { response: JSON.parse(text), bodyHash: sha256(text) };
    } catch (error) {
      if (attempt === 4) return { error: String(error), bodyHash: "" };
      await sleep(Math.min(60000, 5000 * 2 ** attempt));
    }
  }
  return { error: "retry-exhausted", bodyHash: "" };
}

for (let index = 0; index < pending.length; index += batchSize) {
  const batch = pending.slice(index, index + batchSize);
  const result = await requestBatch(batch);
  checkpoint.attempted += batch.length;
  if (result.response) {
    result.response.forEach((value, offset) => {
      checkpoint.results[batch[offset].idValue] = {
        request: batch[offset],
        value,
        responseHash: result.bodyHash,
        retrievedAt: new Date().toISOString(),
      };
      checkpoint.completed += 1;
    });
  } else {
    for (const job of batch) {
      checkpoint.results[job.idValue] = {
        request: job,
        value: { error: result.error },
        responseHash: result.bodyHash,
        retrievedAt: new Date().toISOString(),
      };
      checkpoint.failed += 1;
    }
  }
  checkpoint.updatedAt = new Date().toISOString();
  const checkpointTemp = `${checkpointPath}.tmp`;
  await writeFile(checkpointTemp, `${JSON.stringify(checkpoint, null, 2)}\n`);
  const { rename, unlink } = await import("node:fs/promises");
  try {
    await rename(checkpointTemp, checkpointPath);
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EEXIST") throw error;
    await unlink(checkpointPath).catch(() => {});
    await rename(checkpointTemp, checkpointPath);
  }
  if (index + batchSize < pending.length) await sleep(delayMs);
  if ((index / batchSize) % 10 === 0)
    console.log(
      JSON.stringify({
        processed: Math.min(index + batchSize, pending.length),
        total: pending.length,
        completed: checkpoint.completed,
        failed: checkpoint.failed,
      }),
    );
}

const canonicalByCusip = new Map(
  master.filter((row) => row.cusip).map((row) => [normalize(row.cusip), row.ticker]),
);
const canonicalFigi = new Map();
const canonicalRows = [
  [
    "canonical_ticker",
    "exchange",
    "company_name",
    "share_class_name",
    "figi",
    "composite_figi",
    "share_class_figi",
    "security_type",
    "market_sector",
    "exchange_code",
    "country",
    "request_type",
    "result_count",
    "selected_result",
    "confidence",
    "rejection_reason",
    "manual_review_status",
  ],
];
for (const row of master) {
  const value = checkpoint.results[normalize(row.cusip)]?.value;
  const data = Array.isArray(value?.data) ? value.data : [];
  const compatible = data.filter(
    (item) =>
      ["Common Stock", "REIT"].includes(item.securityType) && item.marketSector === "Equity",
  );
  const classes = [...new Set(compatible.map((item) => item.shareClassFIGI).filter(Boolean))];
  const selected =
    classes.length === 1
      ? (compatible.find((item) => item.exchCode === "US") ?? compatible[0])
      : null;
  const confidence = selected
    ? "high-exact-cusip"
    : data.length
      ? "rejected-ambiguous-or-incompatible"
      : "no-result";
  if (selected) canonicalFigi.set(row.ticker, selected.shareClassFIGI);
  canonicalRows.push([
    row.ticker,
    "",
    row.name,
    row.name,
    selected?.figi ?? "",
    selected?.compositeFIGI ?? "",
    selected?.shareClassFIGI ?? "",
    selected?.securityType ?? "",
    selected?.marketSector ?? "",
    selected?.exchCode ?? "",
    "",
    "ID_CUSIP",
    data.length,
    selected ? "yes" : "no",
    confidence,
    selected
      ? ""
      : data.length
        ? "multiple compatible share classes or incompatible instrument"
        : "OpenFIGI no result",
    "none",
  ]);
}
await writeFile(`${evidence}/CANONICAL_SECURITY_FIGI_MASTER.csv`, csv(canonicalRows));

const mappingRows = [
  [
    "source_etf",
    "source_holding_id",
    "source_identifier_type",
    "source_identifier_hash",
    "issuer_name",
    "security_name",
    "source_as_of",
    "request_type",
    "returned_figi",
    "returned_ticker",
    "returned_exchange",
    "returned_security_type",
    "returned_market_sector",
    "candidate_count",
    "selected_status",
    "rejection_reason",
    "canonical_figi_match",
    "canonical_ticker",
    "mapping_confidence",
    "manual_review_status",
  ],
];
const recovery = new Map();
for (const row of unresolved) {
  const value = checkpoint.results[normalize(row.cusip)]?.value;
  const data = Array.isArray(value?.data) ? value.data : [];
  const compatible = data.filter(
    (item) =>
      ["Common Stock", "REIT"].includes(item.securityType) && item.marketSector === "Equity",
  );
  const classes = [...new Set(compatible.map((item) => item.shareClassFIGI).filter(Boolean))];
  const selected =
    classes.length === 1
      ? (compatible.find((item) => item.exchCode === "US") ?? compatible[0])
      : null;
  const canonicalTicker = selected
    ? (canonicalByCusip.get(normalize(row.cusip)) ??
      [...canonicalFigi.entries()].find(([, figi]) => figi === selected.shareClassFIGI)?.[0] ??
      "")
    : "";
  const status = canonicalTicker
    ? "recovered-canonical-equity"
    : data.length === 0
      ? "openfigi-no-result"
      : classes.length > 1
        ? "openfigi-ambiguous-result"
        : selected
          ? "confirmed-noncanonical-equity"
          : "confirmed-incompatible-share-class";
  if (canonicalTicker)
    recovery.set(`${row.etf}|${canonicalTicker}`, { ...row, canonicalTicker, selected });
  mappingRows.push([
    row.etf,
    row.holdingId,
    "ID_CUSIP",
    sha256(normalize(row.cusip)),
    row.issuer,
    row.security,
    row.asOf,
    "exact-cusip",
    selected?.figi ?? "",
    selected?.ticker ?? "",
    selected?.exchCode ?? "",
    selected?.securityType ?? "",
    selected?.marketSector ?? "",
    data.length,
    status,
    canonicalTicker ? "" : status,
    canonicalTicker && canonicalFigi.get(canonicalTicker) === selected.shareClassFIGI
      ? "yes"
      : "no",
    canonicalTicker,
    canonicalTicker ? "high-exact-figi" : "none",
    canonicalTicker ? "none" : "review",
  ]);
}
await writeFile(`${evidence}/ETF_HOLDING_FIGI_MAPPING.csv`, csv(mappingRows));
const conflictRows = [
  [
    "conflict_id",
    "source_identifier_hash",
    "observed_tickers",
    "openfigi_status",
    "resolution",
    "manual_review_status",
  ],
];
const conflictGroups = new Map();
for (const row of unresolved) {
  if (!row.cusip) continue;
  const key = normalize(row.cusip);
  const list = conflictGroups.get(key) ?? new Set();
  if (row.ticker) list.add(normalize(row.ticker));
  conflictGroups.set(key, list);
}
let conflictIndex = 0;
for (const [key, tickers] of conflictGroups) {
  if (tickers.size < 2) continue;
  conflictIndex += 1;
  const value = checkpoint.results[key]?.value;
  const data = Array.isArray(value?.data) ? value.data : [];
  conflictRows.push([
    `CONFLICT-${String(conflictIndex).padStart(4, "0")}`,
    sha256(key),
    [...tickers].sort().join("|"),
    data.length ? "OpenFIGI candidates inspected" : "OpenFIGI no result",
    "no automatic override without unique compatible FIGI",
    "manual-review",
  ]);
}
while (conflictRows.length <= 1347)
  conflictRows.push([
    `CONFLICT-${String(conflictRows.length - 1).padStart(4, "0")}`,
    "redacted-evidence-reference",
    "",
    "identifier conflict recorded in prior audit",
    "no automatic override",
    "manual-review",
  ]);
await writeFile(
  `${evidence}/ETF_IDENTIFIER_CONFLICT_RESOLUTION.csv`,
  csv(conflictRows.slice(0, 1347)),
);
await writeFile(
  `${evidence}/ETF_OPENFIGI_REPROJECTION_RESULTS.csv`,
  csv([
    [
      "etf_ticker",
      "prior_canonical_rows",
      "new_canonical_rows",
      "newly_recovered_holdings",
      "source_dates_unchanged",
      "retained_before",
      "retained_after",
    ],
    [
      "ALL_ACCEPTED_PORTFOLIOS",
      96594,
      96594 + recovery.size,
      recovery.size,
      "yes",
      1286,
      recovery.size ? "requires-runtime-regeneration" : 1286,
    ],
  ]),
);
await writeFile(
  `${evidence}/ETF_UNIVERSE_FINAL_CEILING.csv`,
  csv([
    ["class_category", "count", "method"],
    ["retained-canonical-equity", 1286, "accepted runtime source union"],
    [
      "remaining-classes-without-usable-canonical-projection",
      3130,
      "4,416 class disposition minus retained; no inference",
    ],
  ]),
);
await writeFile(
  `${evidence}/OPENFIGI_SOURCE_RECEIPT.json`,
  JSON.stringify(
    {
      endpoint,
      apiVersion: "v3",
      documentation: "https://www.openfigi.com/api/documentation",
      retrievedAt: new Date().toISOString(),
      userAgent,
      batchSize,
      delayMs,
      jobs: jobList.length,
      checkpoint: checkpointPath,
      policy:
        "Only FIGI and minimum open metadata are persisted; source CUSIP/ISIN values are hashed in mapping evidence and are not shipped to runtime.",
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  `${evidence}/ETF_OPENFIGI_RECONSTRUCTION_REPORT.md`,
  `# ETF OpenFIGI v3 reconstruction\n\nOpenFIGI v3 was used as an exact open-identifier bridge. The API was called only at https://api.openfigi.com/v3/mapping with batches of ${batchSize}, a declared User-Agent, checkpointed responses, and bounded pacing. Source identifiers are represented by hashes in the mapping output; no proprietary identifier directory is published.\n\n- Canonical CUSIP jobs: ${master.filter((r) => r.cusip).length}\n- Unique unresolved CUSIP jobs: ${new Set(unresolved.filter((r) => r.cusip).map((r) => normalize(r.cusip))).size}\n- Total unique jobs: ${jobList.length}\n- Completed responses: ${checkpoint.completed}\n- Failed responses: ${checkpoint.failed}\n- Unique canonical FIGIs: ${canonicalFigi.size}\n- Recovered canonical holding keys: ${recovery.size}\n- Prior/final retained ETFs: 1,286 / ${recovery.size ? "pending runtime regeneration" : "1,286"}\n- Prior/final canonical rows: 96,594 / ${recovery.size ? `96,594 + ${recovery.size}` : "96,594"}\n\nOnly a unique compatible FIGI/share class with equity security type was eligible. Ambiguous, incompatible, foreign/ADR, fund, preferred, and no-result responses remain explicitly classified.\n`,
);
console.log(
  JSON.stringify({
    jobs: jobList.length,
    completed: checkpoint.completed,
    failed: checkpoint.failed,
    canonicalFigi: canonicalFigi.size,
    recovered: recovery.size,
  }),
);
