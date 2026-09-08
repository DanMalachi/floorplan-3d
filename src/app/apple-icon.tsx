import { ImageResponse } from "next/og";

// iOS home-screen / tab icon (Dan reviews this app from his iPhone — see
// [[hebrew-i18n]]). Same mark as `icon.tsx`, just at Apple's expected 180×180:
// see that file for why the two hex values are inlined rather than imported
// from `src/brand/tokens.ts`, and why this replaces the untouched-since-first-
// commit `src/app/favicon.ico`.
//
// No corner-rounding on the canvas itself — iOS applies its own squircle mask
// to whatever's supplied, so a pre-rounded outer edge would double up oddly.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const GROUND = "#101014"; // src/brand/tokens.ts: B.ground
const COPPER = "#DF7940"; // src/brand/tokens.ts: COPPER / B.accent

export default function AppleIcon() {
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
        <div style={{ width: 80, height: 80, background: COPPER, borderRadius: 10 }} />
      </div>
    ),
    { ...size },
  );
}
