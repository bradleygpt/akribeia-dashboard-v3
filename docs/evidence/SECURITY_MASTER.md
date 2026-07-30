# Security Master

`npm run master:generate` creates the active V3 security master only after the daily evidence
receipt, quality report, score artifact digest, schema, build, model, and source lineage reconcile.

The current source provides ticker, name, sector, and industry for 643 securities. It does not
provide a permanent issuer or listing identifier. The master therefore assigns a deterministic
`AKR-TICKER:<ticker>` research ID and labels every record `provisional-ticker-derived`.

This is deliberately narrower than a production security master:

- CIK, CUSIP, ISIN, and LEI remain null;
- one snapshot cannot prove listing dates, delistings, aliases, ticker changes, mergers, or ticker
  reuse;
- the generated ID is stable only within the documented ticker-only V3 scope;
- historical validation and production cutover remain blocked until point-in-time permanent
  identifiers and ticker history are available.

Canonical immutable records are stored at:

```text
data/evidence/security-master/builds/<build-id>/security-master.json
```

The dashboard and browser-accessible active projection use the exact same bytes. Identical retries
reuse the immutable record; conflicting bytes fail closed.

The functional security-master tree is deployed in the owner-only V3 preview from commit
`187fc9f6b`, preserved as exact-tree Sites source commit `481869f21` and saved as Sites version 21.
V2 is unchanged.
