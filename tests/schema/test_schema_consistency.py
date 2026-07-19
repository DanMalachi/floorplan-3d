"""extraction_v1.schema.json and models.py are maintained by hand in
lockstep; this is the tripwire that catches drift between them."""

import json
from pathlib import Path

import jsonschema
import pydantic
import pytest

from extraction.schema.models import ExtractionResult
from tests.schema.test_validate import triangle_plan_with_portal, valid_plan

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


def test_portal_role_with_zero_thickness_accepted_by_both():
    plan = triangle_plan_with_portal()
    assert plan["walls"][2]["role"] == "portal"
    assert plan["walls"][2]["thickness"] == 0
    schema = json.loads(SCHEMA_PATH.read_text())
    jsonschema.validate(plan, schema)
    ExtractionResult.model_validate(plan)


def test_portal_with_nonzero_thickness_rejected_by_both():
    # the if/then/else in extraction_v1.schema.json and Wall's
    # model_validator in models.py both enforce this independently of
    # validate.py's runtime check.
    plan = triangle_plan_with_portal()
    plan["walls"][2]["thickness"] = 50.0
    schema = json.loads(SCHEMA_PATH.read_text())
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(plan, schema)
    with pytest.raises(pydantic.ValidationError):
        ExtractionResult.model_validate(plan)


def test_non_portal_with_zero_thickness_rejected_by_both():
    plan = valid_plan()
    plan["walls"][0]["thickness"] = 0.0  # w1 is role="external"
    schema = json.loads(SCHEMA_PATH.read_text())
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(plan, schema)
    with pytest.raises(pydantic.ValidationError):
        ExtractionResult.model_validate(plan)
