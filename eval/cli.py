"""Eval harness CLI. `run` scores predictions against GT (Phase 0.3);
`selftest` is the harness's own correctness check: GT-vs-GT must score
perfect, a deliberately corrupted GT copy must score the expected
penalties. Both are filled in as the metric engine (eval/metrics/) lands.
"""

import argparse
import sys


def cmd_run(args: argparse.Namespace) -> int:
    raise NotImplementedError("eval.cli run lands with the metric engine (Phase 0.3)")


def cmd_selftest(args: argparse.Namespace) -> int:
    raise NotImplementedError("eval.cli selftest lands with the metric engine (Phase 0.3)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m eval.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="score predictions against ground truth")
    run_p.add_argument("--pred", required=True)
    run_p.add_argument("--gt", required=True)
    run_p.add_argument("--strata", required=True)
    run_p.add_argument("--out", required=True)
    run_p.set_defaults(func=cmd_run)

    selftest_p = sub.add_parser("selftest", help="harness correctness check (GT-vs-GT + corrupted-GT)")
    selftest_p.set_defaults(func=cmd_selftest)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
