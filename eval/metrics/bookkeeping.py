"""ZFR / MFR-3 bookkeeping (docs/paper.md Appendix C, Section 1.3).

Both require a human_edit_count per plan — a real reviewer accepting or
correcting the output. Phase 0 has no reviewed plans yet, so callers pass
whatever edit counts they have; entries with edit_count=None are excluded
and the caller is responsible for reporting coverage (e.g. "ZFR measured on
0/15 plans — NOT MEASURED") rather than treating a None-filtered ratio as a
real score.
"""

from __future__ import annotations


def zfr(edit_counts: list[int | None]) -> float | None:
    measured = [c for c in edit_counts if c is not None]
    if not measured:
        return None
    return sum(1 for c in measured if c == 0) / len(measured)


def mfr3(edit_counts: list[int | None]) -> float | None:
    measured = [c for c in edit_counts if c is not None]
    if not measured:
        return None
    return sum(1 for c in measured if c <= 3) / len(measured)
