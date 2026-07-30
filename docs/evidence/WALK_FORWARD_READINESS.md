# Walk-Forward Readiness

The walk-forward readiness report consolidates the active Phase 3 evidence into one fold-eligibility
gate. It does not run a backtest.

The repository contains two receipted cross-sections, neither point-in-time eligible. Filing
availability is partial and retrospective. Survivorship-aware membership, permanent identity,
corporate actions, exit dispositions, execution costs, benchmark total returns, a frozen
walk-forward protocol, and a sufficient out-of-sample calendar remain blocked.

## Reproduction

```bash
npm run walk-forward-readiness:generate
```

Current result:

| Measurement                      | Result |
| -------------------------------- | -----: |
| Snapshots inventoried            |      2 |
| Point-in-time eligible snapshots |      0 |
| Candidate folds                  |      0 |
| Eligible folds                   |      0 |
| Evaluated folds                  |      0 |
| Performance comparisons          |      0 |

Canonical output:

```text
data/evidence/walk-forward-readiness/builds/<build-id>/walk-forward-readiness.json
```

## Fail-closed boundary

Schema version `1.0.0` fixes walk-forward and out-of-sample eligibility to `false`, requires all
seven source reports to carry no eligibility claim, and fixes every fold and performance count to
zero. A caller cannot convert partial inputs into an eligible fold.

Future evaluation requires temporally ordered point-in-time inputs, permanent identity and
survivorship control, corporate-action and exit treatment, executable portfolio and cost records,
an adjusted benchmark total-return series, and a reviewed protocol covering training windows,
rebalance cadence, embargoes, parameter freezes, and out-of-sample evaluation.
