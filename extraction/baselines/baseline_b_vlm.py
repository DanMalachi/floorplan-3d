"""Baseline (b) — frontier-VLM full-plan JSON (docs/extraction-plan.md Phase
1; prompt = paper.md Appendix B5). Best-of-3 per plan, selected by (1) schema
validity, (2) self-consistency (highest mean pairwise wall-rasterization IoU
against the other two candidates) — NOT against baseline (c)'s ink mask,
which would reward hallucinated walls sitting on text/furniture/dimension
ink (Dan's plan-review amendment).

Model is resolved once via client.models.retrieve("claude-sonnet-5") and
pinned (id + created_at) rather than a hand-typed dated string — there is no
published dated snapshot for this model generation; the bare alias IS the
full identifier (flagged explicitly to Dan in the approved plan).

Cost pre-flight: prints an estimate for the full K=3-per-plan call set
before spending anything; stops for review if the estimate exceeds $15.

Usage: python -m extraction.baselines.baseline_b_vlm
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import anthropic
import cv2
import fitz  # PyMuPDF
import numpy as np
from dotenv import dotenv_values

from eval.registry.registry import load_registry
from extraction.schema.validate import validity
from extraction.baselines.common import build_envelope, utc_now_iso, write_prediction

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "baselines_out" / "b_vlm"
PIPELINE_VERSION = "baseline-b-vlm-v1"
SCHEMA_PATH = REPO_ROOT / "extraction" / "schema" / "extraction_v1.schema.json"

K = 3
COST_GATE_USD = 15.0
SONNET_5_INPUT_PER_MTOK = 3.0  # standard (not intro) pricing — conservative for the gate
SONNET_5_OUTPUT_PER_MTOK = 15.0
GRID = 1024

SYSTEM_PROMPT = """You are a floorplan extraction engine. Respond with ONLY a single \
JSON object matching the schema below (no markdown code fences, no prose \
before or after) — walls-first, openings nested inside their host wall, \
rooms as ordered wall-id cycles. When uncertain whether an element exists, \
omit it rather than guess — omission is honest, invention is not.

Coordinate convention: emit every coordinate and length (wall start/end, \
opening center_offset/width, room zone polygons) on a 0-1024 grid where the \
image's LONGER dimension maps to 0-1024 and the shorter dimension is scaled \
by the exact same factor (i.e. the grid preserves the image's aspect ratio; \
it is not stretched to a 1024x1024 square). This lets every emitted number \
be rescaled by a single scalar back to pixel space.

You cannot know the file's true sha256, real calibration diagnostics, or \
cost — fill those required-but-unknowable fields with honest placeholders \
(file_sha256: "", cost_usd: 0, tier: 4, kill_log_ref: "n/a") and put your \
actual effort into walls, openings, and rooms, which are graded."""


def _client() -> anthropic.Anthropic:
    key = dotenv_values(REPO_ROOT / ".env.local").get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not found in .env.local")
    return anthropic.Anthropic(api_key=key)


def resolve_model(client: anthropic.Anthropic) -> dict:
    m = client.models.retrieve("claude-sonnet-5")
    created_at = getattr(m, "created_at", None)
    return {"id": m.id, "created_at": created_at.isoformat() if created_at else None}


def load_image_rgb(source_file: Path) -> np.ndarray:
    if source_file.suffix.lower() == ".pdf":
        doc = fitz.open(source_file)
        pix = doc[0].get_pixmap(dpi=150)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        return arr[:, :, :3] if pix.n >= 3 else cv2.cvtColor(arr[:, :, 0], cv2.COLOR_GRAY2RGB)
    img = cv2.imread(str(source_file), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"could not load image: {source_file}")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def estimate_cost(entries: list, images: dict[str, tuple[int, int]]) -> float:
    total = 0.0
    for entry in entries:
        w, h = images[entry.plan_id]
        img_tokens = (w * h) / 750.0
        input_tokens = img_tokens + 1200  # + system/schema/instructions
        output_tokens = 2500  # full schema JSON: walls+junctions+rooms
        cost_per_call = (input_tokens / 1e6) * SONNET_5_INPUT_PER_MTOK + (output_tokens / 1e6) * SONNET_5_OUTPUT_PER_MTOK
        total += cost_per_call * K
    return total


