# V2 → V3 Migration

## V2 treatment categories
- **Reuse:** proven code with minimal changes.
- **Refactor:** sound logic needing contracts, tests, or separation.
- **Rewrite:** material methodological or implementation defects.
- **Retire:** complexity without sufficient value.

## Required compatibility fixtures
- Full scored universe.
- Top-25 ranking.
- Rating distribution.
- Portfolio analysis examples.
- Portfolio construction examples.
- Risk and doppelganger outputs.
- Representative API responses.

## Compatibility gate
V3 `2-compatibility` outputs must either match V2 or produce a documented expected difference. No V3 methodology changes are permitted before this gate passes.

## Cutover gate
- 30 consecutive healthy daily builds.
- No unresolved high/critical security findings.
- No mixed build generations.
- Exact portfolio constraints.
- All primary browser workflows passing.
- Tested rollback to V2 or last-known-good V3 build.
