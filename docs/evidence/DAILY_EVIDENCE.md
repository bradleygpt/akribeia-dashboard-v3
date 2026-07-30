# Immutable Daily Evidence

The V3 daily evidence ledger preserves what the active product build actually knew. It does not
backfill unavailable inputs or infer investment performance from a single snapshot.

## Record identity

Each record is addressed by:

```text
data/evidence/daily/<source-observation-date>/<build-id>/evidence.json
```

The source observation date, rather than the generation date or the current wall clock, defines
the daily partition. A retry for the same date and build must reproduce identical bytes. The
generator reuses an identical record and rejects any attempt to replace it with different bytes.

The browser-accessible copy uses the same relative path below
`apps/dashboard/public/data/evidence/`. `active.json` and the server-rendered projection are
replaceable views of the selected immutable record; they are not the source ledger.

## Verified inputs

`npm run evidence:generate` resolves the active-build pointer, parses the published manifest, and
requires a healthy `publish` decision. It then verifies the byte size and SHA-256 digest of the
dashboard, score, and portfolio artifacts before parsing their runtime schemas.

Generation fails closed unless:

- build, schema, and model lineage match across all artifacts;
- source content lineage matches across score, portfolio, and dashboard outputs;
- the exact portfolio weight units reconcile to the one-billion-unit scale;
- the daily record itself passes its strict runtime contract.

## Benchmark and performance states

The current repository has no point-in-time benchmark series. The first record therefore carries
`benchmark.status: "unavailable"`, a null return, and a reason. Its performance state is
`not-computed`. These are evidence states, not placeholders for a synthetic result.

An available benchmark record will require an explicit benchmark identifier, observation time,
and finite return under the runtime contract. Point-in-time sourcing, execution assumptions,
transaction costs, and an evaluation interval must exist before portfolio or benchmark returns
can be published.

## Reproduction report

Every daily directory also contains `reproducibility.json`. It receipts:

- the daily evidence record’s SHA-256 digest;
- pointer, manifest, publication, artifact, schema, lineage, and exact-weight checks;
- the command used to reproduce the record.

Run:

```bash
npm run evidence:generate
```

An identical rerun reports `reused`. A digest mismatch, schema failure, lineage mismatch, or
immutable-path conflict stops generation without changing the existing daily record.

All daily outputs are research-preview evidence. They are not investment advice, a performance
claim, or a promise of future results.