def build_system_prompt(schema: dict) -> str:
    # Grammar-constrained structured outputs (output_config.format) rejected
    # this schema outright ("compiled grammar is too large") once the
    # min/max-stripped, anyOf-rewritten version still tried to enforce every
    # nested array of objects — abandoned in favor of plain prompted JSON,
    # which is also truer to the paper's own framing of VLM output as
    # "candidate evidence, never truth" (validity is a measured outcome here,
    # not a grammar guarantee).
    return SYSTEM_PROMPT + "\n\nSchema (JSON Schema draft-07):\n" + json.dumps(schema, indent=None)


def _extract_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip().rstrip("`").strip()


def call_once(client: anthropic.Anthropic, model_id: str, image_bytes: bytes, media_type: str, system_prompt: str) -> dict | None:
    import base64

    response = client.messages.create(
        model=model_id,
        max_tokens=12000,
        # Adaptive thinking is on by default for Sonnet 5 and would otherwise
        # consume the whole max_tokens budget on invisible thinking blocks,
        # leaving zero tokens for the actual JSON (observed: stop_reason
        # "max_tokens", empty text). legacy/src/lib/rooms/vlmClassify.ts
        # already disables thinking for this exact model for the same
        # reason — matching that precedent rather than reinventing it.
        thinking={"type": "disabled"},
        system=system_prompt,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.b64encode(image_bytes).decode()}},
                {"type": "text", "text": "Extract this floorplan into the schema. Remember: coordinates on the aspect-preserving 0-1024 grid described in the system prompt. Respond with ONLY the JSON object."},
            ],
        }],
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    try:
        return json.loads(_extract_json(text))
    except json.JSONDecodeError:
        return None


def _valid_point(p) -> bool:
    return isinstance(p, list) and len(p) == 2 and all(isinstance(v, (int, float)) for v in p)


def _sanitize_and_rescale(walls: list[dict], rooms: list[dict], scale: float) -> tuple[list[dict], list[dict]]:
    """The model occasionally emits a schema-shaped-but-incomplete wall (seen
    in practice: missing `thickness`). Drop anything missing its required
    geometry rather than crash the whole plan on one malformed element —
    dropped-element counts are themselves an honest signal about the model's
    schema conformance, tracked via the errors written by write_prediction."""
    clean_walls = []
    for w in walls:
        if not (_valid_point(w.get("start")) and _valid_point(w.get("end"))):
            continue
        w["start"] = [w["start"][0] * scale, w["start"][1] * scale]
        w["end"] = [w["end"][0] * scale, w["end"][1] * scale]
        w["thickness"] = w.get("thickness", 10.0) * scale
        clean_openings = []
        for o in w.get("openings", []):
            if "center_offset" not in o or "width" not in o:
                continue
            o["center_offset"] = o["center_offset"] * scale
            o["width"] = o["width"] * scale
            clean_openings.append(o)
        w["openings"] = clean_openings
        clean_walls.append(w)

    for r in rooms:
        for z in r.get("zones", []):
            z["polygon"] = [[p[0] * scale, p[1] * scale] for p in z.get("polygon", []) if _valid_point(p)]
    return clean_walls, rooms


def rasterize_walls(walls: list[dict], width: int, height: int) -> np.ndarray:
    canvas = np.zeros((height, width), dtype=np.uint8)
    for w in walls:
        p0 = tuple(int(round(v)) for v in w["start"])
        p1 = tuple(int(round(v)) for v in w["end"])
        thickness = max(1, int(round(w.get("thickness", 1))))
        cv2.line(canvas, p0, p1, color=1, thickness=thickness)
    return canvas


def iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter) / float(union) if union > 0 else 1.0


