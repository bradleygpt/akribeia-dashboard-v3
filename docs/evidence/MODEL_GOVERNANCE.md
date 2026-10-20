# Model Governance

The V3 model card and metric dictionary describe the active model from validated repository
evidence. They are version-addressed artifacts, not marketing claims.

## Generate

```bash
npm run governance:generate
```

Generation verifies that:

- the active daily projection exactly matches its immutable record and reproduction digest;
- the preserved metric metadata source commit matches the active evidence source;
- the default preserved preset is `equal`;
- all five metadata weights match the active model weights;
- every model-card and dictionary field passes its strict runtime schema.

The canonical files are written below:

```text
data/evidence/governance/models/<model-version>/model-card.json
data/evidence/governance/models/<model-version>/metric-dictionary.json
```

An identical retry reuses those bytes. A conflicting rewrite fails closed. Browser-accessible
versioned copies and replaceable active projections are generated from the same payloads.

## Maturity and validation

The current model is `research-preview` and `releaseEligible: false`. The card reports every
validation gate independently:

- software, scoring parity, coverage, and exact portfolio constraints pass;
- V2 portfolio parity fails because the preserved oracle is stale against the July 2026 data
  vintage;
- benchmark and point-in-time validation have not started;
- one immutable daily observation is insufficient prospective evidence.

A passing scoring-parity gate does not override the failed or unfinished gates.

## Metric dictionary boundary

The preserved V2 metadata identifies 26 component metrics and whether higher or lower values are
preferred. It does not preserve the raw transformation, cross-sectional normalization,
winsorization, or component missing-value formulas used to create each V2 pillar score.

The dictionary publishes the evidence that exists and labels that methodology gap explicitly. It
does not reverse-engineer or guess an undocumented formula.

## Model 3.1.0 (owner decisions 2026-10-20)

Two deliberate departures from the V2 composite, recorded as audit findings D3 and D4:

- **ETFs are not applicable.** The V2 shard fills ETF pillars with neutral placeholders (7.0
  each). V3 publishes no pillar-based score or rank for an ETF: its row is excluded with the
  reason `not-applicable-etf`, it is never a portfolio candidate, and it sits outside the
  coverage population and the buy/sell breadth tiers. The dashboard shows "Not applicable (ETF)".
- **A pillar with no observed inputs is unavailable.** V2 still publishes a score for a pillar
  whose component inputs are all null, often the top grade (CTRA and BK Momentum 12, FISV
  Profitability 12). V3 checks each pillar's inputs against the bake's `pillar_metrics` and
  treats a pillar with none as missing: it gets no score, and the security's composite uses the
  remaining weights, renormalized explicitly (`renormalize-explicitly`, `available-weight`).
  A security needs at least 60% of the pillar weight (three of five pillars). Scoring fails
  closed if the metadata has no `pillar_metrics` or a stock row has no `raw` inputs.

The maturity report counts only immutable daily builds made under the active model version, so
builds made under 3.0.0 do not count toward 3.1.0's maturity gates. The daily observation
ledger itself stays one dated sequence across versions.

## Change control

Any change to a pillar, weight, component definition, missing-data policy, minimum coverage, or
normalization requires:

1. a new model version;
2. regenerated versioned governance artifacts;
3. new scoring and portfolio evidence;
4. reevaluation of every validation gate.

Model governance evidence is research documentation, not investment advice or a performance
guarantee.
