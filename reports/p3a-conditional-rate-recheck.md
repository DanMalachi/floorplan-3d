# P3a — conditional clean-rate re-measurement with notch suppression live

Follow-on to `reports/p3a-notch-resolution.md`. That session built and Dan
accepted the doorway-notch suppression rule in `check_plan`
(`measure_clean_at_source.py`), landing `clean_at_source` at 87.2%
population-scale. Item (b) of the handoff's original re-measurement
spec — "the converter-clean-subset rate re-measured against
[clean_at_source]" — was never delivered in that session (it delivered
(a) and (c) only). This is a re-run of an existing measurement
(`classify_room_boundary_no_wall_match.py::compute_conditional_clean_rate`,
unchanged), not new code, run before touching the 57-edge audit because it
changes how that audit's result should be read.

**No pipeline changes.** `rooms.py`/`skeleton.py` diff against the ratified
P0-gate commit (`047e403`) is confirmed zero (`git diff 047e403 HEAD --
extraction/synth/rooms.py extraction/synth/skeleton.py`) — the converter
itself is unchanged since the offset/corner-mitre fix. Only
`measure_clean_at_source.py` changed (the notch suppression rule).

## Pre-registered prediction

Before running: the conditioned rate should **drop**, to roughly **46–52%**.
At n=300, the numerator (converter-clean plans, unaffected by a
source-measurement-only change) was 135 and the intersection was 119
against a denominator of 195 (65.0%). Growing the denominator toward the
new 87.2% population rate (~261/300) while the converter stays fixed caps
the rate near 135/261 ≈ 51.7%. A result materially above ~52% would
indicate a measurement problem, not converter improvement — there is no
converter-side change that could produce one.

## Result (n=300, direct intersection)

```
clean_at_source:                     257/300 (85.7%)
converter_clean (all-plans rate):    135/300 (45.0%)   <- unchanged, matches prior figure exactly
converter_clean AND clean_at_source: 135/300 (45.0%)
converter_clean | clean_at_source:   135/257 (52.5%)   <- the ratified-bar number
```

Matches the pre-registered prediction (52.5%, inside the 46–52% band with
trivial sampling slack — 257/300=85.7% vs. the 87.2% population figure is
normal n=300 sampling noise). **No measurement anomaly.**

**Notable finding beyond the headline number**: the intersection is now
**exactly equal to** the converter-clean count (135/135) — every plan the
converter successfully converts clean is now also recognized as
clean-at-source. Previously (2026-07-21, pre-suppression) the intersection
was 119/135 — 16 converter-clean plans were, at the time, incorrectly
flagged not-clean-at-source by the pre-suppression `check_plan`. The notch
suppression rule closed that entire gap: it was correctly recognizing real
doorway-notch source data as clean, and those 16 plans happened to be ones
the converter already handles fine. This is independent confirmation the
suppression rule is a source-measurement correction, not a fudge — it made
the denominator agree with plans already known-good on the numerator side.

## Reading the drop correctly: not a regression

Superficially, "conditioned clean rate" went from 61.0% (2026-07-21) to
52.5% (this session) — a large apparent decline. **This is not the
converter getting worse.** The converter (`rooms.py`/`skeleton.py`) has not
been touched since the corner-mitre fix (`ec53ba0`, well before either
measurement) — confirmed zero-diff above. What changed is that the
denominator became more honest: `clean_at_source` grew from 65.0%→87.2%
(population) because the suppression rule stopped incorrectly counting
doorway-notch plans as source-defective. Those plans are now correctly
counted as *convertible-in-principle* — but the converter still fails most
of them, because **the doorway-notch fix landed only in the QA/measurement
script** (`measure_clean_at_source.py`), never in the converter
(`rooms.py`). Unparked lever #1 from `docs/session-notes/p3a-handoff.md`
("Doorway-notch handling first" — converter-side edge-classification work
to skip door/window-captured notch edges during `rooms.py`'s wall-cycle
assembly) **is still unbuilt.**

The honest phase picture: denominator ~87%, converter at roughly half of
its own reachable ceiling, and the largest named lever toward closing that
gap has not been started.

## Scope note for the P0-gate decision

This measurement and the audited-defect-count work below answer two
**different** questions and should not be blurred in the gate report:

- **This measurement** (conditioned converter-clean rate) is about the
  converter's own distance from the ratified 90% bar, given an honest
  denominator.
- **The audited defect count** (below) refines the **ceiling** itself —
  how much of the remaining ~12.8% non-clean-at-source is a permanently
  unreachable genuine GT defect vs. a recoverable classify()-taxonomy
  artifact. It is not an input to the converter's own distance from the
  bar.

The P0-gate reachability decision needs both numbers, stated separately.
