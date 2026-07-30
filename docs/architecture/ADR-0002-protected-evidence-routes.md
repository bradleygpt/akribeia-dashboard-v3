# ADR-0002: Protected Evidence Routes Without Client Secrets

## Status

Accepted for the Phase 1 V3 preview.

## Context

The V3 dashboard needs useful server-side capabilities before any external AI provider or paid infrastructure is approved. Browser code must not receive provider credentials, and a failed or tampered data build must not be explained as trustworthy evidence.

The current Sites preview is owner-only and has no D1, KV, Durable Object, or paid rate-limiting binding. That access gate reduces exposure but does not replace request validation or abuse controls inside the worker.

## Decision

The Cloudflare worker owns three V3 routes:

- `GET /api/v3/health` reports the server capability mode without reading secrets.
- `POST /api/v3/evidence/security` returns one security's validated score and portfolio evidence.
- `POST /api/v3/ai/explain` returns an evidence-grounded deterministic explanation.

The explanation route is AI-compatible but does not claim that a generative model ran. Its response records:

- `mode: deterministic-evidence`;
- `externalModelUsed: false`;
- the active model version;
- immutable artifact citations;
- a research-only notice.

No external provider, API key, browser secret, paid action, or performance forecast is used.

## Request controls

Protected POST routes require:

- an exact same-origin `Origin` header;
- `Content-Type: application/json`;
- `X-Akribeia-Client: dashboard-v3`;
- a strict, unknown-field-rejecting Zod request contract;
- a body no larger than 4,096 bytes;
- a fixed-window per-IP-and-route limit of 20 requests per minute.

Responses are `no-store`, JSON-only, and include `nosniff` and no-referrer headers. Cross-origin response headers are not enabled.

The custom header is a CSRF barrier, not a secret or user authentication mechanism. The owner-only Sites access gate remains the preview's authentication boundary.

## Evidence controls

Before either protected route returns research evidence, the worker:

1. validates the active-build pointer;
2. validates the build manifest;
3. requires a healthy published build;
4. fetches the immutable score and portfolio artifacts;
5. checks exact byte sizes and SHA-256 digests;
6. validates both artifact schemas;
7. reconciles build, schema, and model lineage.

Any failure returns a generic `503 evidence_unavailable` response and no research payload.

## Rate-limit limitation

The rate limiter is bounded to 1,024 keys and intentionally uses isolate memory so the preview remains zero-cost. It limits bursts handled by one worker isolate but is not a globally consistent quota. A durable Cloudflare-native limiter requires a future approved zero-cost binding or infrastructure decision.

## Consequences

- Users gain a working evidence explorer now.
- Browser bundles contain no service credentials.
- Explanations are reproducible and testable.
- Generative AI remains disabled until a provider, secret lifecycle, cost ceiling, output contract, and evaluation gate are explicitly approved.
- The per-isolate rate limit must not be represented as a durable production security boundary.
