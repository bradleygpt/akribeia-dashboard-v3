# SEC Registrant Crosswalk

The SEC registrant crosswalk adds current filer and registered-fund associations to the active V3
universe without upgrading provisional ticker-derived research IDs into permanent security
identities.

## Source capture

The source snapshot is preserved under:

```text
data/reference/sec/2026-07-30/
```

It contains the SEC's `company_tickers.json` and `company_tickers_mf.json` provider bytes plus an
immutable receipt. The receipt records retrieval time, provider modification time, byte size,
record count, and SHA-256 for each file. A first capture requires a descriptive SEC user agent:

```powershell
$env:SEC_USER_AGENT = "Akribeia-V3/0.1 (contact@example.com)"
npm run sec-identity:fetch
```

An identical retry verifies and reuses the committed bytes without making another request.
Conflicting bytes or a failed receipt check stop generation. The SEC files are public and require
no API key; the capture policy limits itself to the SEC's published request ceiling. The SEC also
states that its ticker associations are periodically updated and are not guaranteed for accuracy
or scope.

## Matching policy

`npm run registrants:generate`:

1. verifies active daily-evidence and security-master lineage;
2. verifies every captured source against its receipt;
3. uses uppercase exact current-ticker matching only;
4. treats multiple candidates as a fatal ambiguity;
5. records zero candidates in the unmatched ledger;
6. publishes identical deterministic bytes to immutable, public, and dashboard projections.

There is no fuzzy, issuer-name, or hand-maintained fallback.

Current active-universe results:

| Scope               | Exact matches | Universe | Coverage |
| ------------------- | ------------: | -------: | -------: |
| All active records  |           632 |      643 |    98.3% |
| Operating companies |           585 |      588 |    99.5% |
| Registered funds    |            47 |       55 |    85.5% |

Eleven tickers have no exact match in the captured provider file: `BAI`, `BK`, `CTRA`, `DIA`,
`GLD`, `IAU`, `IBIT`, `MDY`, `PSTG`, `SPLG`, and `SPY`. None are silently dropped or inferred.

## Identity limits

A CIK identifies an SEC filer or registrant. It is not a permanent exchange-listing or security
identifier. For registered funds, series and class IDs identify a fund structure but do not
establish point-in-time trading history. This snapshot therefore cannot prove:

- historical ticker or listing intervals;
- mergers, delistings, aliases, or ticker reuse;
- corporate-action history;
- when an association became available to a historical decision process.

The crosswalk schema fixes `historicalIdentityEligible` to `false`, reports operating-company
listing-identity coverage as zero, and keeps every Akribeia security ID provisional.

Canonical immutable output:

```text
data/evidence/sec-registrants/builds/<build-id>/sec-registrants.json
```

V2 is unchanged. The output supports current research navigation and evidence inspection, not
historical validation, investment performance, or production cutover.

The functional tree `e88884023` is preserved as Sites source commit `af38cc5a5` and deployed as
owner-only Sites version 27.
