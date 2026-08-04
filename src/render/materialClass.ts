import * as THREE from "three";

/**
 * Material classes and their shadow behavior — declared once, applied by class
 * (`docs/render-contract.md` §6).
 *
 * Before this existed the behavior lived in nine scattered per-mesh flags, and
 * the three correct glass exclusions were each expressed differently: a role
 * predicate, an omitted flag with a comment, and a forced-true traversal that
 * got it wrong by default. The behavior was right; there was just nowhere to
 * state the rule, so every new mesh re-decided from scratch.
 *
 * A new asset declares its class and inherits correct shadow behavior. It never
 * gets it by someone remembering to set flags on a mesh.
 */
export type MaterialClass =
  /** Walls, baseboards, floors, ceilings, solid leaves, frames, stairs, furniture. */
  | "opaqueArchitecture"
  /** Window glass, transparent door panes, balcony rail glass. */
  | "glass"
  /** Foliage, grilles, sheer curtains, perforated screens. */
  | "alphaCutout"
  /** Cutaway-faded walls, placement ghosts, selection bands. Behavior DEFERRED. */
  | "transient";

export interface ShadowPolicy {
  castShadow: boolean;
  receiveShadow: boolean;
}

export const SHADOW_POLICY: Record<MaterialClass, ShadowPolicy> = {
  opaqueArchitecture: { castShadow: true, receiveShadow: true },

  // Glass does not cast — a DECLARED LIMITATION, not an oversight (§6.1).
  // Three's shadow maps store depth only: no transmission, no tint, no
  // refraction. A casting window throws a solid black rectangle across the
  // floor it is supposed to be lighting. Between two wrong answers, no shadow
  // is far closer to right than an opaque one.
  //
  // Do not "fix" this by setting castShadow. Revisiting it requires a real
  // technique (transmissive shadow maps, baked or traced caustics), not a flag.
  glass: { castShadow: false, receiveShadow: true },

  // Casts via customDepthMaterial with matching alphaTest — see
  // `cutoutDepthMaterial` below. The default depth material ignores alpha
  // entirely, so a cutout leaf otherwise casts the shadow of its quad.
  alphaCutout: { castShadow: true, receiveShadow: true },

  // ---------------------------------------------------------------------
  // DEFERRED SLOT (§6.3). This is the CURRENT, KNOWN-WRONG behavior, kept
  // deliberately: a cutaway wall faded to opacity 0.13 and a furniture ghost at
  // 0.55 both still cast full-strength opaque shadows.
  //
  // The class and this policy hook are what M1b owes; the behavior fix is M2+.
  // Fixing it is a value change on the line below — not a retrofit of the class
  // system into five protected files, which is the whole reason the slot ships
  // now while it is cheap.
  // ---------------------------------------------------------------------
  transient: { castShadow: true, receiveShadow: true },
};

/**
 * Shadow flags for a class, spread onto a JSX mesh:
 *   `<mesh {...shadowProps("opaqueArchitecture")} />`
 */
export function shadowProps(cls: MaterialClass): ShadowPolicy {
  return SHADOW_POLICY[cls];
}

/**
 * Imperative form, for object trees we do not author as JSX (loaded GLTFs).
 * Applies to every Mesh in the subtree.
 */
export function applyShadowClass(root: THREE.Object3D, cls: MaterialClass): void {
  const policy = SHADOW_POLICY[cls];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = policy.castShadow;
    o.receiveShadow = policy.receiveShadow;
  });
}

/**
 * Depth material for the alphaCutout class (§6.2). Nothing uses this yet — that
 * is the point. The failure it prevents (a leaf casting a rectangular shadow)
 * appears the day the first plant enters the catalog, in code whose author is
 * thinking about furniture placement, not shadow depth materials. Defining it
 * while nothing depends on it is free; retrofitting it across a dozen shipped
 * foliage assets is not.
 *
 * `alphaTest` and `alphaMap` MUST match the visible material's or the shadow
 * will not match the silhouette.
 */
export function cutoutDepthMaterial(
  alphaMap: THREE.Texture,
  alphaTest: number,
): THREE.MeshDepthMaterial {
  return new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaMap,
    alphaTest,
  });
}

/**
 * Attach cutout shadow casting to a mesh. Use this rather than setting
 * `castShadow` by hand on cutout geometry — `transparent: true` is NOT a
 * substitute for `alphaTest` here: it produces sorting artifacts and still
 * casts a full-quad shadow.
 */
export function applyCutout(
  mesh: THREE.Mesh,
  alphaMap: THREE.Texture,
  alphaTest: number,
): void {
  const policy = SHADOW_POLICY.alphaCutout;
  mesh.castShadow = policy.castShadow;
  mesh.receiveShadow = policy.receiveShadow;
  mesh.customDepthMaterial = cutoutDepthMaterial(alphaMap, alphaTest);
}
