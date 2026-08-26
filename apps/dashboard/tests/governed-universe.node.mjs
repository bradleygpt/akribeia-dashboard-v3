// Shared test helper: derive the governed universe count from the CURRENT
// point-in-time observation plus the governed exclusion registry — the same
// derivation the application performs — so count assertions track each
// scheduled observation instead of freezing a literal.
import { readFile } from "node:fs/promises";

const universeUrl = new URL(
  "../../../data/observations/current/universe_floor0.json",
  import.meta.url,
);
const exclusionsUrl = new URL(
  "../../../data/reference/governed-security-exclusions.json",
  import.meta.url,
);

const universe = JSON.parse(await readFile(universeUrl, "utf8"));
const exclusions = JSON.parse(await readFile(exclusionsUrl, "utf8"));

const excluded = new Set(exclusions.exclusions.map((e) => e.ticker.toUpperCase()));

export const governedTotal = universe.rows.filter(
  (row) => !excluded.has(row.ticker.trim().toUpperCase()),
).length;

export const governedTotalFormatted = governedTotal.toLocaleString("en-US");

export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const governedStocks = universe.rows.filter(
  (row) => !excluded.has(row.ticker.trim().toUpperCase()) && row.sector !== "ETF",
).length;
export const governedEtfs = governedTotal - governedStocks;
export const governedStocksFormatted = governedStocks.toLocaleString("en-US");

const provenance = JSON.parse(
  await readFile(
    new URL("../../../data/observations/current/provenance.json", import.meta.url),
    "utf8",
  ),
);
export const floor0Sha256 = provenance.files["universe_floor0.json"].sha256;
