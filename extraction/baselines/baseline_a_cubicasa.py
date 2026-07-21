"""Baseline (a) — public CubiCasa5K-pretrained model + naive vectorization
(docs/extraction-plan.md Phase 1). Runs their published checkpoint
(model_best_val_loss_var.pkl, Dan-provided per the Zenodo/GitHub links) via
their own vendored architecture code (data/cubicasa5k/repo/floortrans/,
read-only reference, never modified), takes ONLY the wall-class channel from
their room-segmentation head, and feeds it through the SAME naive
vectorizer as baseline (c) (common.mask_to_wall_segments) — deliberately
skipping their own integer-program polygon reconstruction (get_polygons in
floortrans/post_prosessing.py), which is what the phase plan means by
"naive vectorization": a domain-pretrained segmentation net with the
cheapest possible readout, not their full pipeline.

No test-time-augmentation (their eval.py/samples.ipynb average 4 rotations;
this is a single forward pass) and no icon/opening head is used — walls
only, same scope as (c), for the same reason: no solver exists yet to turn
door/window detections into schema Opening objects.

Usage: python -m extraction.baselines.baseline_a_cubicasa
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F

from eval.registry.registry import load_registry
from extraction.baselines.common import build_envelope, write_prediction

REPO_ROOT = Path(__file__).resolve().parents[2]
CUBICASA_REPO = REPO_ROOT / "data" / "cubicasa5k" / "repo"
WEIGHTS_PATH = REPO_ROOT / "data" / "cubicasa5k" / "model_best_val_loss_var.pkl"
OUT_DIR = REPO_ROOT / "data" / "baselines_out" / "a_cubicasa"
PIPELINE_VERSION = "baseline-a-cubicasa-naive-v1"

N_CLASSES = 44
SPLIT = [21, 12, 11]  # heatmaps, room classes, icon classes
WALL_ROOM_CLASS_INDEX = 2  # room_cls[2] == "Wall" per eval.py/samples.ipynb
MAX_SIDE_PX = 768  # keep CPU inference tractable; multiple of 32 for the hourglass stack


def _load_model():
    import os

    sys.path.insert(0, str(CUBICASA_REPO))
    from floortrans.models import get_model  # noqa: PLC0415 - only importable once repo is on sys.path

    # get_model()'s own init_weights() loads a relative-path pretrained-base
    # checkpoint (floortrans/models/model_1427.pth) assuming cwd == repo
    # root. Temporarily chdir there rather than touch their code — this is
    # the read-only vendored reference, never modified.
    prev_cwd = os.getcwd()
    os.chdir(CUBICASA_REPO)
    try:
        model = get_model("hg_furukawa_original", 51)
    finally:
        os.chdir(prev_cwd)
    model.conv4_ = torch.nn.Conv2d(256, N_CLASSES, bias=True, kernel_size=1)
    model.upsample = torch.nn.ConvTranspose2d(N_CLASSES, N_CLASSES, kernel_size=4, stride=4)
    checkpoint = torch.load(WEIGHTS_PATH, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    return model


def _load_and_prep(source_file: Path) -> tuple[np.ndarray, torch.Tensor, tuple[int, int]]:
    """Returns (original_bgr, normalized_tensor[1,3,H,W], (orig_w, orig_h)).
    Resizes to a multiple of 32 on the long edge (CPU-tractable) and
    normalizes to [-1, 1] per samples.ipynb's display convention
    (`image/2 + 0.5` recovers [0,1] from the stored tensor)."""
    import fitz

    if source_file.suffix.lower() == ".pdf":
        doc = fitz.open(source_file)
        pix = doc[0].get_pixmap(dpi=150)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        bgr = cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2BGR) if pix.n >= 3 else cv2.cvtColor(arr[:, :, 0], cv2.COLOR_GRAY2BGR)
    else:
        bgr = cv2.imread(str(source_file), cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError(f"could not load image: {source_file}")

    orig_h, orig_w = bgr.shape[:2]
    scale = MAX_SIDE_PX / max(orig_h, orig_w)
    new_w = max(32, round(orig_w * scale / 32) * 32)
    new_h = max(32, round(orig_h * scale / 32) * 32)
    resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32)
    normalized = (rgb / 255.0 - 0.5) * 2.0  # -> [-1, 1]
    tensor = torch.from_numpy(normalized.transpose(2, 0, 1)).unsqueeze(0).float()
    return bgr, tensor, (orig_w, orig_h)


def wall_mask_from_prediction(model, tensor: torch.Tensor, out_size: tuple[int, int]) -> np.ndarray:
    """out_size = (width, height) of the ORIGINAL image — the mask is
    upsampled back to source resolution so wall thickness estimates land in
    real pixel units, not the resized-for-inference space."""
    with torch.no_grad():
        pred = model(tensor)
        pred = F.interpolate(pred, size=(tensor.shape[2], tensor.shape[3]), mode="bilinear", align_corners=True)
        room_logits = pred[0, SPLIT[0]:SPLIT[0] + SPLIT[1]]
        room_probs = F.softmax(room_logits, dim=0)
        room_class = torch.argmax(room_probs, dim=0).cpu().numpy()

    wall_mask = (room_class == WALL_ROOM_CLASS_INDEX).astype(np.uint8)
    width, height = out_size
    wall_mask = cv2.resize(wall_mask, (width, height), interpolation=cv2.INTER_NEAREST)
    return wall_mask


def run_one(model, source_file: Path, entry) -> dict:
    from extraction.baselines.common import mask_to_wall_segments

    bgr, tensor, (orig_w, orig_h) = _load_and_prep(source_file)
    wall_mask = wall_mask_from_prediction(model, tensor, (orig_w, orig_h))
    walls = mask_to_wall_segments(wall_mask)
    for w in walls:
        w["confidence"] = 0.5
        w["evidence"] = ["segmentation"]

    return build_envelope(
        source_path=source_file,
        encoding_class=entry.encoding_class,
        convention_class=entry.convention_class,
        scope_class=entry.scope_class,
        router_confidence=entry.router_confidence,
        pipeline_version=PIPELINE_VERSION,
        walls=walls,
        source_px=(orig_w, orig_h),
    )


def main() -> int:
    if not WEIGHTS_PATH.exists():
        print(f"[baseline-a] missing weights at {WEIGHTS_PATH}", file=sys.stderr)
        return 1

    model = _load_model()
    print("[baseline-a] CubiCasa5K model loaded (CPU, single forward pass, no TTA)")

    entries = [e for e in load_registry() if e.gt_status != "none"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    n_ok, n_invalid = 0, 0
    for entry in entries:
        source_file = Path(entry.source_file)
        try:
            plan = run_one(model, source_file, entry)
        except Exception as exc:  # noqa: BLE001 - one bad plan should not kill the run
            print(f"[baseline-a] FAILED {entry.plan_id}: {exc}", file=sys.stderr)
            continue
        errors = write_prediction(plan, OUT_DIR / f"{entry.plan_id}.json")
        if errors:
            n_invalid += 1
        else:
            n_ok += 1
        print(f"[baseline-a] {entry.plan_id}: {'valid' if not errors else f'{len(errors)} errors'} — {len(plan['walls'])} walls")
    print(f"[baseline-a] done: {n_ok} valid, {n_invalid} invalid, {len(entries)} total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
