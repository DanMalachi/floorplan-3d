"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { PD, pdGlass } from "./planDock/tokens";
import { B } from "@/brand/tokens";
import { useHover } from "./planDock/useHover";
import { hardNavHref } from "@/i18n/navigation";
import { Brand } from "@/brand/Brand";

// -----------------------------------------------------------------------------
// "The editor wants a bigger screen."
//
// The editor's chrome collides badly on a phone — the project bar, the mode
// switcher and the dock all overlap, in BOTH locales, and have done since before
// any of the i18n work. Dan's call (2026-09-05) is that fixing mobile layout is
// out of scope for now, so the honest thing is to say so on the way in rather
// than let someone find out by trying to draw a wall through three overlapping
// panels.
//
// ── Why it recommends rather than blocks ────────────────────────────────────
// "We'd recommend you use a computer" was the brief, and recommend is the right
// verb for this product: signing in is "an OFFER, never a gate"
// (src/landing/AccountControl.tsx), there is no wizard and nothing that
// announces itself (/about, "Quiet by design"). So this has a way through, and
// taking it is remembered — nobody should have to dismiss the same notice twice.
// It is still a full-screen stop rather than a banner, because a banner over an
// editor that genuinely does not work is worse than no warning at all.
//
// ── What it must NOT say ────────────────────────────────────────────────────
// The FAQ already promises that walking through a finished room works on a
// phone, and that promise is kept: this covers `/design` only. A shared room
// (`/v/<id>`) never mounts this and opens normally, which is why the notice says
// what is not ready — DRAWING — instead of claiming the product doesn't work
// here. Copy that contradicts the FAQ two taps away is worse than no copy.
// -----------------------------------------------------------------------------

const STORAGE_KEY = "editor:smallScreenAcknowledged";

/**
 * Below this, in CSS px, the editor is not usable.
 *
 * Measured on the SHORT side of the viewport, not the width, because width
 * alone gets landscape wrong: a phone turned sideways is ~930×430, which passes
 * any width test and has nowhere to put the dock. The short side is ~390 on a
 * phone in either orientation and ~744 on the smallest tablet, so one number
 * separates them — and 700 leaves iPad portrait (768) comfortably on the
 * working side, which matches what the FAQ already tells people ("better on a
 * laptop or tablet").
 *
 * A desktop window dragged narrower than this gets the notice too. That is
 * correct rather than a false positive: the editor is just as broken at that
 * size, and the way through is one tap.
 */
const MIN_SHORT_SIDE = 700;

const tooSmall = () => Math.min(window.innerWidth, window.innerHeight) < MIN_SHORT_SIDE;

/**
 * Set when they choose to carry on, and NOT the same thing as the stored flag.
 *
 * If `localStorage` throws — private browsing, site data blocked — persisting
 * the choice is impossible, and without this the button would notify, the
 * snapshot would re-read the storage that never took the write, and the notice
 * would refuse to go away. An escape hatch that cannot be taken is worse than
 * no escape hatch. So the session flag is what dismisses it; storage only
 * decides whether the answer survives a reload.
 */
let acknowledgedThisSession = false;

function acknowledged(): boolean {
  if (acknowledgedThisSession) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// ── Whether to show it, as external state rather than as React state ─────────
//
// Both inputs live outside React — the viewport and localStorage — and both have
// a different answer on the server than in the browser. That is precisely what
// `useSyncExternalStore` is for, and it is the pattern this repo already settled
// on for the same problem (see the long note on `usePerfEnabled`): reading
// either during render would produce different markup on each side, which React
// 19 treats as a hydration ERROR, while the useEffect-then-setState version
// avoids that only by scheduling a second render pass to do it.
//
// The server snapshot is `false`, so the notice is absent from the initial HTML
// and appears on hydration. That is the honest answer: the server does not know
// how big the screen is, and guessing would flash the wrong thing at half of
// everyone.

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Rotating a phone changes the answer, and so does dragging a desktop window
  // narrower. Listening costs one handler and is the difference between the
  // notice being right and being right until the next navigation.
  window.addEventListener("resize", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("resize", onChange);
  };
}

const shouldShow = () => tooSmall() && !acknowledged();
const shouldShowOnServer = () => false;

