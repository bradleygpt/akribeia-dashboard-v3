import assert from "node:assert/strict";
import test from "node:test";
import { governedTotalFormatted as GOVERNED_TOTAL } from "./governed-universe.node.mjs";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("research-route-test", `${pathname}-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Wave 2 research workbench", async () => {
  const response = await render("/research");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Core Research Workbench — Akribeia/);
  assert.match(html, /One universe/);
  assert.match(html, /Many ways to interrogate it/);
  assert.match(html, /Build a research cohort/);
  assert.match(html, /High conviction/);
  assert.match(html, /Quality compounders/);
  assert.match(html, /Search ticker, company or industry/);
  assert.match(html, new RegExp(GOVERNED_TOTAL));
  assert.match(html, /Compare NVDA/);
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /research-sort-header is-active/);
});

test("server-renders dedicated security detail with preserved factors", async () => {
  const response = await render("/research/AAPL");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /AAPL Research — Akribeia/);
  assert.match(html, /Apple Inc\./);
  assert.match(html, /Five-pillar profile/i);
  assert.match(html, /Five-pillar balance/);
  assert.match(html, /Accessible radar values/);
  assert.match(html, /Loading preserved V2 methodology detail/);
  assert.match(html, /Higher is better/);
  assert.match(html, /Price history and risk/);
  assert.match(html, /Forward P\/E/);
  assert.match(html, /Nearest research peers/);
  assert.match(html, /Live market data clearly separated/i);
});

test("server-renders sector analytics", async () => {
  const response = await render("/sectors");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Sector Analytics — Akribeia/);
  assert.match(html, /Sector research landscape/);
  assert.match(html, /Scale and aggregate valuation/);
  assert.match(html, /Full sector ledger/);
  assert.match(html, /Inspect the companies behind the aggregate/);
  assert.match(html, /Loading pinned V2 sector narrative/);
  assert.match(html, /Technology/);
  assert.match(html, /1,290 stocks/);
});

test("server-renders the ETF Center", async () => {
  const response = await render("/etfs");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /ETF Center — Akribeia/);
  assert.match(html, /Then see through it/);
  assert.match(html, /Scored universe/);
  assert.match(html, /Portfolio builder/);
  assert.match(html, /Find your ETF/);
  assert.match(html, /Index Watch/);
  assert.match(html, /Holdings \+ look-through/);
  assert.match(html, /Reverse lookup/);
  assert.match(html, />70</);
});

test("server-renders a dedicated ETF detail route", async () => {
  const response = await render("/etfs/SPY");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /SPY ETF Research — Akribeia/);
  assert.match(html, /Stock-model score not applicable/);
  assert.match(html, /Stock-model profile not applicable/);
  assert.match(html, /ETFs do not receive 5-pillar factor grades/);
  assert.match(html, /Source commit b477349a8691/);
  assert.doesNotMatch(html, /Valuation score 7\.00 of 12/);
  assert.doesNotMatch(html, /Loading preserved V2 methodology detail/);
  assert.match(html, /Loading pinned ETF holdings and classification/);
});

test("routes direct Research ETF details through the fail-closed ETF experience", async () => {
  const response = await render("/research/SPY");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /SPY ETF Research — Akribeia/);
  assert.match(html, /Stock-model score not applicable/);
  assert.match(html, /Stock-model profile not applicable/);
  assert.doesNotMatch(html, /Valuation score 7\.00 of 12/);
});

test("server-renders the source-attributed Risk Radar shell", async () => {
  const response = await render("/risk");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Risk Radar — Akribeia/);
  assert.match(html, /Know the consensus/);
  assert.match(html, /Watch the disagreement/);
  assert.match(html, /Loading the pinned V2 Risk Radar/);
  assert.match(html, /Unsourced or unavailable risks are never substituted/);
});

test("server-renders the source-disciplined Macro route", async () => {
  const response = await render("/macro");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Macro Calendar &amp; Probability — Akribeia/);
  assert.match(html, /Source first/);
  assert.match(html, /No unsupported fallback/);
  assert.match(html, /Loading approved forecast consensus/);
  assert.match(
    html,
    /Market-implied FOMC probabilities unavailable: no permitted free official source is configured/,
  );
  assert.match(html, /No date, time, timezone or recurrence is inferred/);
  assert.doesNotMatch(html, /35%|55%|10%/);
  assert.doesNotMatch(html, /Pinned V2 FOMC meeting schedule/);
  assert.match(html, /aria-current="page"[^>]*>Macro|href="\/macro" aria-current="page"/);
});

test("server-renders the truth-labeled Strategies route", async () => {
  const response = await render("/strategies");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Strategies — Akribeia/);
  assert.match(html, /Distinct research sleeves/);
  assert.match(html, /No implied recommendation/);
  assert.match(html, /Loading pinned strategy records/);
  assert.match(html, /aria-current="page"[^>]*>Strategies|href="\/strategies" aria-current="page"/);
});

test("server-renders the implemented-product Help route", async () => {
  const response = await render("/help");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Product Help — Akribeia/);
  assert.match(html, /Product surfaces/);
  assert.match(html, /Live, as_of and unavailable/);
  assert.match(html, /Keyboard navigation/);
  assert.match(html, /Portfolio inputs are stored only in this browser/);
  assert.match(html, /aria-current="page"[^>]*>Help|href="\/help" aria-current="page"/);
});

test("server-renders the recovered device-local Portfolio and Monte Carlo route", async () => {
  const response = await render("/portfolio");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Portfolio &amp; Monte Carlo — Akribeia/);
  assert.match(html, /Your inputs/);
  assert.match(html, /Source-backed analytics/);
  assert.match(html, /qd_holdings/);
  assert.match(html, /DETERMINISTIC V2 METHOD/);
  assert.match(html, /not a forecast or guarantee/i);
  assert.match(html, /href="\/portfolio" aria-current="page"/);
});
