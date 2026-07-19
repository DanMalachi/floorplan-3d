"""The 15 real plans converted from legacy/data/floorplan-gt must each be a
valid schema-v1 plan (JSON Schema + topology validator), even though the
conversion is a provisional/unaudited seed, not a substitute for real
human-authored GT (see extraction/synth/convert_legacy_gt.py docstring)."""

import json
from pathlib import Path

import jsonschema
import pytest

from extraction.schema.models import ExtractionResult
from extraction.schema.validate import validity
from extraction.synth.convert_legacy_gt import convert_all

SCHEMA_PATH = Path("extraction/schema/extraction_v1.schema.json")
GT_DIR = Path("legacy/data/floorplan-gt")
OUT_DIR = Path("data/corpus/gt_provisional")


@pytest.fixture(scope="module")
def converted():
    return convert_all(GT_DIR, OUT_DIR)


def test_converts_all_export_format_plans(converted):
    # 15 real plans use the EXPORT format; test_1.json (AUTHORED format) is
    # correctly skipped — see convert_all's format check.
    assert len(converted) == 15


def test_every_converted_plan_is_schema_valid_and_topologically_valid(converted):
    schema = json.loads(SCHEMA_PATH.read_text())
    failures = []
    for name in converted:
        plan = json.loads((OUT_DIR / name).read_text(encoding="utf-8"))
        try:
            jsonschema.validate(plan, schema)
            ExtractionResult.model_validate(plan)
        except Exception as e:  # noqa: BLE001 — collecting all failures for one clear report
            failures.append(f"{name}: schema/model error: {e}")
            continue
        result = validity(plan)
        if not result.valid:
            failures.append(f"{name}: {result.errors}")
    assert not failures, "\n".join(failures)
