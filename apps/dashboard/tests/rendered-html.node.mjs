import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
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

test("server-renders the active Akribeia evidence dashboard", async () => {
  const response = await render();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();

  assert.match(html, /<title>Akribeia — Quantitative Market Research<\/title>/i);
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /<nav class="primary-nav" aria-label="Primary navigation">/);
  assert.match(html, /aria-label="Research integrity navigation"/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
  assert.match(html, /data-state="loading"/);
  assert.match(html, /aria-live="polite" role="status"/);
  assert.match(html, /Verifying the active evidence build/);
  assert.match(html, /See the market whole/);
  assert.match(html, /Test every signal/);
  assert.match(html, /Open Market Health/);
  assert.match(html, /Search all 1,361 securities/);
  assert.match(html, /aria-label="Akribeia product areas"/);
  assert.match(html, /Regime, macro, earnings, breadth and risk/);
  assert.match(html, /Trust policy/);
  assert.match(html, /Fail closed/);
  assert.match(html, /preview-20260728-pipeline-v4-a34fc842220f/);
  assert.match(html, /3\.0\.0-preview\.4/);
  assert.match(html, />643</);
  assert.match(html, /Missing inputs stay visible/);
  assert.match(html, /pillars\.EPS Revisions/);
  assert.match(html, /total-weight/);
  assert.match(html, /EXACT CONSTRAINT LEDGER/);
  assert.match(html, /ranked-greedy-integer-units-v1/);
  assert.match(html, /1,000,000,000/);
  assert.match(html, /35h \/ 168h/);
  assert.match(html, /3 SHA-256 artifacts/);
  assert.match(html, /verify-and-reuse/);
  assert.match(html, /validated-pointer-and-projection/);
  assert.match(html, /Every validated name\. No hidden cap floor\./);
  assert.match(html, /Search all securities/);
  assert.match(html, /authoritative no-floor universe/);
  assert.match(html, />1,361</);
  assert.match(html, />1,291</);
  assert.match(html, />70</);
  assert.match(html, /SHA-256/);
  assert.match(html, /10624afb7f413c2a1c3490c29b99e37a9fa5c0776a0a58f53de6d7af73b337e4/);
  assert.match(html, /Highest composite scores/);
  assert.match(html, /MU/);
  assert.match(html, /NVDA/);
  assert.match(html, /Sector exposure/);
  assert.match(html, /Ask the published build/);
  assert.match(html, /No external model, browser secret, or performance forecast is used/);
  assert.match(html, /name="ticker" value="MU"/);
  assert.match(html, /Explain evidence/);
  assert.match(html, /Composite score ranking table/);
  assert.match(html, /Highest composite scores with sector, factor coverage, score/);
  assert.match(html, /The interface says what it knows/);
  assert.match(html, /Verified history remains visible with a freshness warning/);
  assert.match(html, /Missing or failed evidence is withheld/);
  assert.match(html, /No silent renormalization/);
  assert.match(html, /A dated receipt, with limits intact/);
  assert.match(html, /2026-07-28/);
  assert.match(html, /No synthetic comparison/);
  assert.match(html, /No point-in-time benchmark input is present/);
  assert.match(html, /View reproduction report/);
  assert.match(html, /Accepted before the decision—or excluded/);
  assert.match(html, /11(?:<!-- -->)? \/<!-- --> <!-- -->12/);
  assert.match(html, /Post-cutoff excluded/);
  assert.match(html, /retrospective metadata is not acquisition-time proof/i);
  assert.match(html, /0000723125/);
  assert.match(html, /10-Q/);
  assert.match(html, /Captured/);
  assert.match(html, />CTRA</);
  assert.match(html, /What the model is—and is not/);
  assert.match(html, /Not release eligible/);
  assert.match(html, /portfolio parity/);
  assert.match(html, /stale against the July 2026 data vintage/);
  assert.match(html, /Five pillars, 26 preserved components/);
  assert.match(html, /Forward P\/E/);
  assert.match(html, /Known methodology gap/);
  assert.match(html, /does not contain the raw transformations/);
  assert.match(html, /Measured now\. Compared when evidence exists/);
  assert.match(html, /643(?:<!-- -->)? schema-valid score rows/);
  assert.match(html, /insufficient history/);
  assert.match(html, /Temporal drift/);
  assert.match(html, /Identity evidence, without false permanence/);
  assert.match(html, />643(?:<!-- -->)?<\/strong>/);
  assert.match(html, /AKR-TICKER:MU/);
  assert.match(html, /Ticker history unavailable/);
  assert.match(html, /must not be treated as permanent across ticker changes or ticker reuse/);
  assert.match(html, /Every ticker checked\. Identity scope stays honest/);
  assert.match(html, /632(?:<!-- -->)? \/<!-- --> <!-- -->643/);
  assert.match(html, /585(?:<!-- -->)? \/<!-- --> <!-- -->588/);
  assert.match(html, /47(?:<!-- -->)? \/<!-- --> <!-- -->55/);
  assert.match(html, /CIK 0000723125/);
  assert.match(html, /11 unresolved/);
  assert.match(html, /No fuzzy or company-name fallback is used/);
  assert.match(html, /CIK identifies the registrant, not its exchange listing/);
  assert.match(html, /Current association only/);
  assert.match(html, /The universe changed\. Eligibility history did not appear/);
  assert.match(html, /629/);
  assert.match(html, /14/);
  assert.match(html, /13/);
  assert.match(html, /Observed entrants/);
  assert.match(html, /Observed exits/);
  assert.match(html, /effective membership intervals available/);
  assert.match(html, /Observed difference, not a constituent event/);
  assert.match(html, /Five discontinuities\. Zero verified adjustments/);
  assert.match(html, /Possible share discontinuity/);
  assert.match(html, /KLAC/);
  assert.match(html, /10\.026/);
  assert.match(html, /No synthetic adjustment/);
  assert.match(html, /Leaving the file is not a delisting/);
  assert.match(html, /Current SEC association/);
  assert.match(html, /BLD and HOLX remain unresolved/);
  assert.match(html, /Current is not historical/);
  assert.match(html, /Nine targets\. Zero invented fills or costs/);
  assert.match(html, /null, never silently zero/);
  assert.match(html, /No zero-cost shortcut/);
  assert.match(html, /Eight candidates\. No benchmark return/);
  assert.match(html, /SPLG and SPY remain unmatched/);
  assert.match(html, /Price change is not return/);
  assert.match(html, /One day recorded\. Twenty-nine still must happen/);
  assert.match(html, /Immutable observation days/);
  assert.match(html, /Executable portfolios/);
  assert.match(html, /Costed returns/);
  assert.match(html, /Elapsed evidence cannot be generated on demand/);
  assert.match(html, /Two snapshots\. Zero eligible folds/);
  assert.match(html, /Readiness is not a backtest/);
  assert.match(html, /Two snapshots are not a backtest/);
  assert.match(html, /2<!-- --> snapshots inventoried/);
  assert.match(html, /timezone unspecified/);
  assert.match(html, /fail<!-- --> \/<!-- --> <!-- -->1<!-- --> issues/);
  assert.match(html, /fail<!-- --> \/<!-- --> <!-- -->5<!-- --> issues/);
  assert.match(html, /10<!-- --> controls unresolved/);
  assert.match(html, /No performance claim/);
  assert.match(html, /cannot yet support a point-in-time backtest/);
  assert.match(html, /Working product\. Research-preview evidence/);
  assert.match(html, /validation candidate/);
  assert.match(html, /1<!-- --> \/<!-- --> <!-- -->30/);
  assert.match(html, /4<!-- --> \/<!-- --> <!-- -->8/);
  assert.match(html, /Production cutover: (?:<!-- -->)?not authorized/);
  assert.match(html, /not investment advice/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships an integrity-valid immutable active build", async () => {
  const pointer = JSON.parse(
    await readFile(new URL("../public/data/active-build.json", import.meta.url), "utf8"),
  );
  const buildRoot = new URL(`../public/data/builds/${pointer.activeBuildId}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", buildRoot), "utf8"));

  assert.equal(pointer.activeBuildId, manifest.buildId);
  assert.equal(manifest.status, "healthy");
  assert.equal(manifest.publication.decision, "publish");

  for (const artifact of Object.values(manifest.files)) {
    const payload = await readFile(new URL(artifact.path, buildRoot));
    const hash = createHash("sha256").update(payload).digest("hex");

    assert.equal(payload.byteLength, artifact.byteSize);
    assert.equal(hash, artifact.sha256);
  }

  const [publishedDashboard, projectedDashboard] = await Promise.all([
    readFile(new URL("dashboard.json", buildRoot), "utf8"),
    readFile(new URL("../app/generated/active-dashboard.json", import.meta.url), "utf8"),
  ]);

  assert.equal(projectedDashboard, publishedDashboard);
  assert.equal(JSON.parse(projectedDashboard).buildId, pointer.activeBuildId);
});

test("preserves the dashboard accessibility contract", async () => {
  const response = await render();
  const html = await response.text();
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const labelledBy = [...html.matchAll(/\saria-labelledby="([^"]+)"/g)].flatMap((match) =>
    match[1].split(/\s+/),
  );
  const fragmentLinks = [...html.matchAll(/\shref="#([^"]+)"/g)].map((match) => match[1]);

  assert.equal(new Set(ids).size, ids.length, "Rendered IDs must be unique.");
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, "The page must have exactly one h1.");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
  assert.match(html, /class="table-scroll" tabindex="0" role="region"/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /role="img" aria-label="[^"]+"/);

  for (const referencedId of [...labelledBy, ...fragmentLinks]) {
    assert.ok(ids.includes(referencedId), `Missing referenced landmark ID "${referencedId}".`);
  }
});

test("serves a protected explanation from the built worker without an external model", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://akribeia.example/api/v3/ai/explain", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://akribeia.example",
        "x-akribeia-client": "dashboard-v3",
      },
      body: JSON.stringify({
        ticker: "MU",
        focus: "portfolio",
      }),
    }),
    {
      ASSETS: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname.replace(/^\/+/, "");

          try {
            return new Response(
              await readFile(new URL(`../dist/client/${pathname}`, import.meta.url)),
              { status: 200 },
            );
          } catch {
            return new Response("Not found", { status: 404 });
          }
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.mode, "deterministic-evidence");
  assert.equal(payload.externalModelUsed, false);
  assert.equal(payload.ticker, "MU");
  assert.match(payload.explanation, /exact position cap/);
});

test("packages a deployable worker and integrity-valid active evidence tree", async () => {
  const [
    sourceHosting,
    packagedHosting,
    serverEntrypoint,
    pointerPayload,
    activeEvidencePayload,
    sourceEvidencePayload,
    packagedModelCard,
    sourceModelCard,
    packagedDictionary,
    sourceDictionary,
    packagedQuality,
    sourceQuality,
    packagedSecurityMaster,
    sourceSecurityMaster,
    packagedSecRegistrants,
    sourceSecRegistrants,
    packagedMaturity,
    sourceMaturity,
    packagedHistoricalReadiness,
    sourceHistoricalReadiness,
    packagedFilingAvailability,
    sourceFilingAvailability,
    packagedUniverseMembership,
    sourceUniverseMembership,
    packagedCorporateActions,
    sourceCorporateActions,
    packagedExitDisposition,
    sourceExitDisposition,
    packagedExecutionCosts,
    sourceExecutionCosts,
    packagedBenchmarkReadiness,
    sourceBenchmarkReadiness,
    packagedWalkForwardReadiness,
    sourceWalkForwardReadiness,
    packagedProspectiveReadiness,
    sourceProspectiveReadiness,
  ] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/client/data/active-build.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/client/data/evidence/active.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/evidence/active.json", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/client/data/evidence/governance/active-model-card.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/governance/active-model-card.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../dist/client/data/evidence/governance/active-metric-dictionary.json",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/governance/active-metric-dictionary.json", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../dist/client/data/evidence/quality/active.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/evidence/quality/active.json", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/client/data/evidence/security-master/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/security-master/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/data/evidence/sec-registrants/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/sec-registrants/active.json", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../dist/client/data/evidence/maturity/active.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/evidence/maturity/active.json", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/client/data/evidence/historical-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/historical-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/data/evidence/filing-availability/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/filing-availability/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/data/evidence/universe-membership/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/universe-membership/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../dist/client/data/evidence/corporate-action-readiness/active.json",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/corporate-action-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../dist/client/data/evidence/exit-disposition-readiness/active.json",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/exit-disposition-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/data/evidence/execution-cost-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/execution-cost-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/data/evidence/benchmark-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/benchmark-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/data/evidence/walk-forward-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/walk-forward-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/data/evidence/prospective-readiness/active.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/data/evidence/prospective-readiness/active.json", import.meta.url),
      "utf8",
    ),
  ]);
  const pointer = JSON.parse(pointerPayload);
  const buildRoot = new URL(
    `../dist/client/data/builds/${pointer.activeBuildId}/`,
    import.meta.url,
  );
  const manifest = JSON.parse(await readFile(new URL("manifest.json", buildRoot), "utf8"));

  assert.equal(packagedHosting, sourceHosting);
  assert.match(serverEntrypoint, /fetch/);
  assert.equal(manifest.buildId, pointer.activeBuildId);
  assert.equal(activeEvidencePayload, sourceEvidencePayload);
  assert.equal(packagedModelCard, sourceModelCard);
  assert.equal(packagedDictionary, sourceDictionary);
  assert.equal(packagedQuality, sourceQuality);
  assert.equal(packagedSecurityMaster, sourceSecurityMaster);
  assert.equal(packagedSecRegistrants, sourceSecRegistrants);
  assert.equal(packagedMaturity, sourceMaturity);
  assert.equal(packagedHistoricalReadiness, sourceHistoricalReadiness);
  assert.equal(packagedFilingAvailability, sourceFilingAvailability);
  assert.equal(packagedUniverseMembership, sourceUniverseMembership);
  assert.equal(packagedCorporateActions, sourceCorporateActions);
  assert.equal(packagedExitDisposition, sourceExitDisposition);
  assert.equal(packagedExecutionCosts, sourceExecutionCosts);
  assert.equal(packagedBenchmarkReadiness, sourceBenchmarkReadiness);
  assert.equal(packagedWalkForwardReadiness, sourceWalkForwardReadiness);
  assert.equal(packagedProspectiveReadiness, sourceProspectiveReadiness);

  for (const artifact of Object.values(manifest.files)) {
    const [packagedPayload, sourcePayload] = await Promise.all([
      readFile(new URL(artifact.path, buildRoot)),
      readFile(
        new URL(`../public/data/builds/${pointer.activeBuildId}/${artifact.path}`, import.meta.url),
      ),
    ]);

    assert.deepEqual(packagedPayload, sourcePayload);
    assert.equal(packagedPayload.byteLength, artifact.byteSize);
    assert.equal(createHash("sha256").update(packagedPayload).digest("hex"), artifact.sha256);
  }

  const activeEvidence = JSON.parse(activeEvidencePayload);
  const evidenceRoot = new URL(
    `../dist/client/data/evidence/daily/${activeEvidence.asOfDate}/${activeEvidence.build.buildId}/`,
    import.meta.url,
  );
  const [immutableEvidencePayload, reportPayload] = await Promise.all([
    readFile(new URL("evidence.json", evidenceRoot), "utf8"),
    readFile(new URL("reproducibility.json", evidenceRoot), "utf8"),
  ]);
  const report = JSON.parse(reportPayload);

  assert.equal(immutableEvidencePayload, activeEvidencePayload);
  assert.equal(activeEvidence.build.buildId, pointer.activeBuildId);
  assert.equal(activeEvidence.benchmark.status, "unavailable");
  assert.equal(activeEvidence.benchmark.return, null);
  assert.equal(activeEvidence.performance.status, "not-computed");
  assert.equal(
    createHash("sha256").update(immutableEvidencePayload).digest("hex"),
    report.evidenceRecordSha256,
  );
  assert.equal(report.result, "verified");

  const modelCard = JSON.parse(packagedModelCard);
  const dictionary = JSON.parse(packagedDictionary);
  const versionedGovernanceRoot = new URL(
    `../dist/client/data/evidence/governance/models/${modelCard.modelVersion}/`,
    import.meta.url,
  );
  const [versionedModelCard, versionedDictionary] = await Promise.all([
    readFile(new URL("model-card.json", versionedGovernanceRoot), "utf8"),
    readFile(new URL("metric-dictionary.json", versionedGovernanceRoot), "utf8"),
  ]);

  assert.equal(versionedModelCard, packagedModelCard);
  assert.equal(versionedDictionary, packagedDictionary);
  assert.equal(modelCard.modelVersion, activeEvidence.build.modelVersion);
  assert.equal(modelCard.releaseEligible, false);
  assert.equal(modelCard.validation.find(({ gate }) => gate === "portfolio-parity").status, "fail");
  assert.equal(
    dictionary.pillars.reduce((count, pillar) => count + pillar.components.length, 0),
    26,
  );
  const quality = JSON.parse(packagedQuality);
  assert.equal(quality.buildId, activeEvidence.build.buildId);
  assert.equal(quality.quality.status, "pass");
  assert.equal(quality.drift.status, "insufficient-history");
  assert.deepEqual(quality.drift.comparisons, []);
  const securityMaster = JSON.parse(packagedSecurityMaster);
  const versionedSecurityMaster = await readFile(
    new URL(
      `../dist/client/data/evidence/security-master/builds/${securityMaster.buildId}/security-master.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedSecurityMaster, packagedSecurityMaster);
  assert.equal(securityMaster.buildId, activeEvidence.build.buildId);
  assert.equal(securityMaster.coverage.securityCount, activeEvidence.source.rowCount);
  assert.equal(securityMaster.coverage.uniqueSecurityIdCount, 643);
  assert.equal(securityMaster.coverage.permanentIdentifierCount, 0);
  assert.equal(securityMaster.identityPolicy.tickerReuseProtection, "unavailable");
  const secRegistrants = JSON.parse(packagedSecRegistrants);
  const versionedSecRegistrants = await readFile(
    new URL(
      `../dist/client/data/evidence/sec-registrants/builds/${secRegistrants.buildId}/sec-registrants.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedSecRegistrants, packagedSecRegistrants);
  assert.equal(secRegistrants.buildId, activeEvidence.build.buildId);
  assert.equal(secRegistrants.status, "partial-current-snapshot");
  assert.equal(secRegistrants.historicalIdentityEligible, false);
  assert.equal(secRegistrants.coverage.matchedSecurityCount, 632);
  assert.equal(secRegistrants.coverage.unmatchedSecurityCount, 11);
  assert.equal(secRegistrants.coverage.companyCikMatchCount, 585);
  assert.equal(secRegistrants.coverage.fundClassMatchCount, 47);
  assert.equal(secRegistrants.coverage.operatingCompanyListingIdentityCoverage, 0);
  const maturity = JSON.parse(packagedMaturity);
  const versionedMaturity = await readFile(
    new URL(
      `../dist/client/data/evidence/maturity/builds/${maturity.buildId}/maturity.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedMaturity, packagedMaturity);
  assert.equal(maturity.buildId, activeEvidence.build.buildId);
  assert.equal(maturity.currentLevel, "research-preview");
  assert.equal(maturity.releaseEligible, false);
  assert.equal(maturity.observations.immutableDailyBuilds, 1);
  assert.equal(maturity.cutover.status, "not-authorized");
  const historicalReadiness = JSON.parse(packagedHistoricalReadiness);
  const versionedHistoricalReadiness = await readFile(
    new URL(
      `../dist/client/data/evidence/historical-readiness/builds/${historicalReadiness.buildId}/historical-readiness.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedHistoricalReadiness, packagedHistoricalReadiness);
  assert.equal(historicalReadiness.buildId, activeEvidence.build.buildId);
  assert.equal(historicalReadiness.status, "blocked");
  assert.equal(historicalReadiness.historicalValidationEligible, false);
  assert.equal(historicalReadiness.inventory.snapshotCount, 2);
  assert.equal(historicalReadiness.blockers.length, 10);
  const filingAvailability = JSON.parse(packagedFilingAvailability);
  const versionedFilingAvailability = await readFile(
    new URL(
      `../dist/client/data/evidence/filing-availability/builds/${filingAvailability.buildId}/filing-availability.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedFilingAvailability, packagedFilingAvailability);
  assert.equal(filingAvailability.buildId, activeEvidence.build.buildId);
  assert.equal(filingAvailability.status, "partial-retrospective-metadata");
  assert.equal(filingAvailability.historicalValidationEligible, false);
  assert.equal(filingAvailability.coverage.selectedTickerCount, 12);
  assert.equal(filingAvailability.coverage.submissionHistoryCount, 11);
  assert.equal(filingAvailability.coverage.periodicFilingAvailableCount, 11);
  assert.equal(filingAvailability.coverage.excludedPostCutoffFilingCount, 12);
  assert.deepEqual(filingAvailability.unmatched, [
    { ticker: "CTRA", reason: "no-exact-sec-registrant-match" },
  ]);
  const universeMembership = JSON.parse(packagedUniverseMembership);
  const versionedUniverseMembership = await readFile(
    new URL(
      `../dist/client/data/evidence/universe-membership/builds/${universeMembership.buildId}/universe-membership.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedUniverseMembership, packagedUniverseMembership);
  assert.equal(universeMembership.buildId, activeEvidence.build.buildId);
  assert.equal(universeMembership.survivorshipBiasControlled, false);
  assert.equal(universeMembership.historicalValidationEligible, false);
  assert.equal(universeMembership.comparison.continuingTickerCount, 629);
  assert.equal(universeMembership.comparison.entrantCount, 14);
  assert.equal(universeMembership.comparison.exitCount, 13);
  assert.equal(universeMembership.controls.filter(({ status }) => status === "blocked").length, 5);
  const corporateActions = JSON.parse(packagedCorporateActions);
  const versionedCorporateActions = await readFile(
    new URL(
      `../dist/client/data/evidence/corporate-action-readiness/builds/${corporateActions.buildId}/corporate-action-readiness.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedCorporateActions, packagedCorporateActions);
  assert.equal(corporateActions.buildId, activeEvidence.build.buildId);
  assert.equal(corporateActions.corporateActionsControlled, false);
  assert.equal(corporateActions.historicalValidationEligible, false);
  assert.equal(corporateActions.coverage.thresholdObservationCount, 5);
  assert.equal(corporateActions.coverage.possibleShareCountDiscontinuityCount, 3);
  assert.equal(corporateActions.coverage.verifiedCorporateActionCount, 0);
  const exitDisposition = JSON.parse(packagedExitDisposition);
  const versionedExitDisposition = await readFile(
    new URL(
      `../dist/client/data/evidence/exit-disposition-readiness/builds/${exitDisposition.buildId}/exit-disposition-readiness.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedExitDisposition, packagedExitDisposition);
  assert.equal(exitDisposition.buildId, activeEvidence.build.buildId);
  assert.equal(exitDisposition.historicalDelistingControlled, false);
  assert.equal(exitDisposition.coverage.observedExitCount, 13);
  assert.equal(exitDisposition.coverage.currentSecAssociationCount, 11);
  assert.equal(exitDisposition.coverage.unmatchedCurrentAssociationCount, 2);
  assert.deepEqual(
    exitDisposition.entries
      .filter(({ currentAssociationStatus }) => currentAssociationStatus === "unmatched")
      .map(({ ticker }) => ticker),
    ["BLD", "HOLX"],
  );
  const executionCosts = JSON.parse(packagedExecutionCosts);
  const versionedExecutionCosts = await readFile(
    new URL(
      `../dist/client/data/evidence/execution-cost-readiness/builds/${executionCosts.buildId}/execution-cost-readiness.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedExecutionCosts, packagedExecutionCosts);
  assert.equal(executionCosts.buildId, activeEvidence.build.buildId);
  assert.equal(executionCosts.portfolio.positionCount, 9);
  assert.equal(executionCosts.portfolio.pricedExecutionCount, 0);
  assert.equal(executionCosts.portfolio.transactionCost, null);
  assert.equal(executionCosts.portfolio.netReturn, null);
  const benchmarkReadiness = JSON.parse(packagedBenchmarkReadiness);
  const versionedBenchmarkReadiness = await readFile(
    new URL(
      `../dist/client/data/evidence/benchmark-readiness/builds/${benchmarkReadiness.buildId}/benchmark-readiness.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedBenchmarkReadiness, packagedBenchmarkReadiness);
  assert.equal(benchmarkReadiness.buildId, activeEvidence.build.buildId);
  assert.equal(benchmarkReadiness.coverage.candidateCount, 8);
  assert.equal(benchmarkReadiness.coverage.currentSecFundAssociationCount, 6);
  assert.equal(benchmarkReadiness.coverage.totalReturnObservationCount, 0);
  assert.equal(benchmarkReadiness.comparison.selectedBenchmarkId, null);
  const walkForwardReadiness = JSON.parse(packagedWalkForwardReadiness);
  const versionedWalkForwardReadiness = await readFile(
    new URL(
      `../dist/client/data/evidence/walk-forward-readiness/builds/${walkForwardReadiness.buildId}/walk-forward-readiness.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedWalkForwardReadiness, packagedWalkForwardReadiness);
  assert.equal(walkForwardReadiness.buildId, activeEvidence.build.buildId);
  assert.equal(walkForwardReadiness.calendar.snapshotCount, 2);
  assert.equal(walkForwardReadiness.calendar.eligibleFoldCount, 0);
  assert.equal(walkForwardReadiness.calendar.performanceComparisonCount, 0);
  assert.equal(walkForwardReadiness.walkForwardEligible, false);
  const prospectiveReadiness = JSON.parse(packagedProspectiveReadiness);
  const versionedProspectiveReadiness = await readFile(
    new URL(
      `../dist/client/data/evidence/prospective-readiness/builds/${prospectiveReadiness.buildId}/prospective-readiness.json`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(versionedProspectiveReadiness, packagedProspectiveReadiness);
  assert.equal(prospectiveReadiness.buildId, activeEvidence.build.buildId);
  assert.equal(prospectiveReadiness.progress.uniqueObservationDayCount, 1);
  assert.equal(prospectiveReadiness.progress.remainingObservationDayCount, 29);
  assert.equal(prospectiveReadiness.progress.executablePortfolioRecordCount, 0);
  assert.equal(prospectiveReadiness.progress.costedReturnObservationCount, 0);
  assert.equal(prospectiveReadiness.progress.approvedBenchmarkComparisonCount, 0);
  assert.equal(prospectiveReadiness.progress.monthlyValidationReportCount, 0);
  assert.equal(prospectiveReadiness.certificationEligible, false);
});
test("binds deployed static assets to the worker runtime", async () => {
  const wranglerConfig = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );

  assert.equal(wranglerConfig.assets?.binding, "ASSETS");
  assert.equal(wranglerConfig.assets?.directory, "../client");
});
