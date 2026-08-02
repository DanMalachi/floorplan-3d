/**
 * KTX2/BasisU encoding, as a pluggable step — material-spec.md §5.1.
 *
 * Dan's ruling (2026-08-02): install nothing to get `toktx`. No system-wide
 * installer, no third-party npm repackaging of the official binaries. §5.1's
 * own fallback clause covers this: the pipeline must not fabricate a pass, it
 * must record the deferral as data.
 *
 * So this module's job is narrow: look for a real `toktx` on PATH (in case one
 * is ever installed by the two legitimate paths recorded in §5.1 — built from
 * Khronos source, or run containerised, both giving official provenance with
 * no registry writes) and report an honest `EncoderIdentity`. If it's not
 * there, every asset ingested is `encoder: null` and WebP, on the record, not
 * silently.
 */
import { execFileSync } from "node:child_process";
import type { EncoderIdentity } from "./types";

let cached: EncoderIdentity | undefined;

/** Detect a real `toktx` on PATH. Never throws — absence is the expected,
 *  currently-permanent case, not an error. */
export function detectEncoder(): EncoderIdentity {
  if (cached !== undefined) return cached;
  try {
    const out = execFileSync("toktx", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const version = out.trim().split(/\s+/).pop() ?? out.trim();
    cached = { tool: "toktx", version, flags: [] };
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Encode (or, absent a real encoder, fall back to WebP) the three output maps
 * for one asset. Returns the identity actually used — `null` means every
 * output file is WebP and the caller must record that, not paper over it.
 *
 * KTX2 encode path is NOT IMPLEMENTED — there is no encoder to exercise it
 * against in this environment, and writing untested shell-out logic for a
 * binary nobody has run here would be exactly the kind of unverified claim
 * CLAUDE.md rule 7 forbids. When `detectEncoder()` finds a real `toktx`, this
 * is the function to fill in — per-map codec choice is already specified
 * (material-spec.md §5.1: ETC1S for albedo/ORM, UASTC+RDO+Zstd for normal).
 */
export function encoderNotImplementedForKtx2(): never {
  throw new Error(
    "toktx was detected but the KTX2 encode path is not implemented — " +
      "see encoder.ts's docstring. Ingest cannot proceed to KTX2 output yet; " +
      "run without an encoder present to get the recorded-null WebP fallback.",
  );
}