export function SmallScreenNotice() {
  const show = useSyncExternalStore(subscribe, shouldShow, shouldShowOnServer);
  const t = useTranslations("smallScreen");

  if (!show) return null;

  const proceed = () => {
    acknowledgedThisSession = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* best-effort persistence only — it will be shown again on the next load */
    }
    notify();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="small-screen-title"
      style={{
        position: "fixed",
        inset: 0,
        // Above everything the editor draws. The highest z-index in the app's
        // own chrome is 70; this is the one thing that has to sit over all of it.
        zIndex: 200,
        background: PD.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "32px 26px",
        textAlign: "center",
        fontFamily: PD.fontUi,
      }}
    >
      <PhoneToLaptop />

      <h1
        id="small-screen-title"
        style={{
          margin: 0,
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: "-0.015em",
          color: PD.textPrimary,
          maxWidth: 400,
        }}
      >
        {t("title")}
      </h1>

      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: PD.textSecondary, maxWidth: 380 }}>
        {/* The product name comes through as a rich-text tag, not as text in
            the string. It is Latin in the Hebrew build by decision, and a bare
            "done." inside an RTL sentence has its full stop resolved to the
            paragraph direction — measured here before this line existed, the
            period painted 4px to the LEFT of the word. `<Brand />` is the
            isolate; a flat catalogue string cannot carry one. */}
        {t.rich("body", { brand: () => <Brand /> })}
      </p>

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: PD.textTertiary, maxWidth: 380 }}>
        {t("sharedProjectsFine")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 6 }}>
        {/* A plain <a>, not a Link: this is the way OUT of a client app whose
            autosave is debounced, and a full document load is what flushes it —
            the same reason ProjectsOverlay's "back to site" is an anchor. */}
        <BackLink label={t("backToSite")} />
        <ContinueButton label={t("continueAnyway")} onClick={proceed} />
      </div>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  const [hovered, bind] = useHover();
  return (
    <a
      {...bind}
      href={hardNavHref("/")}
      style={{
        ...pdGlass({ borderRadius: 999, padding: "11px 22px" }),
        fontSize: 14,
        fontWeight: 700,
        textDecoration: "none",
        color: hovered ? PD.textPrimary : PD.textSecondary,
        transition: "color 140ms ease",
      }}
    >
      {label}
    </a>
  );
}

/** The way through. Deliberately the quieter of the two controls — it is
 *  available, not encouraged. */
function ContinueButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [hovered, bind] = useHover();
  return (
    <button
      {...bind}
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: "4px 8px",
        cursor: "pointer",
        fontFamily: PD.fontUi,
        fontSize: 13,
        color: hovered ? PD.textSecondary : PD.textTertiary,
        textDecoration: "underline",
        textUnderlineOffset: 3,
        transition: "color 140ms ease",
      }}
    >
      {label}
    </button>
  );
}

/** A phone with an arrow to a laptop. Drawn rather than an emoji — the wave-1
 *  sweep took every emoji out of this app's UI and a gate keeps them out. */
function PhoneToLaptop() {
  return (
    <svg
      width="104"
      height="44"
      viewBox="0 0 104 44"
      fill="none"
      aria-hidden="true"
      // The drawing reads left to right in both locales: it is a diagram of
      // "from this, to that", and mirroring it would say the opposite.
      style={{ direction: "ltr", opacity: 0.9 }}
    >
      <rect x="1" y="7" width="20" height="32" rx="3.5" stroke={PD.textTertiary} strokeWidth="1.4" />
      <path d="M8.5 34.5h5" stroke={PD.textTertiary} strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M31 23h16m0 0-4.5-4.5M47 23l-4.5 4.5"
        // The site's copper, not the editor's blue. `src/brand/tokens.ts` reserves
        // copper for the wordmark's period and CTA fills and says "not icons" —
        // Dan's call to spend it here (2026-09-05), on the one arrow that carries
        // the whole message. It resolves through `var(--br-accent, #DF7940)`, and
        // the fallback IS the copper, so it works in the editor where the brand
        // stylesheet is never mounted.
        stroke={B.accent}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="60" y="6" width="38" height="26" rx="2.5" stroke={PD.textPrimary} strokeWidth="1.4" />
      <path d="M55 36.5h48" stroke={PD.textPrimary} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M60 32h38l4 4.5H56z" stroke={PD.textPrimary} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
