# ADR-0001: Build V3 in a Separate Repository

## Status
Accepted

## Context
V2 is a functioning production research application. The A+ program requires foundational changes to contracts, data history, scoring, portfolio construction, testing, security, and UX.

## Decision
Develop V3 in a separate repository and deployment. Preserve V2 as the production baseline and rollback target. Migrate selectively after parity tests.

## Consequences
- Production remains stable.
- V2/V3 outputs can be compared daily.
- V3 can use clean schemas and architecture.
- Duplicate maintenance exists temporarily.
- Cutover requires explicit gates.
