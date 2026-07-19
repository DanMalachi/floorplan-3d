"""One-time fetch of the ResPlan dataset (github.com/m-agour/ResPlan, MIT license).

ResPlan: A Large-Scale Vector-Graph Dataset of 17,000 Residential Floor Plans.
Recorded as trainable (commercial) in docs/DATA_RIGHTS.md.

Not run automatically in CI — run manually once per machine:
    .venv/Scripts/python.exe data/resplan/fetch.py

Downloads ResPlan.zip (~100 MB) from the repo and unzips it into
data/resplan/raw/ (gitignored). Idempotent: skips work already done.
"""
from __future__ import annotations

import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO_ZIP_URL = "https://github.com/m-agour/ResPlan/raw/main/ResPlan.zip"
HERE = Path(__file__).parent
ZIP_PATH = HERE / "ResPlan.zip"
RAW_DIR = HERE / "raw"


def download(url: str, dest: Path) -> None:
    print(f"Downloading {url} -> {dest}")
    with urllib.request.urlopen(url) as resp, open(dest, "wb") as f:
        total = int(resp.headers.get("Content-Length", 0))
        written = 0
        chunk = 1 << 20
        while True:
            buf = resp.read(chunk)
            if not buf:
                break
            f.write(buf)
            written += len(buf)
            if total:
                pct = 100 * written / total
                print(f"\r  {written / 1e6:.1f} / {total / 1e6:.1f} MB ({pct:.0f}%)", end="")
        print()


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    pkl_candidates = list(RAW_DIR.glob("*.pkl"))
    if pkl_candidates:
        print(f"Already fetched: {pkl_candidates[0]}")
        return

    if not ZIP_PATH.exists():
        download(REPO_ZIP_URL, ZIP_PATH)
    else:
        print(f"Zip already present: {ZIP_PATH}")

    print(f"Extracting {ZIP_PATH} -> {RAW_DIR}")
    with zipfile.ZipFile(ZIP_PATH) as zf:
        zf.extractall(RAW_DIR)

    pkl_candidates = list(RAW_DIR.rglob("*.pkl"))
    if not pkl_candidates:
        print("ERROR: no .pkl found after extraction — inspect data/resplan/raw/ manually.", file=sys.stderr)
        sys.exit(1)

    print(f"Done. Found: {pkl_candidates}")


if __name__ == "__main__":
    main()
