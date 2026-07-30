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

`.github/workflows/prospective-observation.yml` supports manual and scheduled collection. It uses a
single concurrency group, uploads every receipt, fails closed on backdated or command errors, and
opens a pull request only after a new observation passes all repository gates. It does not deploy
production, alter V2, select a benchmark, infer transaction costs, or calculate performance.
