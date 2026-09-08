import { ImageResponse } from "next/og";

// The browser-tab favicon — dynamically generated per `src/brand/Wordmark.tsx`'s
// own spec for it: "at 16px the wordmark is illegible, so the icon is one
// copper square on the dark ground and nothing else." That file exports
// `WordmarkPeriod` for exactly this reuse, but it's a DOM `<span>` styled with
// `em`-relative sizing — this route renders through `next/og`'s satori engine
// instead (same primitive already used by `v/[id]/opengraph-image.tsx`), which
// needs literal pixel values and can't resolve `var(--br-*, …)` custom
// properties. So the two hex values are inlined here rather than imported from
// `src/brand/tokens.ts` — they're the exact fallback constants that file
// defines for `ground` and `accent` (`COPPER`), not a re-derived guess.
//
// Replaces the stale `src/app/favicon.ico`, which was never touched after the
// very first commit (`git log --follow`) and predates the "done." naming
// entirely — the in-app branding sweep this file is part of.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const GROUND = "#101014"; // src/brand/tokens.ts: B.ground
const COPPER = "#DF7940"; // src/brand/tokens.ts: COPPER / B.accent

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: GROUND,
        }}
      >
        {/* 14/32 ≈ WordmarkPeriod's own 0.16em-on-Manrope-800 proportion,
            rounded up slightly so the square still reads at 16px scale. */}
        <div style={{ width: 14, height: 14, background: COPPER, borderRadius: 2 }} />
      </div>
    ),
    { ...size },
  );
}
