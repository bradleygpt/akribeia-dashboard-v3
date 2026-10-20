# Daily Observation Collection

## Purpose

This control turns a newly published point-in-time source build into one auditable prospective
observation without allowing retries, repeated builds, or retroactive data to inflate the evidence
clock.

## Trust boundary

Before collection, the command validates the active-build pointer, published manifest, dashboard
artifact byte size, dashboard SHA-256 receipt, dashboard schema, and build/model lineage. The source
observation date comes only from that validated dashboard artifact.

## Date decisions

The immutable ledger is represented by `data/evidence/daily/<date>/...` directories.

- A date not later than the ledger because it already exists is a successful no-op.
- A previously unseen date older than the latest ledger date is blocked as a backfill attempt.
- Only a date newer than every ledger date can publish a new daily record.

## No new upstream data

A new date over unchanged upstream data is not an observation day (owner decision 2026-10-20,
audit E3). V2 bakes every night, so in September 11 refresh PRs carried byte-identical data under
new dates. Two controls now keep such a day out of the count:

- **Ingest.** When all three universe partitions are byte-identical to the active
  observation's, `scripts/ingest-v2-observation.node.mjs` ingests nothing. A later bake date is
  written as a `no-new-upstream-data` record under `data/evidence/upstream-stalls/<date>.json`,
  with a public copy and the projection `apps/dashboard/app/generated/active-upstream-stalls.json`.
  The record carries `countsTowardProspectiveHistory: false`. The refresh workflow opens it as its
  own small PR, the dashboard's prospective section lists it, and no build or ledger date is
  created. The same bake date again is `already-observed`, a no-op.
- **Daily evidence.** `npm run evidence:generate` refuses a new ledger date whose scored source
  digest equals the latest earlier date's. Rebuilding a date already in the ledger, after a model
  change for example, stays allowed.

The collector then runs the existing daily-evidence generator and prospective-readiness generator.
It requires the ledger to advance by exactly one date and requires the regenerated readiness report
to reconcile with that count.

## Attempt receipt

When `AKRIBEIA_COLLECTION_RECEIPT_PATH` is set, the command writes an atomic JSON receipt containing:

- attempt time and disposition;
- candidate observation date, observed timestamp, build, and model lineage;
- canonical pre-attempt ledger dates and before/after counts;
- generated daily and prospective report paths when collection occurs;
- the explicit reason for collection, duplicate no-op, or backfill block.

No-op receipts are workflow artifacts rather than repository evidence, so routine checks against an
unchanged source do not create commits.

## Automation

There is no scheduled collection workflow. `prospective-observation.yml` was deleted on 2026-10-20
(audit E4): the point-in-time refresh already writes each new day's daily evidence, so the separate
collector only ever found a duplicate date -- 63 runs, all green, none of them collecting anything.
The collector remains available as `npm run prospective-observation:collect` for manual checks.
