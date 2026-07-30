# Corporate-Action Readiness

The corporate-action readiness report measures extreme price discontinuities across the 629 ticker
labels shared by the preserved June and July `$10B` research snapshots. It uses market
capitalization and implied-share changes to separate two diagnostic shapes, but it never labels an
observation as a verified split, distribution, merger, or other corporate action.

## Reproduction

```bash
npm run corporate-actions:generate
```

The generator verifies:

1. active historical-readiness and universe-membership lineage;
2. the SHA-256 and row-count receipt for each strict-contract-valid `$10B` source;
3. exact agreement with the 629 continuing ticker labels;
4. price, market-cap, and implied-share ratios;
5. immutable output reuse and coordinated dashboard/public projections.

Canonical output:

```text
data/evidence/corporate-action-readiness/builds/<build-id>/corporate-action-readiness.json
```

## Diagnostic rules

An observation enters the report when its later-to-earlier price ratio is at or beyond `0.5×` or
`2.0×`.

- `possible-share-count-discontinuity`: implied shares are also outside `0.5×`–`2.0×` while market
  capitalization stays within 15% of the earlier snapshot.
- `price-and-market-cap-discontinuity`: price and market capitalization move together while implied
  shares stay inside the boundary.

Current observations:

| Ticker | Diagnostic signal                  | Price ratio | Market-cap ratio | Implied-share ratio |
| ------ | ---------------------------------- | ----------: | ---------------: | ------------------: |
| ASTS   | price-and-market-cap-discontinuity |      0.481× |           0.484× |              1.006× |
| CRWD   | possible-share-count-discontinuity |      0.239× |           0.956× |              3.997× |
| DD     | possible-share-count-discontinuity |      2.826× |           0.944× |              0.334× |
| KLAC   | possible-share-count-discontinuity |      0.105× |           1.049× |             10.026× |
| ORCL   | price-and-market-cap-discontinuity |      0.485× |           0.483× |              0.996× |

Implied shares use rounded snapshot market capitalization divided by price. They are not
shares-outstanding records or adjustment factors.

## Fail-closed boundary

Schema version `1.0.0` fixes `corporateActionsControlled` and
`historicalValidationEligible` to `false`. Only receipted snapshot-price comparison passes. Split
events, distributions, mergers/spin-offs, delistings, and an adjusted total-return series remain
blocked.

An authoritative event ledger must provide source, event type, announcement and effective dates,
terms or adjustment factor, permanent security identity, and immutable retrieval evidence. Until
then, no diagnostic observation may be converted into a synthetic adjustment or historical return.
