# Filing Availability Evidence

The filing-availability report is the first bounded Phase 3 point-in-time control. It uses the
SEC's EDGAR acceptance timestamps to prevent filings accepted after the active model's observation
cutoff from entering the visible evidence set.

It does not claim that the original research pipeline acquired or processed each filing at that
time, and it does not make the repository historically validation-ready.

## Official source

The SEC EDGAR Submissions API is public, requires no API key, and is updated as filings are
disseminated. The SEC documents that:

- each CIK endpoint contains at least one year or 1,000 recent filings;
- the API is updated in real time with a typical submissions-processing delay under one second;
- EDGAR acceptance is the successful completion of acceptance review;
- public filings are made available on the SEC website after acceptance.

Sources:

- <https://www.sec.gov/search-filings/edgar-application-programming-interfaces>
- <https://www.sec.gov/submit-filings/filer-support-resources/edgar-glossary>
- <https://www.sec.gov/search-filings/public-dissemination-service-system-contact>

## Capture

The source scope is deliberately visible and bounded: operating-company CIKs appearing in the
dashboard's top-score set or active portfolio. The current union contains 12 tickers. Eleven have
exact SEC registrant matches; `CTRA` remains unresolved.

To capture the 11 submission histories:

```powershell
$env:SEC_USER_AGENT = "Akribeia-V3/0.1 (contact@example.com)"
npm run filing-sources:fetch
```

The capture stays below the SEC's published request ceiling and preserves exact provider bytes at:

```text
data/reference/sec/filing-submissions/2026-07-30/
```

The receipt records retrieval time, official URI, CIK, byte size, recent filing count, and SHA-256
for every response. Identical retries verify and reuse the snapshot without network access.

## Decision cutoff

`npm run filing-availability:generate` verifies:

1. daily-evidence, dashboard, and registrant-crosswalk lineage;
2. the dashboard byte size and SHA-256 from the daily evidence receipt;
3. exact agreement between selected operating-company CIKs and the source receipt;
4. every submission payload's size, digest, CIK, schema, and aligned filing columns;
5. each included filing's EDGAR acceptance time is at or before
   `2026-07-28T17:06:46Z`.

The report selects the latest eligible periodic filing (`10-K`/`10-Q` families) and latest eligible
current report (`8-K` family) for each covered ticker. It also counts all captured submissions
accepted after the cutoff instead of letting them enter the decision set.

Current result:

| Control                           | Result |
| --------------------------------- | -----: |
| Selected visible tickers          |     12 |
| Verified submission histories     |     11 |
| Tickers with eligible periodic    |     11 |
| Tickers with eligible current     |     11 |
| Captured post-cutoff filings held |     12 |
| Unmatched                         |      1 |

Canonical immutable output:

```text
data/evidence/filing-availability/builds/<build-id>/filing-availability.json
```

## Fail-closed boundary

Schema version `1.0.0` fixes `historicalValidationEligible` to `false` and rejects any included
filing accepted after the model cutoff. The evidence is still partial because:

- it is a retrospective metadata capture, not acquisition-time pipeline telemetry;
- coverage is limited to 12 visible securities rather than all 643 active records;
- current SEC histories can be revised and do not expose an as-was API version;
- vendor processing and model ingestion latency are not measured;
- survivorship, historical identity, corporate actions, benchmarks, costs, and walk-forward
  controls remain unresolved.

V2 is unchanged. The report is research evidence, not a backtest, performance claim, or production
cutover authorization.

The functional tree `13d8eabb7` is preserved as Sites source commit `48e13f059` and deployed as
owner-only Sites version 29.
