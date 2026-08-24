import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat config, so no FlatCompat shim.
const asArray = (c) => (Array.isArray(c) ? c : [c]);

export default [
  {
    ignores: [
      "legacy/**", ".next/**", "node_modules/**", "public/**", "scripts/**",
      // c8's HTML reporter output (docs/TESTING.md) — generated assets, not
      // source, and regenerated on every `npm run test:coverage`.
      "coverage/**",
      // The 3D layer is protected (CLAUDE.md rule 1, docs/PROTECTED_PATHS.md):
      // it must not be modified, so a gate over it can only produce findings
      // nobody is allowed to act on. Several rules are also plain wrong here —
      // react-hooks/immutability fires on `cam.fov = x`, which is how three.js
      // is meant to be driven.
      "src/viewport3d/**", "src/schema/**",
    ],
  },
  ...asArray(coreWebVitals),
  ...asArray(typescript),
  {
    rules: {
      // Flags mount-time initialisation — `useEffect(() => setMounted(true), [])`
      // — which is the documented way to avoid an SSR/client hydration mismatch,
      // and is exactly what src/ui/consent/ConsentNotice.tsx does correctly. Kept
      // visible as a warning rather than silenced, but it must not gate CI on a
      // pattern the framework itself prescribes.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Test files legitimately reach for require() to load fixtures lazily.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
