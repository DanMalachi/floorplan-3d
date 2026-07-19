"""Round-trip test for the SVG->schema-v1 GT-authoring converter
(extraction/synth/svg_gt.py), against a hand-built 2-line-layer SVG."""

import json
from pathlib import Path

import jsonschema
import pytest

from extraction.schema.models import ExtractionResult
from extraction.schema.validate import validity
from extraction.synth.svg_gt import svg_to_schema_v1

SVG = """<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     data-mm-per-unit="10">
  <g inkscape:groupmode="layer" inkscape:label="external">
    <line x1="0" y1="0" x2="400" y2="0" stroke-width="20"/>
    <line x1="400" y1="0" x2="400" y2="300" stroke-width="20"/>
    <line x1="400" y1="300" x2="0" y2="300" stroke-width="20"/>
    <line x1="0" y1="300" x2="0" y2="0" stroke-width="20"/>
  </g>
  <g inkscape:groupmode="layer" inkscape:label="rail">
    <line x1="0.001" y1="300" x2="0.001" y2="450" stroke-width="10"/>
  </g>
  <g inkscape:groupmode="layer" inkscape:label="door">
    <line x1="150" y1="0" x2="240" y2="0"/>
  </g>
</svg>"""


@pytest.fixture(scope="module")
def plan(tmp_path_factory) -> dict:
    path: Path = tmp_path_factory.mktemp("svg_gt") / "fixture.svg"
    path.write_text(SVG, encoding="utf-8")
    return svg_to_schema_v1(path, filename="fixture.svg")


def test_four_external_walls_and_one_rail(plan):
    roles = sorted(w["role"] for w in plan["walls"])
    assert roles == ["external", "external", "external", "external", "rail"]


def test_thickness_scaled_by_mm_per_unit(plan):
    # stroke-width 20 svg units * 10 mm/unit = 200mm
    external = [w for w in plan["walls"] if w["role"] == "external"]
    assert all(w["thickness"] == 200.0 for w in external)
    rail = next(w for w in plan["walls"] if w["role"] == "rail")
    assert rail["thickness"] == 100.0


def test_door_attached_to_nearest_wall_with_correct_span(plan):
    external = [w for w in plan["walls"] if w["role"] == "external"]
    hosts_with_openings = [w for w in external if w["openings"]]
    assert len(hosts_with_openings) == 1
    host = hosts_with_openings[0]
    door = host["openings"][0]
    assert door["class"] == "door"
    # svg x in [150,240] * 10mm/unit -> [1500,2400], center=1950 width=900
    assert door["center_offset"] == pytest.approx(1950.0)
    assert door["width"] == pytest.approx(900.0)


def test_junctions_snap_near_coincident_endpoints(plan):
    # the rail's start (0.001, 300) is 0.01mm from the external wall's
    # corner (0, 300) after scaling — well within the 5mm snap tolerance,
    # so both walls' endpoints get snapped to their shared centroid and
    # the junction reports both as members.
    corner = next(j for j in plan["junctions"] if abs(j["point"][0]) < 1 and abs(j["point"][1] - 3000.0) < 1)
    assert len(corner["walls"]) >= 2
    rail = next(w for w in plan["walls"] if w["role"] == "rail")
    assert rail["start"] == corner["point"]


def test_output_is_schema_and_topologically_valid(plan):
    schema = json.loads(Path("extraction/schema/extraction_v1.schema.json").read_text())
    jsonschema.validate(plan, schema)
    ExtractionResult.model_validate(plan)
    result = validity(plan)
    assert result.valid, result.errors
