# Evidence Maturity Labels

`npm run maturity:generate` reconciles the active immutable daily record, reproduction report,
model card, quality report, security master, and historical daily-record count. It publishes one
ordered, fail-closed maturity assessment.

The levels are:

1. `development`: strict runtime contracts parse;
2. `research-preview`: immutable reproduction, active lineage, and data quality pass;
3. `validation-candidate`: portfolio parity, benchmark, point-in-time controls, permanent
   identities, and temporal drift pass;
4. `release-candidate`: every model gate, 30 prospective daily builds, the model release flag, and
   final security certification pass;
5. `production-approved`: final recovery/accessibility certification and explicit V3 production
   cutover authorization are present.

A higher level cannot skip a lower level. The generator exposes no caller-supplied certification or
cutover override. The current build is `research-preview`, is not release eligible, has one of 30
required daily builds, and has no final cutover authorization.

Canonical immutable assessments are stored at:

```text
data/evidence/maturity/builds/<build-id>/maturity.json
```

The dashboard and browser-accessible active projection use the exact same bytes. Identical retries
reuse the immutable assessment; conflicting bytes fail closed.

The functional maturity-label tree is deployed in the owner-only V3 preview from commit
`31b4fc185`, preserved as exact-tree Sites source commit `d24522bd7` and saved as Sites version 23.
V2 is unchanged.
