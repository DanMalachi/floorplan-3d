"use client";

// Round-4 navigator picture in the app: a navArt kit scene (kit.ts), framed to
// the panel's scene area and wired up as hotspots. The art arrives as one SVG
// markup string, so interaction is by delegation on the <svg> and by stamping
// attributes on its `.hot` groups after mount, not by React children.
//
// Dan's rules, and where each lives here:
// - glow ONLY on hover (and keyboard focus, which is hover for a keyboard
//   user) — `.is-lit`; nothing stays lit. The SELECTED object is named in the
//   readout instead, with a "Show all" button that clears it.
// - no colour: the kit is one ink at varying strength; the glow is ink too.
// - light + dark: the scene is rebuilt for the theme on <html data-pd-theme>.
// - mirrored in Hebrew: the corner is drawn on the left; English mirrors it to
//   the far (right) side, Hebrew, whose panel sits on the right, does not.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { frameScene, type NavTheme, type SceneFn } from "./kit";
import { PD } from "../tokens";

export interface NavArtHotspot {
  id: string;
  /** Key under `editor.rooms`. */
  labelKey: string;
}

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pd-theme"] });
  return () => mo.disconnect();
}
const readTheme = (): NavTheme => (document.documentElement.dataset.pdTheme === "light" ? "light" : "dark");

/** WCAG 2.5.8: every object's hit area is at least 24×24 CSS px. */
const MIN_HIT_PX = 24;

const CSS = `
.nav-art path{vector-effect:non-scaling-stroke}
.nav-art .deco{pointer-events:none}
.nav-art .hot{cursor:pointer;outline:none}
.nav-art .hot.is-lit{filter:var(--glow)}
`;

export function NavArtScene({
  scene,
  sceneId,
  roomLabel,
  hotspots,
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  scene: SceneFn;
  /** Unique per scene: namespaces the glow filter id. */
  sceneId: string;
  roomLabel: string;
  hotspots: NavArtHotspot[];
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  const t = useTranslations("editor.rooms");
  const td = useTranslations("editor.dock");
  const rtl = useLocale() === "he";
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as NavTheme);

  // The art is framed to the scene area's exact box, so measure it.
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      if (w > 0 && h > 0) setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const framed = useMemo(
    () => (size ? frameScene(scene, theme, { w: size.w, h: size.h, mirror: !rtl, id: `${sceneId}-${theme}-${rtl ? "r" : "l"}` }) : null),
    [scene, sceneId, theme, rtl, size],
  );
  const markup = framed?.markup;

  const svgRef = useRef<SVGSVGElement>(null);
  const [lit, setLit] = useState<string | null>(null);

  const labelFor = (id: string) => (id === "floor" ? t("floor") : t(hotspots.find((h) => h.id === id)?.labelKey ?? id));
  // Latest handlers for the delegated listeners.
  const handlers = useRef({ onHotspotClick, onFloorClick });
  useEffect(() => {
    handlers.current = { onHotspotClick, onFloorClick };
  });

  // Stamp roles on the groups and grow small targets, once per markup.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const byId = new Map<string, SVGGElement[]>();
    for (const g of svg.querySelectorAll<SVGGElement>("g.hot")) {
      const id = g.dataset.id!;
      const pieces = byId.get(id);
      if (pieces) {
        // Same object, drawn in several pieces for paint order: pointer only.
        g.setAttribute("aria-hidden", "true");
        pieces.push(g);
        continue;
      }
      byId.set(id, [g]);
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
    }
    // Grow an object's hit area to MIN_HIT_PX where its drawing is smaller.
    // The pad is a transparent rect in its LAST piece, so later-drawn
    // neighbours still win wherever they are actually painted.
    const ctm = svg.getScreenCTM();
    const min = MIN_HIT_PX / (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
    for (const [id, gs] of byId) {
      if (id === "floor") continue;
      const boxes = gs.map((g) => g.getBBox());
      const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
      const x1 = Math.max(...boxes.map((b) => b.x + b.width)), y1 = Math.max(...boxes.map((b) => b.y + b.height));
      if (x1 - x0 >= min && y1 - y0 >= min) continue;
      const w = Math.max(min, x1 - x0), h = Math.max(min, y1 - y0);
      const pad = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      pad.setAttribute("x", String((x0 + x1 - w) / 2));
      pad.setAttribute("y", String((y0 + y1 - h) / 2));
      pad.setAttribute("width", String(w));
      pad.setAttribute("height", String(h));
      pad.setAttribute("fill", "transparent");
      gs[gs.length - 1].appendChild(pad);
    }
  }, [markup]);

  // Names and pressed state follow the locale and the selection.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    for (const g of svg.querySelectorAll<SVGGElement>('g.hot[role="button"]')) {
      const id = g.dataset.id!;
      g.setAttribute("aria-label", labelFor(id));
      if (id !== "floor") g.setAttribute("aria-pressed", String(activeHotspot === id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markup, activeHotspot, t]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    for (const g of svg.querySelectorAll<SVGGElement>("g.hot")) g.classList.toggle("is-lit", g.dataset.id === lit);
  }, [lit, markup]);

  const idOf = (target: EventTarget | null) => (target instanceof Element ? ((target.closest("g.hot") as SVGGElement | null)?.dataset.id ?? null) : null);
  const activate = (id: string) => (id === "floor" ? handlers.current.onFloorClick() : handlers.current.onHotspotClick(id));

  const readout = lit ?? activeHotspot;
  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      <style>{CSS}</style>
      {framed && (
        <svg
          ref={svgRef}
          className="nav-art"
          viewBox={framed.viewBox}
          width={size!.w}
          height={size!.h}
          role="group"
          aria-label={roomLabel}
          style={{ display: "block", ["--glow" as string]: framed.glowFilter }}
          onPointerOver={(e) => setLit(idOf(e.target))}
          onPointerLeave={() => setLit(null)}
          onFocus={(e) => setLit(idOf(e.target))}
          onBlur={() => setLit(null)}
          onClick={(e) => {
            const id = idOf(e.target);
            if (id) activate(id);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const id = idOf(e.target);
            if (!id) return;
            e.preventDefault();
            activate(id);
          }}
          dangerouslySetInnerHTML={{ __html: framed.markup }}
        />
      )}
      {/* Readout in the scene's empty top corner (the wall above the run):
          which room this is, and which object is under the pointer or
          selected. Not a live region — the objects carry their own names. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          insetInlineStart: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          minHeight: 24,
          fontSize: 11.5,
          fontFamily: PD.fontUi,
          color: PD.textSecondary,
          pointerEvents: "none",
        }}
      >
        <span style={{ fontWeight: 600, color: PD.textPrimary }}>{roomLabel}</span>
        {readout && <span aria-hidden>· {labelFor(readout)}</span>}
        {activeHotspot && !lit && (
          <button
            type="button"
            onClick={() => handlers.current.onHotspotClick(activeHotspot)}
            style={{
              pointerEvents: "auto",
              minHeight: 24,
              padding: "0 8px",
              borderRadius: 999,
              border: `1px solid ${PD.hairline}`,
              background: PD.surfaceMuted,
              color: PD.textPrimary,
              fontSize: 11,
              fontFamily: PD.fontUi,
              cursor: "pointer",
            }}
          >
            {td("showAll")}
          </button>
        )}
      </div>
    </div>
  );
}
