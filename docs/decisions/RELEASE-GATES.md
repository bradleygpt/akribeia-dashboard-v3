# Release Gates

A production release is blocked unless:

- Type checking passes.
- Unit and regression tests pass.
- Quant parity tests pass when compatibility mode is affected.
- Data contracts validate.
- Portfolio constraints pass property tests.
- Build succeeds.
- Browser smoke tests pass.
- No unresolved critical or high security findings exist.
- The data build is atomic and identified by one manifest.
