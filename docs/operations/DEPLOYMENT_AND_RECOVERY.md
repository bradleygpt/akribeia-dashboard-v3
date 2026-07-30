# V3 Deployment and Recovery

## Scope

This runbook applies only to the isolated Akribeia V3 Sites deployment. It does not authorize or describe a V2 production change or final V3 cutover.

The current V3 preview remains owner-only and zero-cost-compatible. A Sites deployment URL is operationally a production deployment for that isolated project, but it is not the V3 final-production cutover target.

## Required release inputs

Before saving a Sites version:

1. begin from a clean feature branch created from current `origin/main`;
2. run Prettier on changed files;
3. run `npm run ci`;
4. run `npm audit --audit-level=high`;
5. run `git diff --check`;
6. inspect the complete diff;
7. commit and push the exact reviewed source;
8. confirm `apps/dashboard/dist/server/index.js` exists;
9. confirm `apps/dashboard/dist/.openai/hosting.json` matches the source hosting metadata;
10. confirm the packaged active pointer, manifest, and immutable artifacts pass byte-size and SHA-256 checks.

The dashboard test suite enforces steps 8–10 against the actual built output.

## Private deployment

Use the Sites project ID already stored in `apps/dashboard/.openai/hosting.json`. Do not create a second project.

1. push the exact validated source tree to the configured Sites source branch using a short-lived per-command authorization header;
2. verify the pushed tree equals the reviewed GitHub tree;
3. package the successful `apps/dashboard/dist` build with the Sites packaging helper;
4. save one immutable Sites version using the pushed source commit;
5. deploy that saved version through the owner-only deployment operation;
6. poll deployment status to `succeeded` or `failed`;
7. record the validated GitHub source and deployment state in `docs/CODEX_EXECUTION_STATUS.md`.

Never persist the short-lived Sites source token in a URL, Git configuration, file, log, or commit.

## Health verification

`GET /api/v3/health` is the V3 evidence health check. A `200` response requires:

- a valid active-build pointer;
- a healthy published manifest;
- exact score and portfolio artifact byte sizes and SHA-256 digests;
- valid score and portfolio schemas;
- matching build, schema, and model lineage.

The response includes the active build, schema, model, and individual check results. It reports `externalModelConfigured: false` while deterministic evidence mode is active.

A `503` means evidence must be treated as unavailable. Do not present that build as healthy or attempt a cutover.

## Application rollback

The product-level rollback is the validated active-build rollback implemented by `rollbackVerticalSlice`:

1. identify the current and previous immutable build IDs from `active-build.json`;
2. verify the previous manifest and every required artifact;
3. update the active pointer and dashboard projection together;
4. verify the resulting pointer, projection, score, and portfolio lineage;
5. if projection recovery fails, restore the original pointer and surface the failure.

Automated integration tests cover successful rollback, activation failure, projection failure, and rollback-projection recovery.

## Hosted deployment rollback

If a newly deployed V3 Sites version fails while the prior version is known good:

1. stop further V3 releases;
2. preserve worker logs, deployment identifiers, source SHAs, and failing health output;
3. select the immediately previous saved Sites version whose source and checks were validated;
4. redeploy that saved version through the normal owner-only deployment operation;
5. poll until deployment succeeds;
6. run the health check and primary browser smoke workflow;
7. record the incident and recovery evidence before resuming development.

Do not rebuild the old version, rewrite Git history, bypass access controls, or modify V2.

## Failure rules

- A pending, cancelled, skipped, failed, or missing required GitHub check blocks merge.
- A failed package verification blocks version saving.
- A failed Sites deployment blocks release and must not be described as available.
- A failed evidence health check blocks use of the evidence API and any cutover.
- An unresolved high or critical dependency/security finding blocks release.
- V2 remains the production rollback boundary until the final V3 cutover gate is separately authorized.

## Recovery evidence

For each recovery exercise, retain:

- failing and restored source SHAs;
- saved version and deployment identifiers;
- health responses before and after recovery;
- browser smoke result;
- incident timeline and root cause;
- confirmation that V2 and production data were unchanged.
