import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("aligns every selector, date boundary, and metric set", async () => {
  const source = await readFile(
    new URL("../app/research/[ticker]/security-live-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /selectPricePeriod/);
  assert.match(source, /isShortPricePeriod/);
  assert.match(source, /computeObservedPeriodMetrics/);
  assert.match(source, /labelPricePeriod\(period\).*return/s);
  assert.match(source, /selectedHistory\.dates/);
  assert.match(source, /selectedHistory\.close/);
  assert.match(source, /Price · \{displayPriceSource\}/);
  assert.match(source, /Quote response generated/);
  assert.match(source, /preserved as-of snapshot/);

  assert.match(source, /Sessions/);
  assert.match(source, /Average session/);
  assert.match(source, /Best session/);
  assert.match(source, /Worst session/);
  assert.match(source, /Annualized return/);
  assert.match(source, /Sharpe/);

  assert.doesNotMatch(source, /close\.length >= 20/);
  assert.doesNotMatch(source, /<span>Daily change<\/span>/);
});
