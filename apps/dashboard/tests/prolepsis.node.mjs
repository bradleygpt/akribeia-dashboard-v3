import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataUrl = new URL("../public/data/mlpred.json", import.meta.url);
const workbenchUrl = new URL("../app/prolepsis/prolepsis-workbench.tsx", import.meta.url);
const headerUrl = new URL("../app/research-header.tsx", import.meta.url);

test("Prolepsis artifact is strict, full-universe and ranked", async () => {
  const text = await readFile(dataUrl, "utf8");
  assert.equal(text.includes("NaN"), false);
  const payload = JSON.parse(text);
  assert.equal(payload.n, 1178);
  assert.equal(payload.rows.length, 1178);
  assert.equal(payload.prolepsis_coverage.total_prolepsis_rows, 1178);
  assert.equal(payload.prolepsis_coverage.eligible_classifier_rows, 1178);
  assert.equal(payload.prolepsis_coverage.populated_posterior_rows, 1178);
  assert.equal(payload.prolepsis_coverage.return_engine_covered_rows, 912);
  assert.equal(payload.prolepsis_coverage.return_engine_unavailable_rows, 266);
  assert.equal(payload.rows.filter((row) => row.c78q_top8 === 1).length, 8);
  assert.deepEqual(
    payload.rows.map((row) => row.c78q_rank).toSorted((a, b) => a - b),
    Array.from({ length: 1178 }, (_, index) => index + 1),
  );
  assert.equal(
    payload.rows.every(
      (row) => Number.isFinite(row.c78q_post) && row.c78q_post >= 0 && row.c78q_post <= 1,
    ),
    true,
  );
});

test("Prolepsis route preserves bounded live-quote and provenance behavior", async () => {
  const source = await readFile(workbenchUrl, "utf8");
  assert.match(source, /LIVE_QUOTE_LIMIT = 120/);
  assert.match(source, /\/api\/v3\/quotes\?tickers=/);
  assert.match(source, /const livePrice = livePrices\[row\.ticker\];/);
  assert.match(source, /const displayedPrice = livePrice \?\? row\.current_price;/);
  assert.match(source, /return_engine_available/);
  assert.match(source, /SortButton/);
  assert.match(source, /compareNullable\([\s\S]*direction: number/);
  assert.match(source, /if \(left === null\) return 1/);
  assert.match(source, /if \(right === null\) return -1/);
  assert.match(source, /sorted.*ascending.*descending/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
});

test("Core research header exposes Prolepsis navigation", async () => {
  const source = await readFile(headerUrl, "utf8");
  assert.match(source, /href="\/prolepsis"/);
  assert.match(source, /active === "prolepsis"/);
  assert.doesNotMatch(source, /Â/);
});
