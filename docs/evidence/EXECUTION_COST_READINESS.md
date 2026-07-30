# Execution-Cost Readiness

The execution-cost readiness report connects the active immutable portfolio to the inputs needed
for realistic execution and net-performance evidence. It preserves the nine exact target weights
and their research snapshot prices without treating those prices as fills.

The current repository has no capital base, prior holdings, execution calendar, executable price
records, liquidity or slippage model, or fee and tax schedule. Consequently, share quantities,
turnover, execution prices, transaction costs, gross return, and net return remain `null`. Missing
costs never become zero.

## Reproduction

```bash
npm run execution-costs:generate
```

The generator reads the active daily evidence record, verifies the portfolio artifact against its
byte-size and SHA-256 receipt, validates the published portfolio contract, and writes immutable
build-addressed evidence plus coordinated dashboard and public projections.

Current result:

| Measurement                    | Result        |
| ------------------------------ | ------------- |
| Exact portfolio targets        | 9             |
| Reconciled target-weight units | 1,000,000,000 |
| Priced executions              | 0             |
| Turnover                       | unavailable   |
| Transaction cost               | unavailable   |
| Net return                     | unavailable   |

Canonical output:

```text
data/evidence/execution-cost-readiness/builds/<build-id>/execution-cost-readiness.json
```

## Fail-closed boundary

Schema version `1.0.0` fixes `executionRecorded` and `netPerformanceEligible` to `false`. The exact
target-weight control passes; capital base, prior holdings, execution calendar, executable prices,
liquidity and slippage, and fee and tax controls remain blocked.

Execution evidence requires a documented capital base, point-in-time prior holdings, a market
calendar and deterministic execution rule, timestamped executable prices, liquidity and market
impact inputs, and an explicit cost schedule. Net-performance evidence additionally requires a
defined evaluation interval and reproducible benchmark record. Until those inputs exist, this
report cannot be interpreted as a trade blotter, performance record, or investment-performance
claim.
