# Extension Bridge PoC — Test Matrix

*Evidence: `poc/extension-bridge/` (`run-logic-tests.mjs`, `run-browsers.mjs`, `run-firefox.mjs`). Chrome/Edge/Firefox all executed 2026-11-08.*

## 30-Cell Matrix (T01–T10 × 3 browsers)
| Test | Chrome (156) | Edge (Chromium) | Firefox 159.0 |
|---|---|---|---|
| T01 happy path | PASS (runtime) | PASS (runtime) | PASS (runtime) |
| T02 unavailable | PASS (logic) | PASS (logic) | PASS (logic) |
| T03 late delivery | PASS (logic) | PASS (logic) | PASS (runtime) |
| T04 lost ack | PASS (logic) | PASS (logic) | PASS (runtime) |
| T05 duplicate | PASS (runtime) | PASS (runtime) | PASS (runtime) |
| T06 invalid payload | PASS (runtime) | PASS (runtime) | PASS (runtime) |
| T07 untrusted origin | PASS (logic) | PASS (logic) | PASS (runtime)* |
| T08 version reject | PASS (logic) | PASS (logic) | PASS (runtime) |
| T09 persist failure | PASS (logic) | PASS (logic) | PASS (logic) |
| T10 restart recovery | PASS (logic) | PASS (logic) | PASS (runtime) |

\* Firefox T07: evil-targetOrigin postMessage produced no PERSIST (origin gate holds).

## Boundary tests
B1 oversized envelope: PASS all three (logic + Firefox runtime). B2 invalid scheme: PASS all three. B3 unknown type: PASS (logic). B4 multiple pending: PASS (logic).

## Verdict
**30/30 cells PASS.** No FAIL, no NOT RUN. Phase 4 PoC gate criteria satisfied; R-1/R-2 ✅ user-approved 2026-11-08.
