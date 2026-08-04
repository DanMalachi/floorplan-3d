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

// Only the properties assertRenderContract reads.
const conformingGl = () =>
  ({
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    shadowMap: { enabled: true, type: THREE.PCFShadowMap },
  }) as unknown as THREE.WebGLRenderer;

const env = process.env as { NODE_ENV: string };
const wasDev = env.NODE_ENV;
env.NODE_ENV = "development";
THREE.ColorManagement.enabled = true;

{
  let threw = false;
  try {
    assertRenderContract(conformingGl());
  } catch {
    threw = true;
  }
  check("conforming renderer state does not throw", !threw);
}

{
  // Deliberately corrupt the value r182's WebGLShadowMap.render coerces
  // during the first shadow pass — the exact case §1.3 must catch.
  const gl = conformingGl();
  gl.shadowMap.type = THREE.BasicShadowMap;
  let threw = false;
  let message = "";
  try {
    assertRenderContract(gl);
  } catch (e) {
    threw = true;
    message = (e as Error).message;
  }
  check("corrupted gl.shadowMap.type throws in development", threw);
  check("throw message names the offending key", message.includes("gl.shadowMap.type"));
}

{
  const gl = conformingGl();
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  let threw = false;
  try {
    assertRenderContract(gl);
  } catch {
    threw = true;
  }
  check("corrupted gl.toneMapping throws in development", threw);
}

env.NODE_ENV = wasDev;

console.log(failures === 0 ? "\nall contract checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
