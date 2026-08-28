// Generates apps/dashboard/public/data/ai-fundamentals.json — the compact
// baked-fundamentals artifact the /api/v3/ai/assist "research" kind grounds
// its fact block in. Reads the governed V2 observation snapshot and keeps ONLY
// the fields the research prompt cites (fair value, quant buy point, pillar
// grades, and a fixed allowlist of raw metrics), dropping every null so the
// served artifact stays small. Run via: npm run ai-fundamentals:generate
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceUrl = new URL(
  "../../../data/observations/current/universe_floor0.json",
  import.meta.url,
);
const outputUrl = new URL("../public/data/ai-fundamentals.json", import.meta.url);

const RAW_FIELDS = [
  "forwardPE",
  "trailingPE",
  "pegRatio",
  "priceToSalesTrailing12Months",
  "grossMargins",
  "operatingMargins",
  "profitMargins",
  "returnOnEquity",
  "revenueGrowth",
  "earningsGrowth",
  "momentum_3m",
  "momentum_12m",
  "analyst_mean_target_upside",
  "earnings_surprise_pct",
];

const TOP_FIELDS = ["fv", "fvPremium", "fvVerdict", "qbp", "qbpSignal", "qbpDistance"];

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactRaw(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const compact = {};
  for (const field of RAW_FIELDS) {
    const value = finiteOrNull(raw[field]);
    if (value !== null) compact[field] = Number(value.toFixed(4));
  }
  return Object.keys(compact).length > 0 ? compact : null;
}

function compactGrades(grades) {
  if (typeof grades !== "object" || grades === null) return null;
  const compact = {};
  for (const [pillar, grade] of Object.entries(grades)) {
    if (typeof grade === "string" && grade.length > 0) compact[pillar] = grade;
  }
  return Object.keys(compact).length > 0 ? compact : null;
}

function compactSecurity(row) {
  const security = {};

  for (const field of TOP_FIELDS) {
    const value = row[field];
    if (typeof value === "number" && Number.isFinite(value)) security[field] = value;
    else if (typeof value === "string" && value.length > 0) security[field] = value;
  }

  const grades = compactGrades(row.grades);
  if (grades !== null) security.grades = grades;

  const raw = compactRaw(row.raw);
  if (raw !== null) security.raw = raw;

  return Object.keys(security).length > 0 ? security : null;
}

const snapshot = JSON.parse(await readFile(sourceUrl, "utf8"));

if (!Array.isArray(snapshot.rows) || snapshot.rows.length === 0) {
  throw new Error("universe_floor0.json has no rows — refusing to emit an empty artifact.");
}

const securities = {};
let included = 0;

for (const row of snapshot.rows) {
  if (typeof row?.ticker !== "string" || row.ticker.length === 0) continue;
  const security = compactSecurity(row);
  if (security === null) continue;
  securities[row.ticker] = security;
  included += 1;
}

if (included === 0) {
  throw new Error("No securities carried any allowlisted fundamentals — refusing to emit.");
}

const artifact = {
  generatedAt: new Date().toISOString(),
  sourceNote:
    "Baked V2 fundamentals from data/observations/current/universe_floor0.json " +
    `(observed ${snapshot.generated_at ?? "unknown"}); null fields dropped; ` +
    "research-preview evidence only, not investment advice.",
  securities,
};

const serialized = `${JSON.stringify(artifact)}\n`;
await writeFile(outputUrl, serialized);

process.stdout.write(
  `ai-fundamentals: wrote ${included} securities (${serialized.length} bytes) to ${fileURLToPath(outputUrl)}\n`,
);