def select_best(candidates: list[dict | None], width: int, height: int) -> tuple[int, list[str], dict]:
    """Returns (best_index, validator_errors_for_best, agreement_info)."""
    validity_results = []
    for c in candidates:
        if c is None:
            validity_results.append(None)
            continue
        errs = validity(c).errors
        validity_results.append(errs)

    valid_indices = [i for i, e in enumerate(validity_results) if e is not None and not e]
    pool = valid_indices if valid_indices else [i for i, c in enumerate(candidates) if c is not None]
    if not pool:
        return -1, ["all 3 candidates failed to parse"], {"pairwise_iou": []}

    masks = {i: rasterize_walls(candidates[i]["walls"], width, height) for i in pool}
    pairwise = {}
    for i in pool:
        for j in pool:
            if i < j:
                pairwise[(i, j)] = iou(masks[i], masks[j])

    def mean_agreement(i: int) -> float:
        others = [pairwise[(min(i, j), max(i, j))] for j in pool if j != i]
        return sum(others) / len(others) if others else 1.0

    best = max(pool, key=mean_agreement)
    agreement = {"pairwise_iou": {f"{i}-{j}": v for (i, j), v in pairwise.items()}, "chosen": best}
    return best, (validity_results[best] or []), agreement


def main() -> int:
    client = _client()
    model = resolve_model(client)
    print(f"[baseline-b] resolved model: {model['id']} (created_at={model['created_at']})")

    entries = [e for e in load_registry() if e.gt_status != "none"]
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    system_prompt = build_system_prompt(schema)

    images: dict[str, tuple[int, int]] = {}
    image_cache: dict[str, np.ndarray] = {}
    for entry in entries:
        rgb = load_image_rgb(Path(entry.source_file))
        image_cache[entry.plan_id] = rgb
        images[entry.plan_id] = (rgb.shape[1], rgb.shape[0])

    estimate = estimate_cost(entries, images)
    print(f"[baseline-b] pre-flight estimate: {len(entries)} plans x K={K} = {len(entries) * K} calls, "
          f"~${estimate:.2f} at Sonnet-5 standard rates")
    if estimate > COST_GATE_USD:
        print(f"[baseline-b] STOPPING: estimate ${estimate:.2f} exceeds the ${COST_GATE_USD:.0f} gate — awaiting Dan's review.")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    run_date = utc_now_iso()

    for entry in entries:
        rgb = image_cache[entry.plan_id]
        height, width = rgb.shape[:2]
        scale = max(width, height) / GRID
        ok, buf = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        image_bytes = buf.tobytes()

        candidates = []
        for _k in range(K):
            parsed = call_once(client, model["id"], image_bytes, "image/png", system_prompt)
            if parsed is not None:
                parsed["walls"], parsed["rooms"] = _sanitize_and_rescale(
                    parsed.get("walls", []), parsed.get("rooms", []), scale
                )
            candidates.append(parsed)

        best_idx, errors, agreement = select_best(candidates, width, height)
        if best_idx < 0:
            print(f"[baseline-b] {entry.plan_id}: ALL {K} CANDIDATES FAILED TO PARSE")
            continue
        chosen = candidates[best_idx]

        plan = build_envelope(
            source_path=Path(entry.source_file),
            encoding_class=entry.encoding_class,
            convention_class=entry.convention_class,
            scope_class=entry.scope_class,
            router_confidence=entry.router_confidence,
            pipeline_version=PIPELINE_VERSION,
            walls=chosen.get("walls", []),
            source_px=(width, height),
            rooms=chosen.get("rooms", []),
            diagnostics_extra={
                "model_id": model["id"],
                "model_created_at": model["created_at"],
                "run_date_utc": run_date,
                "single_nondeterministic_run": True,
                "inter_candidate_agreement": agreement,
            },
        )
        out_errors = write_prediction(plan, OUT_DIR / f"{entry.plan_id}.json")
        print(f"[baseline-b] {entry.plan_id}: chosen candidate {best_idx}, "
              f"{'valid' if not out_errors else f'{len(out_errors)} errors'} — {len(plan['walls'])} walls, "
              f"agreement={agreement['pairwise_iou']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
