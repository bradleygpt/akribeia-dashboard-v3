# Universe Membership Readiness

The universe-membership report compares the two preserved, strict-contract-valid `$10B` research
cross-sections and makes their observed ticker changes visible. It is a deterministic inventory of
repository evidence, not a reconstructed historical constituent series.

## Reproduction

Run:

```bash
npm run universe-membership:generate
```

The generator:

1. parses the active historical-readiness report;
2. requires the canonical `june-oracle` and `july-baseline` inventories;
3. locates each receipted `$10B` artifact;
4. verifies the artifact SHA-256, declared row count, floor, and strict V3 input contract;
5. compares ticker membership and common-ticker sector/industry classifications;
6. writes an immutable build-addressed report and coordinated dashboard/public projections.

Canonical immutable output:

```text
data/evidence/universe-membership/builds/<build-id>/universe-membership.json
```

An identical retry reuses the immutable report. Different bytes at the same build-addressed path
fail closed.

## Current observed comparison

| Measurement                               | Result |
| ----------------------------------------- | -----: |
| June `$10B` ticker labels                 |    642 |
| July `$10B` ticker labels                 |    643 |
| Continuing ticker labels                  |    629 |
| Union                                     |    656 |
| Observed entrants                         |     14 |
| Observed exits                            |     13 |
| Common-ticker classification changes      |      0 |
| Verified historical eligibility intervals |      0 |

Observed entrants:

```text
BAX CART CORT CRDO CRL DAR ENSG JKHY LITE MOH ORI SCI TECH ZION
```

Observed exits:

```text
BLD BMNR DOCU ESI HOLX IT JOBY LUMN OKLO POWL RIOT SWKS WULF
```

These labels are emitted in canonical ticker order with their snapshot name and market
capitalization.

## Fail-closed interpretation

Schema version `1.0.0` fixes both `survivorshipBiasControlled` and
`historicalValidationEligible` to `false`. Only the observation that two receipted snapshots have
different ticker membership passes. Five controls remain blocked:

- eligibility rules;
- membership-effective intervals;
- permanent identity continuity;
- delisting and corporate-event evidence;
- survivorship-bias control.

An observed exit may be caused by a market-cap threshold, source coverage, ticker change, merger,
delisting, or collection difference. An observed entrant has the same ambiguity. Ticker equality
also does not prove issuer or listing continuity.

The report therefore cannot be used as the universe for a backtest, benchmark comparison,
investment-performance claim, or V2 cutover decision. It identifies concrete missing controls for
the next data-acquisition work.
