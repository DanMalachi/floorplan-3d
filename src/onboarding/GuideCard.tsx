"use client";

// The card every step guide is drawn with: a glass card beside the control it
// explains, a pointer tip aimed at that control, and a pulsing ring around it.
//
// Non-blocking by design (the artifact's "never in the way" rule): nothing is
// dimmed, the card never takes focus, and clicks on the plan or the 3D view
// keep working. Esc closes it only while focus is inside the card, because Esc
// on the plan already means "stop this line".
//
// Anchors are plain `data-guide="<name>"` attributes on the real controls, so
// the card follows the control through layout changes, window resizes and the
// trace rail's own scrolling, in both reading directions.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import { useLocale } from "next-intl";
import { dirOf } from "@/i18n/routing";
import { PD, pdGlass, pdHoverTransition } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { GUIDE_CSS } from "./demos";
import { placeCard, type Box, type Placement } from "./place";

/** Above the dock, the inspector (60) and the camera offer (61); below the
 *  tooltip (70), so a hovered control's tooltip still reads over a card. */
const CARD_Z = 65;

/** The card is text-heavy and sits over a busy plan, so it takes a much
 *  heavier fill than the dock's see-through glass. `color-mix` keeps it on
 *  the theme's own solid surface, dark or light. */
export const CARD_FILL = `color-mix(in oklch, ${PD.surfaceSolid} 93%, transparent)`;

export function useIsRtl(): boolean {
  return dirOf(useLocale()) === "rtl";
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height));

/** The live box of `[data-guide=name]`, or null while it isn't on screen.
 *  Polled per frame while the card is up: one `getBoundingClientRect` a frame
 *  is nothing, and it catches every kind of movement (rail scroll, a step
 *  opening above, a resize) without an observer per cause. */
