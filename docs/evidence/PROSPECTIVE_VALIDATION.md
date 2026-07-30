# Prospective Validation Readiness

Akribeia V3 treats prospective evidence as elapsed, immutable observations. It cannot be fabricated,
backfilled, or replaced by additional builds on the same date.

## Current gate

The active report is generated with:

```text
npm run prospective-readiness:generate
```

It inventories every published `daily/<date>/<build>/evidence.json` record, validates each record
against the daily-evidence contract, checks that the path agrees with the record lineage, and
requires the active daily projection to match its immutable record byte for byte.

The report also requires the active execution-cost, benchmark, and walk-forward readiness reports
to share the active build and model lineage.

## Certification conditions

The current fail-closed gate requires, at minimum:

- 30 distinct immutable daily observation dates;
- 30 executable portfolio records with prior-holding and fill lineage;
- 30 gross-and-net return observations computed from receipted costs;
- 30 comparisons against one approved, point-in-time, distribution-inclusive benchmark;
- one immutable monthly validation report;
- an approved, versioned prospective protocol;
- approved drift, escalation, suspension, and model-retirement rules.

These are necessary conditions, not an automatic certification promise. Security, accessibility,
recovery, methodology, and explicit production-cutover gates remain independent.

## Current evidence boundary

The repository contains one immutable research-preview daily record. It contains no executable
fills, transaction costs, return, benchmark comparison, or monthly validation report. Repeated
builds on the same source date do not add independent observation days.

The report therefore keeps `prospectiveValidationEligible` and `certificationEligible` false and
must not be used for an investment-performance or V2-replacement claim.
