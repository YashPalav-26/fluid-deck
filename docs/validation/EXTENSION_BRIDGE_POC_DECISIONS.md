# Extension Bridge PoC — Decisions Record

*Evidence: `poc/extension-bridge/` + `docs/PHASE_3_DECISION_REGISTER.md`. Recorded 2026-11-08 (final Phase 4 entry review).*

## R-1 — Extension retry policy — ✅ user-approved
ACK timeout 10s · exponential backoff 1s→60s · unbounded retries · FIFO queue.
Safeguards: persist retry state across restarts · no aggressive retry loops · idempotent delivery · diagnostics for permanently unavailable receivers · ack only after durable persistence.

## R-2 — Capture protocol — ✅ user-approved
Identifier `fluiddeck.capture`, version v1, existing envelope, four message types:
`capture.deliver`, `capture.ack`, `capture.nack`, `capture.ready`.

## PoC outcome
30/30 browser matrix PASS (Chrome/Edge/Firefox 159) + 14/14 logic/boundary PASS.
One residual Phase 4 task: manual Firefox `about:debugging` temporary add-on load to verify background event-page behavior (see PHASE_4_ENTRY_REVIEW.md §6).
