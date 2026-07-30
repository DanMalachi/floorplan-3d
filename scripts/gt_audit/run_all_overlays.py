import glob
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.gt_audit.overlay_check import run

ids = [os.path.basename(f)[:-5] for f in sorted(glob.glob("data/corpus/gt_provisional/*.json"))]
for pid in ids:
    try:
        run(pid)
    except Exception as e:
        print(pid, "FAILED", repr(e))
        traceback.print_exc()
