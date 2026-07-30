# Exit-Disposition Readiness

The exit-disposition report checks the 13 ticker labels observed only in the preserved June `$10B`
research snapshot against the checksum-pinned current SEC company-ticker association source.

It answers a narrow question: does a June-only research-file label still have a current SEC
association? It does not claim to identify delistings, acquisitions, ticker changes, or continuous
listing history.

## Reproduction

```bash
npm run exit-disposition:generate
```

The generator verifies the SEC source byte size, SHA-256, record count, schema, and universe
membership evidence before exact ticker matching. It writes an immutable build-addressed report
and coordinated dashboard/public projections.

Current result:

| Measurement                      | Result |
| -------------------------------- | -----: |
| Observed June-only ticker labels |     13 |
| Exact current SEC associations   |     11 |
| Unmatched current associations   |      2 |
| Historical dispositions resolved |      0 |

`BLD` and `HOLX` are the unmatched labels. An unmatched current association is not proof of
delisting, acquisition, or ticker change. Conversely, a current CIK association does not prove
continuous listing or historical investability.

Canonical output:

```text
data/evidence/exit-disposition-readiness/builds/<build-id>/exit-disposition-readiness.json
```

## Fail-closed boundary

Schema version `1.0.0` fixes `historicalDelistingControlled` and
`historicalTickerHistoryEligible` to `false`. Only the current association check passes. Permanent
listing identity, ticker-effective intervals, delisting events, and merger/successor terms remain
blocked.

Resolution requires authoritative exchange or issuer event evidence with permanent listing
identity, effective dates, event terms, terminal value or successor security, provenance, and
immutable retrieval receipts. Current SEC association data cannot substitute for that history.
