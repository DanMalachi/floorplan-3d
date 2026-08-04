/**
 * KTX2/BasisU encoding, as a pluggable step — material-spec.md §5.1.
 *
 * Dan's ruling (2026-08-02, M3b): install nothing to get `toktx` — no
 * system-wide installer, no third-party npm repackaging of the official
 * binaries. §5.1's own fallback clause covers this: the pipeline must not
 * fabricate a pass, it must record the deferral as data.
 *
 * Dan's ruling (2026-08-02, M3d/D2): build from Khronos source, over running
 * containerised — this machine has no Docker/WSL2 and enabling either needs
 * admin + likely a reboot, while a compiler toolchain could be acquired
 * user-scoped with no admin: `pip install cmake` (already had Python) plus a
 * portable, no-installer MinGW-w64 archive (winlibs.com — GCC/binutils
 * repackaged for Windows with no installer, not a repackaging of toktx
 * itself, so it doesn't reopen the M3b decline). Built from
 * github.com/KhronosGroup/KTX-Software.git, commit 5b7e9aa0 at clone time,
 * with `-DKTX_FEATURE_TOOLS=ON` and everything else pared to the CLI (no
 * docs/JNI/Python bindings/CTS/JS — none of it is needed to run the encoder).
 *
 * Found while building, not assumed: upstream dropped the standalone
 * `toktx` binary this spec was written against. Every CLI tool
 * (`toktx`/`ktx2ktx2`/`ktxsc`/`ktxinfo`/...) is now unified into one `ktx`
 * executable with subcommands — `ktx create` is today's `toktx`, `ktx
 * deflate` is `ktxsc`, etc. `detectEncoder()` below looks for `ktx`, not
 * `toktx`, and reports the real binary invoked rather than silently keeping
 * the old name.
 *
 * This module's job is still narrow: look for a real `ktx` on PATH and
 * report an honest `EncoderIdentity`. If it's not there, every asset
 * ingested is `encoder: null` and WebP, on the record, not silently.
 */
import { execFileSync } from "node:child_process";
import type { EncoderIdentity, EncoderProfile } from "./types";

const KTX_SOURCE_REPO = "https://github.com/KhronosGroup/KTX-Software.git";

let cached: EncoderIdentity | undefined;

/**
 * material-spec.md §5.1's codec table, as literal `ktx create` arguments —
 * verified against this build's own `ktx create --help` / `ktx encode
 * --help`, not guessed. Quality/level numbers are reasonable defaults inside
 * the tool's documented ranges, not yet validated against a real render
 * comparison — that validation is D3's job (re-running §7's
 * render-comparison on encoded output, not the pre-encode textures). Treat
 * these as the starting point for D3, not a tuned final answer.
 *
 * `--format`/`--assign-tf` follow render-contract.md §1.2 exactly: albedo is
 * the only sRGB-tagged map, ORM and normal are both data (UNORM/linear,
 * untagged). `--assign-tf` is required, not decorative: found by actually
 * running this — without it, `ktx create` guesses `srgb` for any 8-bit PNG
 * input regardless of `--format`, then silently applies "a visual lossy
 * color conversion from KHR_DF_TRANSFER_SRGB to KHR_DF_TRANSFER_LINEAR" (its
 * own warning text) to reconcile the guess with a UNORM format — exactly the
 * gamma-curve-on-data-channel corruption §1.2 forbids by name. Asserting the
 * transfer function explicitly (`srgb` for albedo, `linear` for ORM/normal)
 * removes the guess instead of trusting it, the same "assert every value
 * explicitly" reasoning render-contract.md §1.1 already applies elsewhere.
 * Verified: encoding a synthetic image with the flags below produces no
 * transfer-function warning; without `--assign-tf` the warning appears.
 */
const ALBEDO_PROFILE: EncoderProfile = {
  codec: "basis-lz",
  flags: [
    "--format", "R8G8B8_SRGB",
    "--assign-tf", "srgb",
    "--encode", "basis-lz",
    "--clevel", "2",
    "--qlevel", "200",
    "--generate-mipmap",
  ],
};

