// Headless: assertRenderContract must throw (dev) when live renderer state
// diverges from the recorded contract — proof for §1.3, not just a read.
// Run: npx tsx src/render/contract.test.ts

import * as THREE from "three";
import { assertRenderContract } from "./contract";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/**
 * Only the properties assertRenderContract reads.
 *
 * `getContext` is one of them and used to be missing. When §1.1's
 * `antialias`/`alpha` clause was added, `EXPECTED` grew two entries that call
 * `gl.getContext().getContextAttributes()` and this fake did not grow with
 * them — so every case in this file was throwing a TypeError out of the fake
 * instead of exercising the assertion. That inverted the file: the conforming
 * case "failed" and the two corruption cases "passed" for the wrong reason,
 * catching a missing method rather than a violated contract. A guard whose own
 * test cannot tell those apart is not a guard, which is the whole point of
 * §1.3 — so the attributes are modelled here and corrupted below like any
 * other clause.
 */
const conformingGl = () => {
  const attrs = { antialias: false, alpha: false };
  return {
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    shadowMap: { enabled: true, type: THREE.PCFShadowMap },
    getContext: () => ({ getContextAttributes: () => attrs }),
    // Handle for the corruption cases: the object the getter closes over, so a
    // test can change what the "driver" reports rather than replace the getter.
    _attrs: attrs,
  } as unknown as THREE.WebGLRenderer & { _attrs: { antialias: boolean; alpha: boolean } };
};

/** Runs the assertion and reports whether it threw, and with what message. */
const assertResult = (gl: THREE.WebGLRenderer) => {
  try {
    assertRenderContract(gl);
    return { threw: false, message: "" };
  } catch (e) {
    return { threw: true, message: (e as Error).message };
  }
};

const env = process.env as { NODE_ENV: string };
const wasDev = env.NODE_ENV;
env.NODE_ENV = "development";
THREE.ColorManagement.enabled = true;

{
  const { threw, message } = assertResult(conformingGl());
  check("conforming renderer state does not throw", !threw, message);
}

{
  // Deliberately corrupt the value r182's WebGLShadowMap.render coerces
  // during the first shadow pass — the exact case §1.3 must catch.
  const gl = conformingGl();
  gl.shadowMap.type = THREE.BasicShadowMap;
  const { threw, message } = assertResult(gl);
  check("corrupted gl.shadowMap.type throws in development", threw);
  check("throw message names the offending key", message.includes("gl.shadowMap.type"));
}

{
  const gl = conformingGl();
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  check("corrupted gl.toneMapping throws in development", assertResult(gl).threw);
}

{
  // §1.1's own origin story: `<Canvas gl={{...}}>` spreads over R3F's defaults,
  // which include `antialias: true`, so the app allocated and resolved a 4x MSAA
  // backbuffer every frame to anti-alias a single fullscreen triangle. That is
  // the case this clause exists to catch, and it was the one case the file did
  // not cover.
  const gl = conformingGl();
  gl._attrs.antialias = true;
  const { threw, message } = assertResult(gl);
  check("a context that came back antialiased throws", threw);
  check("throw message names gl.context.antialias", message.includes("gl.context.antialias"));
}

{
  const gl = conformingGl();
  gl._attrs.alpha = true;
  check("a context that came back with alpha throws", assertResult(gl).threw);
}

{
  // The read is deliberately of the LIVE context, not of what was requested —
  // a driver is free to ignore either flag. Modelled here as attributes the
  // getter reports absent, which is what a context that answered nothing looks
  // like; it must not silently satisfy `antialias: false`.
  const gl = conformingGl() as unknown as { getContext: () => unknown };
  gl.getContext = () => ({ getContextAttributes: () => null });
  check(
    "a context reporting no attributes throws rather than passing",
    assertResult(gl as unknown as THREE.WebGLRenderer).threw,
  );
}

env.NODE_ENV = wasDev;

console.log(failures === 0 ? "\nall contract checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
