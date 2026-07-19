"""Topology validity for a scored plan — thin wrapper over the schema
validator (extraction/schema/validate.py) so the metric engine doesn't
re-derive the same rules twice."""

from __future__ import annotations

from extraction.schema.validate import ValidationResult, validity

__all__ = ["ValidationResult", "validity"]