// Same codec/quality as albedo, but data (UNORM/linear) rather than sRGB —
// the ORM pack is a control-signal image, not colour (material-spec.md §6 /
// render-contract.md §1.2).
const ORM_PROFILE: EncoderProfile = {
  codec: "basis-lz",
  flags: ["--format", "R8G8B8_UNORM", "--assign-tf", "linear", ...ALBEDO_PROFILE.flags.slice(4)],
};

const NORMAL_PROFILE: EncoderProfile = {
  codec: "uastc",
  flags: [
    "--format", "R8G8B8_UNORM",
    "--assign-tf", "linear",
    "--encode", "uastc",
    "--uastc-quality", "2",
    "--uastc-rdo",
    "--uastc-rdo-l", "0.5", // §5.1: "for normal maps a good range is [.25,.75]" — mid-range default
    "--zstd", "19",
    "--generate-mipmap",
  ],
};

// `--normal-mode` was here through the first two D3/D4 sessions and is
// deliberately NOT in the flags above. Found by actually decoding a shipped
// normal.ktx2 and looking at it (prompted by a real "black stripes on the
// floor" bug report): every one of the 18 assets' normal maps had been
// encoding to a uniform olive/yellow-green image, not the source's correct
// blue-dominant tangent-space data. `ktx create --help`'s own text explains
// why — `--normal-mode` "converts to a two component X+Y normal map stored
// as (RGB=X, A=Y)" before encoding, a packing this codebase's runtime code
// never decodes (`MeshStandardMaterial.normalMap` expects a standard
// tangent-space RGB map, nothing here reconstructs Z from a packed X+Y).
// Reproduced with both the 3-channel format above and R8G8B8A8_UNORM (which
// `--normal-mode`'s own packing scheme actually needs an alpha channel
// for) — both come out wrong; only dropping the flag entirely, encoding the
// source RGB normal map as plain UASTC color data, gives a correct decode.
// Left as a comment, not silently removed, because it is exactly the kind
// of flag that looks like the obviously-correct choice for "encoding a
// normal map" and will look attractive to add back without this context.

function parseKtxVersion(raw: string): { version: string; commit: string | null } {
  // Observed: "ktx version: v5.0.0-rc1-36-ge2f94806-dirty". Strip the label
  // if present so `version` is just the git-describe string either way.
  const version = raw.trim().replace(/^ktx version:\s*/i, "");
  const m = version.match(/g([0-9a-f]{7,40})/i);
  return { version, commit: m ? m[1] : null };
}

/** Detect a real `ktx` on PATH (upstream's unified CLI — see this file's
 *  docstring for why it isn't `toktx`). Never throws — absence is the
 *  expected case pre-D2, not an error. */
export function detectEncoder(): EncoderIdentity {
  if (cached !== undefined) return cached;
  try {
    const out = execFileSync("ktx", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const { version, commit } = parseKtxVersion(out);
    const provenance = commit
      ? `${KTX_SOURCE_REPO} @ ${commit}`
      : `${KTX_SOURCE_REPO} (version string did not embed a git commit — provenance unverifiable from --version alone)`;
    cached = {
      tool: "ktx",
      version,
      provenance,
      profiles: { albedo: ALBEDO_PROFILE, orm: ORM_PROFILE, normal: NORMAL_PROFILE },
    };
  } catch {
    cached = null;
  }
  return cached;
}

/** Test-only: bypass the module-level cache so tests can compare a real
 *  detection run against a mocked-absent one without process restart. */
export function resetEncoderCache(): void {
  cached = undefined;
}

/**
 * Encode the three output maps for one asset through `ktx create`, using the
 * codec/flags recorded on `EncoderIdentity.profiles`.
 *
 * NOT IMPLEMENTED YET — this is D3's step ("Encode and re-verify"), not D2's
 * ("Encoder acquisition"). D2's exit bar is the encoder existing and
 * reporting a real identity, proven above and by `encoder.smoke.mjs`; wiring
 * this into `pack.ts`/`run.ts` and running it across all 20 assets, then
 * re-running §7's render-comparison against the *encoded* artifacts, is the
 * next milestone step, not this one — writing that logic now, untested
 * against the real asset batch, would be exactly the unverified claim
 * CLAUDE.md rule 7 forbids.
 */
export function encodeNotImplementedForBatch(): never {
  throw new Error(
    "ktx was detected and identity is populated, but the batch encode step (D3) is not implemented yet — " +
      "see encoder.ts's docstring.",
  );
}
