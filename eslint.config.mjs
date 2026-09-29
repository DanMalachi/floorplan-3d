import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// eslint-config-next 16 ships native flat config, so no FlatCompat shim.
const asArray = (c) => (Array.isArray(c) ? c : [c]);

export default [
  {
    ignores: [
      "legacy/**", "docs/**", ".next/**", "node_modules/**", "public/**", "scripts/**",
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
    // Accessibility (docs/A11Y-HANDOFF.md §9). eslint-config-next already
    // loads this plugin (it's that package's dependency, hence no entry of its
    // own in package.json) with a handful of its rules; this turns on the rest
    // of its recommended set, as warnings, so a new unlabelled control or a
    // click-only div shows up in review. Rules the set itself leaves off stay
    // off. The plugin is registered by the Next config above, so only the
    // rules are named here.
    rules: Object.fromEntries(
      Object.entries(jsxA11y.flatConfigs.recommended.rules)
        .filter(([, level]) => (Array.isArray(level) ? level[0] : level) !== "off")
        .map(([rule, level]) => [rule, Array.isArray(level) ? ["warn", ...level.slice(1)] : "warn"]),
    ),
  },
  {
    // Test files legitimately reach for require() to load fixtures lazily.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
