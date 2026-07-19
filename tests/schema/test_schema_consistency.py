"""extraction_v1.schema.json and models.py are maintained by hand in
lockstep; this is the tripwire that catches drift between them."""

import json
from pathlib import Path

import jsonschema

from extraction.schema.models import ExtractionResult
from tests.schema.test_validate import valid_plan

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "extraction" / "schema" / "extraction_v1.schema.json"


def test_valid_fixture_satisfies_json_schema():
    schema = json.loads(SCHEMA_PATH.read_text())
    jsonschema.validate(valid_plan(), schema)


def test_valid_fixture_parses_as_pydantic_model():
    ExtractionResult.model_validate(valid_plan())


def test_rail_role_accepted_by_both():
    plan = valid_plan()
    assert plan["walls"][3]["role"] == "rail"
    schema = json.loads(SCHEMA_PATH.read_text())
    jsonschema.validate(plan, schema)
    ExtractionResult.model_validate(plan)
