"""Corpus registry: provenance, class labels, GT status, split, and canary
flag per plan (docs/paper.md Section 6.2 item 3). CSV over SQLite for
git-diffability at this corpus size (16 plans); revisit if it grows past a
few hundred rows.
"""

from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

DEFAULT_REGISTRY_PATH = Path(__file__).parent / "registry.csv"


@dataclass
class RegistryEntry:
    plan_id: str
    source_file: str
    gt_file: str
    gt_status: str  # "provisional_unaudited" | "audited" | "none"
    split: str  # "dev" | "val" | "test"
    canary: bool
    encoding_class: str
    convention_class: str
    scope_class: str
    router_confidence: float
    notes: str


def load_registry(path: Path = DEFAULT_REGISTRY_PATH) -> list[RegistryEntry]:
    with path.open(encoding="utf-8", newline="") as f:
        return [
            RegistryEntry(
                plan_id=row["plan_id"],
                source_file=row["source_file"],
                gt_file=row["gt_file"],
                gt_status=row["gt_status"],
                split=row["split"],
                canary=row["canary"].lower() == "true",
                encoding_class=row["encoding_class"],
                convention_class=row["convention_class"],
                scope_class=row["scope_class"],
                router_confidence=float(row["router_confidence"]),
                notes=row["notes"],
            )
            for row in csv.DictReader(f)
        ]


def stratum_counts(entries: list[RegistryEntry]) -> Counter[tuple[str, str, str]]:
    return Counter((e.encoding_class, e.convention_class, e.scope_class) for e in entries)


def gt_status_counts(entries: list[RegistryEntry]) -> Counter[str]:
    return Counter(e.gt_status for e in entries)