function useAnchorBox(name: string | null): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!name) return;
    let raf = 0;
    let last: Box | null = null;
    let scrolled = false;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-guide="${name}"]`);
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
      if (el && next && !scrolled) {
        // Once: bring it into the rail's view if it's scrolled out.
        scrolled = true;
        el.scrollIntoView({ block: "nearest" });
      }
      if (!sameBox(last, next)) {
        last = next;
        setBox(next);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [name]);
  return box;
}

export interface GuideCardProps {
  /** `data-guide` name of the control this card explains. */
  anchor: string;
  /** `data-guide` name of a panel the card must sit clear of: the card goes
   *  beside the panel, level with the anchor, instead of beside the anchor
   *  itself and over the panel's other controls. */
  clearOf?: string;
  kicker: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  /** Buttons row, usually a `<GuideFoot>`. */
  foot: React.ReactNode;
  width?: number;
  /** Ring corner radius: a number, or "pill" for chip rows. */
  ringRadius?: number | "pill";
  /** Esc from inside the card. */
  onClose: () => void;
}

export function GuideCard({ anchor, clearOf, kicker, title, children, foot, width = 460, ringRadius = 12, onClose }: GuideCardProps) {
  const rtl = useIsRtl();
  const box = useAnchorBox(anchor);
  const panel = useAnchorBox(clearOf ?? null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const view = { width: window.innerWidth, height: window.innerHeight };
      const size = { width: card.offsetWidth, height: card.offsetHeight };
      // No anchor on screen (a collapsed step, say): park the card bottom
      // centre rather than leave an invisible guide holding the queue.
      const target = box
        ? panel
          ? { left: panel.left, width: panel.width, top: box.top, height: box.height }
          : box
        : { left: view.width / 2, top: view.height - 24, width: 0, height: 0 };
      setPlace(placeCard(target, size, view, rtl));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [box, panel, rtl]);

  const pad = 5;
  return (
    <>
      <style>{GUIDE_CSS}</style>
      {box && (
        <div
          aria-hidden
          className="dg-ring"
          style={{
            position: "fixed",
            left: box.left - pad,
            top: box.top - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
            borderRadius: ringRadius === "pill" ? 999 : ringRadius,
            border: `2px solid ${PD.accentText}`,
            boxShadow: "0 0 0 5px oklch(0.6 0.15 258 / .22), 0 0 26px oklch(0.6 0.15 258 / .45)",
            pointerEvents: "none",
            zIndex: CARD_Z,
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-live="polite"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        style={{
          ...pdGlass({ background: CARD_FILL }),
          position: "fixed",
          left: place?.left ?? 0,
          top: place?.top ?? 0,
          // Measured once invisibly, then shown where it belongs: no jump.
          visibility: place ? "visible" : "hidden",
          width: `min(${width}px, calc(100vw - 24px))`,
          zIndex: CARD_Z,
          outline: "none",
        }}
      >
        {/* The tip lives outside the scrolling box, or the scroll would clip it. */}
        {place && box && <Tip place={place} rtl={rtl} />}
        <div
          style={{
            maxHeight: "calc(100vh - 24px)",
            overflowY: "auto",
            padding: 20,
            display: "grid",
            gap: 14,
          }}
        >
          <span style={kickerStyle(rtl)}>{kicker}</span>
          <h2 id={titleId} style={{ margin: 0, fontSize: 22, lineHeight: 1.2, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {title}
          </h2>
          {children}
          {foot}
        </div>
      </div>
    </>
  );
}

/** The pointer: a rotated square half out of the card's facing edge. */
function Tip({ place, rtl }: { place: Placement; rtl: boolean }) {
  const s = 16;
  const base: React.CSSProperties = {
    position: "absolute",
    width: s,
    height: s,
    background: CARD_FILL,
    border: PD.glassBorder,
    transform: "rotate(45deg)",
    // Painted under the card's content, over its fill.
    zIndex: -1,
  };
  // `left`/`right` here are PHYSICAL: the placement already did the RTL
  // mirroring, so the tip just faces wherever the anchor ended up.
  const onLeft = place.side === (rtl ? "start" : "end");
  if (place.side === "end" || place.side === "start") {
    return <span aria-hidden style={{ ...base, top: place.tip - s / 2, [onLeft ? "left" : "right"]: -s / 2 }} />;
  }
  return <span aria-hidden style={{ ...base, left: place.tip - s / 2, [place.side === "below" ? "top" : "bottom"]: -s / 2 }} />;
}

const kickerStyle = (rtl: boolean): React.CSSProperties =>
  rtl
    ? { fontFamily: PD.fontUi, fontSize: 12.5, fontWeight: 600, color: PD.accentText }
    : {
        fontFamily: PD.fontMono,
        fontSize: 11.5,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontWeight: 500,
        color: PD.accentText,
      };

/** Body copy. */
export function GuideText({ children, note }: { children: React.ReactNode; note?: boolean }) {
  return (
    <p
      style={
        note
          ? {
              margin: 0,
              fontSize: 13.5,
              lineHeight: 1.5,
              color: PD.textTertiary,
              borderTop: `1px solid ${PD.hairline}`,
              paddingTop: 12,
            }
          : { margin: 0, fontSize: 15.5, lineHeight: 1.55, color: PD.textSecondary }
      }
    >
      {children}
    </p>
  );
}

/** Rich-text tags shared by every guide string: `<b>` for emphasis and
 *  `<chip>` for the name of a control, drawn like the chip itself. */
export const richTags = {
  b: (c: React.ReactNode) => <b style={{ color: PD.textPrimary, fontWeight: 700 }}>{c}</b>,
  chip: (c: React.ReactNode) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12.5,
        fontWeight: 700,
        padding: "1px 9px",
        borderRadius: 999,
        background: PD.accentTint,
        color: PD.accentText,
        whiteSpace: "nowrap",
        verticalAlign: 1,
      }}
    >
      {c}
    </span>
  ),
};

/** Numbered steps, for guides that teach an order. */
export function GuideSteps({ items }: { items: Array<{ title?: React.ReactNode; body: React.ReactNode }> }) {
  return (
    <ol style={{ display: "grid", gap: 12, margin: 0, padding: 0, listStyle: "none" }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12, alignItems: "start" }}>
          <span
            aria-hidden
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: PD.accentTint,
              color: PD.accentText,
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 13,
              marginTop: 1,
            }}
          >
            {i + 1}
          </span>
          <span style={{ display: "grid", gap: 2 }}>
            {it.title && <b style={{ fontSize: 15.5, color: PD.textPrimary }}>{it.title}</b>}
            <span style={{ fontSize: 14.5, lineHeight: 1.5, color: PD.textSecondary }}>{it.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Two side-by-side choices, each with its own picture. */
export function GuideOptions({ items }: { items: Array<{ demo: React.ReactNode; title: React.ReactNode; body: React.ReactNode }> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            borderRadius: PD.radiusM,
            background: PD.surfaceMuted,
            border: `1px solid ${PD.hairline}`,
            padding: 12,
            display: "grid",
            gap: 6,
            alignContent: "start",
          }}
        >
          {it.demo}
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: PD.textPrimary }}>{it.title}</h3>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: PD.textSecondary }}>{it.body}</p>
        </div>
      ))}
    </div>
  );
}

/** A single picture, full card width. */
export function GuideDemo({ children }: { children: React.ReactNode }) {
  return <div style={{ borderRadius: 12, overflow: "hidden" }}>{children}</div>;
}

/** The buttons row, with page dots on the inline-start side when a guide has
 *  more than one page. */
export function GuideFoot({ page, children }: { page?: { index: number; count: number }; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
      {page && (
        <div aria-hidden style={{ marginInlineEnd: "auto", display: "flex", gap: 6 }}>
          {Array.from({ length: page.count }, (_, i) => (
            <span
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: i === page.index ? PD.accentText : PD.hairline,
                outline: i === page.index ? "none" : `1px solid ${PD.textTertiary}`,
                outlineOffset: -1,
                opacity: i === page.index ? 1 : 0.5,
              }}
            />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

export type GuideButtonKind = "primary" | "quiet" | "ghost";

export function GuideButton({
  kind = "primary",
  big,
  children,
  ...rest
}: { kind?: GuideButtonKind; big?: boolean; children: React.ReactNode; ref?: React.Ref<HTMLButtonElement> } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "style"
>) {
  const [hov, bind] = useHover();
  const look: Record<GuideButtonKind, React.CSSProperties> = {
    // White on the accent is the pair tuned for contrast in both themes.
    primary: { background: PD.accent, color: "white", filter: hov ? "brightness(1.12)" : undefined },
    quiet: { background: hov ? PD.surfaceMutedHover : PD.surfaceMuted, color: PD.textPrimary },
    ghost: { background: hov ? PD.surfaceMuted : "transparent", color: hov ? PD.textPrimary : PD.textSecondary },
  };
  return (
    <button
      type="button"
      {...rest}
      {...bind}
      style={{
        fontFamily: PD.fontUi,
        fontWeight: 700,
        fontSize: big ? 15 : 14,
        borderRadius: 999,
        padding: big ? "12px 22px" : "9px 18px",
        cursor: "pointer",
        border: "none",
        whiteSpace: "nowrap",
        textShadow: "none",
        transition: `${pdHoverTransition(hov)}, filter 110ms ease-out`,
        ...look[kind],
      }}
    >
      {children}
    </button>
  );
}
