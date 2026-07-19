"""Group scored plans by (encoding, convention, scope) — Appendix C's
closing note: metrics are computed per stratum, never aggregate-only."""

from __future__ import annotations

from collections import defaultdict


def stratum_key(plan: dict) -> tuple[str, str, str]:
    src = plan["source"]
    return (src["encoding_class"], src["convention_class"], src["scope_class"])


def group_by_stratum(plans: list[dict]) -> dict[tuple[str, str, str], list[dict]]:
    groups: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for plan in plans:
        groups[stratum_key(plan)].append(plan)
    return dict(groups)
