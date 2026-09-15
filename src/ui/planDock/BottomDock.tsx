"use client";

// Replaces CatalogPanel (formerly defined in the protected Viewport.tsx) for
// appMode === "furnish". Per Downloads/UI UX overhaul/README.md + the v2
// addendum + Dan's Phase-B review feedback.
//
// Review changes, first pass (Phase B, Kitchen only):
//   - Dock is far more compact (~150px vs 336px) — icon row + slim category
//     rail + one row of small item cards, no more ~40% of viewport height.
//   - Navigator (room switcher + scene) is now a SEPARATE floating panel,
//     not the left column of the item dock — it isn't height-constrained by
//     the compact item list anymore, so the illustration can be bigger.
//   - Room labels and the Furniture/Lighting/Paint/Floors row are icons
//     (icons.tsx) with hover tooltips instead of text.
//   - Search is a toggle: an icon that expands into a text field, instead of
//     an always-visible input eating a row.
//   - Kitchen scene is a 3/4 isometric extrusion, and its floor plane is its
//     own hotspot that opens the Floors tab — kept Floors' icon too, since
//     not every room has a floor hotspot; other rooms would have no way to
//     reach Floors without it.
//   - Tokens flipped to dark + more transparent glass (tokens.ts).
//
// Review changes, second pass (Phase C — this pass):
//   - The isometric drawing kit moved out of KitchenScene.tsx into the
//     shared isoArt.tsx (projection math, extrusion/hotspot/hover mechanics,
//     a small library of recognizable-shape composites: sofa, bed, table+
//     legs, TV+stand, toilet, bathtub, potted plant, …) so every room scene
//     is a short file: hotspot list + composite art, not boilerplate.
//   - Objects are recognizable shapes now, not plain boxes (Dan's review).
//   - 5 more room scenes built: Bathroom, Bedroom, Living, Dining, Study —
//     see *Scene.tsx. Outdoors still has no scene (0 catalog items are
//     tagged "outdoors" — same reasoning as Phase A, no art for an empty
//     grid yet).
//   - Floor-hotspot hit-area bug fixed in the shared shell (isoArt.tsx's
//     RoomSceneShell): the floor's front edge now sits FLOOR_MARGIN past the
//     furniture row's front edge, so there's real open floor in front of
//     the items that isn't covered by any item's hit-rect. In the Kitchen-
//     only pass, floor and items shared one front edge, so the floor hotspot
//     was reachable only through a thin wedge on the right.
//
// The README's Suggestions column is still a tiny icon badge, not a full
// column — there isn't room for prose at this height. The armed-placement
// ghost + "selection frame with drag handles" 3D-interaction fix is still
// UNCHANGED — it requires editing pointer handling inside the protected
// FurnitureLayer.tsx/collision.ts, which needs Dan's sign-off first.

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSceneStore, type DockTab } from "@/store/useSceneStore";
import {
  CATEGORIES,
  getItemsForRoom,
  searchText,
  type FurnitureAsset,
  type FurnitureCategory,
  type RoomType,
} from "@/furniture/catalog";
import { useThumbnail } from "@/furniture/thumbnails";
import { variantGroupFor } from "@/furniture/variants";
import { GENERATORS } from "@/parametric";
import { piecesOf, type CustomPiece } from "@/parametric/pieces";
import type { ParametricSpec } from "@/schema/scene";
import { GENERATOR_GLYPH } from "./generatorGlyphs";
import { FixtureCatalog } from "@/viewport3d/FixtureCatalog";
import { FLOOR_MATERIALS, FAMILY_ORDER, FAMILY_LABEL_KEY } from "@/materials/registry";
import type { FloorStyle } from "@/schema/scene";
import { PD, pdGlass, pdChip, pdIconBtn, pdMicroLabel } from "./tokens";
import { KitchenScene, KITCHEN_HOTSPOTS, type RoomHotspot } from "./KitchenScene";
import { BathroomScene, BATHROOM_HOTSPOTS } from "./BathroomScene";
import { BedroomScene, BEDROOM_HOTSPOTS } from "./BedroomScene";
import { LivingScene, LIVING_HOTSPOTS } from "./LivingScene";
import { DiningScene, DINING_HOTSPOTS } from "./DiningScene";
import { StudyScene, STUDY_HOTSPOTS } from "./StudyScene";
import { LaundryScene, LAUNDRY_HOTSPOTS } from "./LaundryScene";
import { ClosetScene, CLOSET_HOTSPOTS } from "./ClosetScene";
import { KidsScene, KIDS_HOTSPOTS } from "./KidsScene";
import { GarageScene, GARAGE_HOTSPOTS } from "./GarageScene";
import { OutdoorsScene, OUTDOORS_HOTSPOTS } from "./OutdoorsScene";
import { Tooltip } from "./Tooltip";
import { useHover } from "./useHover";
import { ROOM_ICON, SECTION_ICON, SearchIcon, CloseIcon, EyedropperIcon } from "./icons";
import { EyedropperController } from "@/decorate/EyedropperController";
import { HomeColourPicker } from "./HomeColourPicker";

type RoomSceneProps = { activeHotspot: string | null; onHotspotClick: (id: string) => void; onFloorClick: () => void };

const ROOM_SCENE_COMPONENT: Partial<Record<RoomType, ComponentType<RoomSceneProps>>> = {
  kitchen: KitchenScene,
  bathroom: BathroomScene,
  bedroom: BedroomScene,
  living: LivingScene,
  dining: DiningScene,
  study: StudyScene,
  laundry: LaundryScene,
  closet: ClosetScene,
  kids: KidsScene,
  garage: GarageScene,
  outdoors: OutdoorsScene,
};

const ROOM_HOTSPOTS: Partial<Record<RoomType, RoomHotspot[]>> = {
  kitchen: KITCHEN_HOTSPOTS,
  bathroom: BATHROOM_HOTSPOTS,
  bedroom: BEDROOM_HOTSPOTS,
  living: LIVING_HOTSPOTS,
  dining: DINING_HOTSPOTS,
  study: STUDY_HOTSPOTS,
  laundry: LAUNDRY_HOTSPOTS,
  closet: CLOSET_HOTSPOTS,
  kids: KIDS_HOTSPOTS,
  garage: GARAGE_HOTSPOTS,
  outdoors: OUTDOORS_HOTSPOTS,
};

// Item dock resize (Plan Dock P9). One ItemCard ≈ 4(pad-top) + 48(thumb) +
// 3(gap) + ~11.4(name line, 9.5px/1.2) + 3(gap) + ~9.6(kind line, 8px/1.2) +
// 4(pad-bottom) ≈ 83px; the chrome around the grid (resize handle 12 + gap 6 +
// tab-icon row 28 + gap 6 + category/search row 22 + inner gap 4 + outer
// padding 16) ≈ 96px.
//
// P9 opened at TWO full rows (268). That reads as a drawer that opened itself:
// it eats a third of a laptop viewport before you've asked for anything, in
// every room. Default is now ONE full row plus a slice of the next — enough to
// show there's more and to invite the resize handle, without covering the room
// you're decorating. The storage key is versioned so a stored 268 from the old
// default doesn't survive as a "choice" nobody made.
const DOCK_HEIGHT_KEY = "planDock:dockHeight2";
const DOCK_HEIGHT_DEFAULT = 96 + 83 + 26;
const DOCK_HEIGHT_MIN = 150; // old single-row height — still collapsible to compact
const DOCK_HEIGHT_MAX_CAP = 560;

function clampDockHeight(h: number): number {
  const max = typeof window !== "undefined" ? Math.min(DOCK_HEIGHT_MAX_CAP, window.innerHeight * 0.7) : DOCK_HEIGHT_MAX_CAP;
  return Math.min(max, Math.max(DOCK_HEIGHT_MIN, h));
}

/** Lazy-init-from-localStorage, mirroring theme.tsx's usePdTheme() pattern:
 *  default state up front (SSR-safe), then read + apply the stored value in
 *  an effect so there's no server/client markup mismatch. */
function useDockHeight(): [number, (h: number) => void] {
  const [height, setHeightState] = useState(DOCK_HEIGHT_DEFAULT);

  useEffect(() => {
    const stored = window.localStorage.getItem(DOCK_HEIGHT_KEY);
    const parsed = stored ? Number(stored) : NaN;
    setHeightState(Number.isFinite(parsed) ? clampDockHeight(parsed) : DOCK_HEIGHT_DEFAULT);
  }, []);

  const setHeight = (h: number) => {
    const clamped = clampDockHeight(h);
    setHeightState(clamped);
    window.localStorage.setItem(DOCK_HEIGHT_KEY, String(clamped));
  };

  return [height, setHeight];
}

// ── Hover-owning wrappers ───────────────────────────────────────────────────
// Both of these hold their own `useHover()` flag. That is the point: calling
// the hook once in a parent and threading the flag down would make one
// cursor-over re-render the parent — for the tab row that is the whole dock,
// and for the category chips it is every card in the rail below them.

/** `pdIconBtn`-shaped button with its own hover state.
 *
 *  No `title` prop: an icon-only button's label belongs in the glass `Tooltip`
 *  the tab row and the navigator already wrap these in, not in a browser-drawn
 *  white window. Wrap the call site — `Tooltip` holds its own state, so it is
 *  safe inside a `.map()`. */
function DockIconBtn({
  onClick,
  active,
  size = 28,
  children,
}: {
  onClick: () => void;
  /** Omit entirely for a one-shot action (search, close) — an explicit
   *  true/false marks a real toggle (tab, eyedropper) as a toggle button;
   *  `aria-pressed={undefined}` (not `false`) is what keeps a plain action
   *  button from being announced as a toggle at all. */
  active?: boolean;
  size?: number;
  children: ReactNode;
}) {
  const [hovered, hoverBind] = useHover();
  return (
    <button {...hoverBind} onClick={onClick} aria-pressed={active} style={pdIconBtn(active, size, hovered)}>
      {children}
    </button>
  );
}

/** `pdChip`-shaped button with its own hover state. `extra` is forwarded to
 *  `pdChip` exactly as the call sites passed it before — which means it is
 *  still dropped there (see the note in tokens.ts); spreading it is a separate,
 *  reviewable change, not part of the hover sweep. */
function DockChip({
  onClick,
  active,
  extra,
  children,
}: {
  onClick: () => void;
  active: boolean;
  extra?: React.CSSProperties;
  children: ReactNode;
}) {
  const [hovered, hoverBind] = useHover();
  return (
    <button {...hoverBind} onClick={onClick} aria-pressed={active} style={pdChip(active, extra, hovered)}>
      {children}
    </button>
  );
}

/** A flat colour/material tile (paint swatch, floor sample). These carry their
 *  selected state as a border, so hover uses the same channel — a neutral grey
 *  ring, distinct from the accent ring that means "picked". `hairline` is too
 *  faint to read against an arbitrary swatch colour, which is why this is the
 *  one place the hover value isn't `surfaceMutedHover`. Before this, a grid of
 *  ~200 near-identical squares gave no feedback at all under the cursor. */
function SwatchButton({
  onClick,
  active,
  tip,
  style,
}: {
  onClick: () => void;
  active: boolean;
  /** The paint code / material name. This is the tooltip Dan singled out as one
   *  worth keeping ("good, like for getting the paint code") — it is the only
   *  place a swatch's identity is written down, since the tile is pure colour.
   *  It renders through the app's own glass now instead of the browser's white
   *  window, and `Tooltip` clones it on as the button's accessible name, which
   *  a bare coloured `<button>` otherwise has none of.
   *
   *  Placed BELOW: these grids scroll, and their first row sits flush against
   *  the scroll container's top edge, so a tooltip drawn above it is clipped. */
  tip: string;
  style: React.CSSProperties;
}) {
  const [hovered, hoverBind] = useHover();
  return (
    <Tooltip label={tip} placement="bottom">
      <button
        {...hoverBind}
        onClick={onClick}
        aria-pressed={active}
        style={{
          ...style,
          border: active ? `2px solid ${PD.accent}` : hovered ? `1.5px solid ${PD.textSecondary}` : "1.5px solid transparent",
          transition: "border-color 140ms ease",
        }}
      />
    </Tooltip>
  );
}

/** Thin full-width strip pinned above the tab-icon row. Dragging it up grows
 *  the panel (the panel's `bottom` is pinned, so the top edge must move up as
 *  the mouse moves up — hence `startHeight + (startY - clientY)`). Plain DOM
 *  pointermove/pointerup listeners, not R3F — this is regular HTML, no
 *  Three.js raycasting involved. */
function DockResizeHandle({ dockHeight, setDockHeight }: { dockHeight: number; setDockHeight: (h: number) => void }) {
  const t = useTranslations("editor.dock");
  const [hovered, hoverBind] = useHover();
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = dockHeight;
    const onMove = (ev: PointerEvent) => setDockHeight(startHeight + (startY - ev.clientY));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  // A11y: this was pointer-only, so the dock height was not adjustable at all
  // without a mouse. `role="separator"` with a tabindex is the ARIA pattern for
  // a resizable split — arrows nudge, Home/End jump to the extremes. The
  // drag behaviour above is untouched.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const STEP = 24;
    let next: number | null = null;
    if (e.key === "ArrowUp") next = dockHeight + STEP;
    else if (e.key === "ArrowDown") next = dockHeight - STEP;
    else if (e.key === "Home") next = DOCK_HEIGHT_MIN;
    else if (e.key === "End") next = DOCK_HEIGHT_MAX_CAP;
    if (next === null) return;
    e.preventDefault();
    setDockHeight(next);
  };
  const strip = (
    <div
      {...hoverBind}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      role="separator"
      aria-orientation="horizontal"
      aria-valuenow={Math.round(dockHeight)}
      aria-valuemin={DOCK_HEIGHT_MIN}
      aria-valuemax={DOCK_HEIGHT_MAX_CAP}
      tabIndex={0}
      style={{
        flex: "0 0 auto",
        // `width: 100%` is load-bearing now that a Tooltip wraps this: the
        // wrapper is an inline-flex span, so without it the strip would shrink
        // to the 32px pill inside and stop being a full-width drag target.
        width: "100%",
        height: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "ns-resize",
        touchAction: "none",
      }}
    >
      <div
        style={{
          width: 32,
          height: 3,
          borderRadius: 999,
          background: hovered ? PD.textSecondary : PD.textTertiary,
          opacity: hovered ? 1 : 0.6,
          transition: "background 140ms ease, opacity 140ms ease",
        }}
      />
    </div>
  );
  // Below, not above: this strip is the topmost thing inside a panel with
  // `overflow: hidden`, so a tooltip over it would be clipped away entirely.
  return (
    <Tooltip label={t("dragToResize")} placement="bottom">
      {strip}
    </Tooltip>
  );
}

// `labelKey`, not `label` — module scope cannot call `useTranslations()`.
// Same convention as ALL_MODES / WALL_MODES / the room scenes.
const DOCK_TABS: { id: DockTab; labelKey: string }[] = [
  { id: "furniture", labelKey: "furniture" },
  { id: "lighting", labelKey: "lighting" },
  { id: "paint", labelKey: "paint" },
  { id: "floors", labelKey: "floors" },
];

// Every browsable room tab, all 11 with illustrated hotspot art in
// ROOM_SCENE_COMPONENT. NavigatorPanel's "scene not built yet" fallback stays
// in place for any future RoomType added without a Scene yet.
const ROOM_SCENES: { id: RoomType; labelKey: string }[] = [
  { id: "kitchen", labelKey: "kitchen" },
  { id: "bathroom", labelKey: "bathroom" },
  { id: "bedroom", labelKey: "bedroom" },
  { id: "living", labelKey: "living" },
  { id: "dining", labelKey: "dining" },
  { id: "study", labelKey: "study" },
  { id: "laundry", labelKey: "laundry" },
  { id: "closet", labelKey: "closet" },
  { id: "kids", labelKey: "kids" },
  { id: "garage", labelKey: "garage" },
  { id: "outdoors", labelKey: "outdoors" },
];

function matchesHotspot(item: FurnitureAsset, hotspot: RoomHotspot): boolean {
  const text = searchText(item);
  return hotspot.keywords.some((k) => text.includes(k));
}

/** One browsable piece: a generator, plus which of its variants this card
 *  places. A generator with no variants yields a single card. */
/** Same test as `matchesHotspot`, for a custom piece. Custom cards used to
 *  ignore the hotspot filter entirely, so clicking "Toilet" in the illustrated
 *  room still showed every custom card the room had — the picture stopped
 *  being a navigator. */
function pieceMatchesHotspot(p: CustomPiece, hotspot: RoomHotspot): boolean {
  const text = p.keywords.join(" ").toLowerCase();
  return hotspot.keywords.some((k) => text.includes(k));
}

/** Hebrew text isn't useful to show as a caption — fall back to `kind`
 *  (English, normalized by enrich-catalog.ts) instead. */
const isHebrew = (s: string) => /[֐-׿]/.test(s);

// Clicking a Navigator room used to also move the 3D camera (Plan Dock P8's
// `focusRoomForTag`): it looked up the first scene.rooms entry whose Building
// Knowledge Layer verdict matched the tab and armed CameraFocusRig at its
// centroid. Removed — the room tabs are a CATALOG filter, and hijacking the
// camera on a filter click took the view away from whatever the user had
// framed, often landing on a room the classifier had guessed wrong anyway.
// Nothing writes `focusTarget` now, so CameraFocusRig stays mounted but inert.

/** One room tab. Its own component so `useHover` lives per BUTTON — 11
 *  buttons sharing one hover flag in NavigatorPanel would re-render the whole
 *  row (and the illustrated scene under it) on every cursor move. */
function NavRoomButton({ id, labelKey, active, onPick }: { id: RoomType; labelKey: string; active: boolean; onPick: (r: RoomType) => void }) {
  const t = useTranslations("editor.dock.rooms");
  const Icon = ROOM_ICON[id];
  const [hovered, hoverBind] = useHover();
  return (
    <Tooltip label={t(labelKey)}>
      <button {...hoverBind} onClick={() => onPick(id)} aria-pressed={active} style={pdIconBtn(active, 28, hovered)}>
        <Icon size={15} aria-hidden />
      </button>
    </Tooltip>
  );
}

/** Separate floating panel: room-icon switcher on top, illustrated scene
 *  below. No longer the left column of the item dock, so its height isn't
 *  squeezed by the compact item list. */
function NavigatorPanel({
  room,
  setRoom,
  activeHotspot,
  setActiveHotspot,
  onFloorClick,
}: {
  room: RoomType;
  setRoom: (r: RoomType) => void;
  activeHotspot: string | null;
  setActiveHotspot: (h: string | null) => void;
  onFloorClick: () => void;
}) {
  const t = useTranslations("editor.dock");
  const RoomBigIcon = ROOM_ICON[room];
  const Scene = ROOM_SCENE_COMPONENT[room];
  return (
    <section
      aria-label={t("roomNavigatorLabel")}
      style={{ position: "absolute", insetInlineStart: 16, bottom: 16, width: 208, height: 224, display: "flex", flexDirection: "column", ...pdGlass() }}
    >
      <div role="group" aria-label={t("roomGroupLabel")} style={{ display: "flex", gap: 2, padding: "8px 8px 6px", flexWrap: "wrap" }}>
        {ROOM_SCENES.map((r) => (
          <NavRoomButton
            key={r.id}
            id={r.id}
            labelKey={r.labelKey}
            active={room === r.id}
            onPick={(id) => {
              setRoom(id);
              setActiveHotspot(null);
            }}
          />
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "2px 12px 12px" }}>
        {Scene ? (
          <Scene activeHotspot={activeHotspot} onHotspotClick={(id) => setActiveHotspot(activeHotspot === id ? null : id)} onFloorClick={onFloorClick} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: PD.textTertiary }}>
            <RoomBigIcon size={40} aria-hidden />
            <span style={{ fontSize: 10, textAlign: "center", padding: "0 10px" }}>
              {t("sceneNotBuilt", { room: t(`rooms.${ROOM_SCENES.find((r) => r.id === room)?.labelKey}`) })}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function ItemCard({ item }: { item: FurnitureAsset }) {
  const placing = useSceneStore((s) => s.placing);
  const replaceTarget = useSceneStore((s) => s.replaceTarget);
  // Per CARD, not per rail: these render in lists of hundreds, so one hover
  // flag held in FurnitureItemsForRoom would re-render every card in the row.
  const [hovered, hoverBind] = useHover();
  // Color/finish variant group (Plan Dock P6) — null for the vast majority of
  // items (~11 real groups out of hundreds). `activeVariant` is which sibling
  // THIS card currently represents; a dot click swaps it without leaving the
  // card's position in the rail.
  const group = variantGroupFor(item.assetId);
  const [activeVariantId, setActiveVariantId] = useState(item.assetId);
  const activeSpec = (group?.find((a) => a.assetId === activeVariantId) ?? item) as FurnitureAsset;
  const rendered = useThumbnail(activeSpec.thumbnail ? "" : activeSpec.model ?? activeSpec.assetId);
  const thumb = activeSpec.thumbnail ?? rendered;
  const active = placing?.assetId === activeSpec.assetId;

  const arm = (assetId: string) => {
    const s = useSceneStore.getState();
    // Replace mode (armed from the P5 inspector's Replace button): this click
    // swaps the target item's asset IN PLACE instead of arming a new
    // placement ghost. One-shot — consumed here, not left armed.
    if (s.replaceTarget) {
      const id = s.replaceTarget;
      s.replaceFurnitureAsset(id, assetId);
      s.setReplaceTarget(null);
      s.setSel3d({ kind: "furniture", id });
      return;
    }
    s.setPlacing(placing?.assetId === assetId ? null : assetId);
  };

  const card = (
    <button
      {...hoverBind}
      onClick={() => arm(activeSpec.assetId)}
      // "Armed for placement" is signalled only by an accent border, so it has
      // to be reported as pressed state too. Its accessible NAME comes from
      // the Tooltip wrapper below (same text as the old `title`).
      aria-pressed={active}
      style={{
        flex: "0 0 auto",
        width: 68,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: 4,
        borderRadius: PD.radiusS,
        border: `1.5px solid ${active ? PD.accent : hovered ? PD.hairline : "transparent"}`,
        background: active ? PD.accentTint : hovered ? PD.surfaceMutedHover : PD.surfaceMuted,
        cursor: "pointer",
        fontFamily: PD.fontUi,
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 7,
          background: thumb ? undefined : "repeating-linear-gradient(45deg, oklch(1 0 0 / 0.06) 0 5px, transparent 5px 10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {thumb && (
          // The card's own text already names the item, so a repeated alt would
          // announce the name twice. The picture carries no extra information.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" width={48} height={48} style={{ objectFit: "contain" }} draggable={false} />
        )}
      </div>
      {group && (
        <div style={{ display: "flex", gap: 3 }}>
          {group.slice(0, 4).map((v) => (
            <span
              key={v.assetId}
              role="button"
              aria-label={`${v.name} · ${v.colors?.[0]?.name ?? "variant"}`}
              aria-pressed={v.assetId === activeSpec.assetId}
              // Was pointer-only: role="button" with no tabindex and no key
              // handler is a button nobody can reach or operate from the
              // keyboard. See docs/ACCESSIBILITY.md for the remaining
              // structural problem here (this control is nested inside the
              // card's own <button>, which no amount of ARIA fixes).
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                setActiveVariantId(v.assetId);
                arm(v.assetId);
              }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveVariantId(v.assetId);
                arm(v.assetId);
              }}
              // No tooltip of its own, and no `title`. The colour name is
              // already this dot's `aria-label` above, and a 9px target nested
              // INSIDE a card that carries its own tooltip would fire both at
              // once — two labels for one cursor. Clicking it swaps the card's
              // caption to that variant, which is the same answer, immediately.
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: v.colors?.[0]?.hex ?? "#999",
                border: v.assetId === activeSpec.assetId ? `1.5px solid ${PD.accent}` : `1px solid ${PD.hairline}`,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
      <span style={{ fontSize: 9.5, fontWeight: 600, color: PD.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
        {activeSpec.name}
      </span>
      {/* Imported catalogs' `subtitle` is the raw Hebrew product type — not
          useful as a caption for an English-reading picker. `kind` (added by
          enrich-catalog.ts) is the same information, normalized to English. */}
      {activeSpec.kind && (!activeSpec.subtitle || isHebrew(activeSpec.subtitle)) && (
        <span style={{ fontSize: 8, color: PD.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {activeSpec.kind}
        </span>
      )}
    </button>
  );
  // The footprint is the other tooltip Dan kept ("the chair measurments") — the
  // caption is ellipsized at 68px and the size appears nowhere else on the
  // card. BELOW the card: this grid scrolls and its first row is flush with the
  // container's top edge, which clips anything drawn above it.
  return (
    <Tooltip
      label={`${activeSpec.name} · ${activeSpec.footprint.w}×${activeSpec.footprint.d} m`}
      placement="bottom"
    >
      {card}
    </Tooltip>
  );
}


/** Pinned custom-generator card, mirrors ItemCard's tile styling. Click arms
 *  placement of the generator's default spec, same ghost/click-to-place flow
 *  as a catalog item. */
/** Resolves a piece's caption. Most variants carry an explicit
 *  `cardLabelKey`; cooktop is the one generator that does not, so its caption
 *  is composed from two resolved translations rather than a template over
 *  keys — the separator sits between two finished words in either script. */
function usePieceLabel() {
  const tp = useTranslations("editor.parametric");
  return (piece: CustomPiece) =>
    piece.variantLabelKey ? `${tp(piece.labelKey)} · ${tp(piece.variantLabelKey)}` : tp(piece.labelKey);
}

function CustomCard({ piece }: { piece: CustomPiece }) {
  const t = useTranslations("editor.dock");
  const pieceLabel = usePieceLabel();
  const label = pieceLabel(piece);
  const generator = piece.generator;
  const placing = useSceneStore((s) => s.placing);
  const placingRun = useSceneStore((s) => s.placingRun);
  const placingCounter = useSceneStore((s) => s.placingCounter);
  const placingWall = useSceneStore((s) => s.placingWall);
  const assetId = `param:${generator.id}`;
  // The card places ITS variant, at ITS size — resolved in piecesOf.
  const spec: ParametricSpec = piece.spec;
  // kitchenBase/kitchenWall use the run-draw drag tool (RunDrawGhost);
  // counter items (sink/cooktop/worktop microwave/island hood) use the
  // snap-onto-a-counter ghost and wall items (mirrors, towel rails, chimney
  // hoods) the wall-grid ghost (both in CounterItemGhost); everything else
  // keeps the single-click floor ghost.
  const isRun = generator.id === "kitchenBase" || generator.id === "kitchenWall";
  // Mounting follows THIS card's variant — a mirror hangs, the bin that shares
  // its generator does not; a chimney hood hangs, a fridge does not.
  const isWall = generator.wallMounted?.(spec) ?? false;
  const isCounter = generator.counterItem?.(spec) ?? false;
  // Compare the armed variant too, or all three toilet cards light up at once.
  const sameVariant = (s: { spec: ParametricSpec } | null) => s?.spec.variant === spec.variant;
  const active = isRun
    ? placingRun?.generator === generator.id
    : isCounter
      ? placingCounter?.generator === generator.id && sameVariant(placingCounter)
      : isWall
        ? placingWall?.generator === generator.id && sameVariant(placingWall)
        : placing?.assetId === assetId && placing?.parametric?.variant === spec.variant;
  const Glyph = GENERATOR_GLYPH[piece.glyphKey] ?? GENERATOR_GLYPH[generator.id];
  // Per card, same reasoning as ItemCard.
  const [hovered, hoverBind] = useHover();

  const arm = () => {
    const s = useSceneStore.getState();
    if (s.replaceTarget) return; // Replace flow doesn't support parametric items in v1
    if (generator.id === "kitchenBase" || generator.id === "kitchenWall") {
      s.setPlacingRun(active ? null : { generator: generator.id, spec });
      return;
    }
    if (isCounter) {
      s.setPlacingCounter(active ? null : { generator: generator.id, spec });
      return;
    }
    if (isWall) {
      s.setPlacingWall(active ? null : { generator: generator.id, spec });
      return;
    }
    s.setPlacing(active ? null : assetId, spec);
  };

  const card = (
    <button
      {...hoverBind}
      onClick={arm}
      aria-pressed={active}
      style={{
        flex: "0 0 auto",
        width: 68,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: 4,
        borderRadius: PD.radiusS,
        border: `1.5px solid ${active ? PD.accent : hovered ? PD.hairline : "transparent"}`,
        background: active ? PD.accentTint : hovered ? PD.surfaceMutedHover : PD.surfaceMuted,
        cursor: "pointer",
        fontFamily: PD.fontUi,
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      <div aria-hidden style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", color: PD.textSecondary }}>
        {Glyph && <Glyph size={30} />}
      </div>
      <span
        style={{
          fontSize: 7.5,
          fontWeight: 700,
          color: PD.accentText,
          background: PD.accentTint,
          borderRadius: 999,
          padding: "1px 5px",
          letterSpacing: 0.2,
        }}
      >
        {t("customBadge")}
      </span>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: PD.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
        {label}
      </span>
    </button>
  );
  // Same reasoning as ItemCard: the caption below is ellipsized at 68px, so the
  // full name is worth a hover label, drawn below because the grid scrolls.
  return (
    <Tooltip label={label} placement="bottom">
      {card}
    </Tooltip>
  );
}

function FloorsTab() {
  const t = useTranslations("editor.dock");
  const brush = useSceneStore((s) => s.brush);
  const active = brush?.kind === "floor" ? brush.style : undefined;
  const pick = (style: FloorStyle) => useSceneStore.getState().setBrush({ kind: "floor", style });
  return (
    // Same problem as the paint palette: each tile is a background-image only,
    // so it had no accessible name whatsoever.
    <div
      role="group"
      aria-label={t("floors.groupLabel")}
      style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 6, overflowY: "auto", overflowX: "hidden", alignContent: "flex-start", alignItems: "flex-start", padding: "2px 2px" }}
    >
      {FAMILY_ORDER.flatMap((family) =>
        FLOOR_MATERIALS.filter((m) => m.family === family).map((m) => (
          <SwatchButton
            key={m.id}
            onClick={() => pick(m.id)}
            active={active === m.id}
            tip={t("floors.tip", {
              name: t(`floors.names.${m.id}`),
              family: t(`floors.family.${FAMILY_LABEL_KEY[family]}`),
              cover: m.coverM,
            })}
            style={{
              flex: "0 0 auto",
              width: 44,
              height: 44,
              borderRadius: 7,
              backgroundImage: `url(${m.thumb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              cursor: "pointer",
            }}
          />
        )),
      )}
    </div>
  );
}

function FurnitureItemsForRoom({ room, activeHotspot }: { room: RoomType; activeHotspot: string | null }) {
  const t = useTranslations("editor.dock");
  const pieceLabel = usePieceLabel();
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveCategory(null);
  }, [room]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const roomItems = useMemo(() => getItemsForRoom(room), [room]);
  const hotspot = ROOM_HOTSPOTS[room]?.find((h) => h.id === activeHotspot);

  // Pinned first and unaffected by the category chips, but the HOTSPOT filter
  // does apply: the illustrated room is a navigator, so clicking the toilet in
  // it has to narrow to toilets, custom cards included.
  // Room membership is per CARD, not per generator: one appliance generator
  // covers the Kitchen's fridge and the Laundry's washing machine, and neither
  // tab should show the other's card.
  const customGenerators = useMemo(
    () =>
      Object.values(GENERATORS)
        .filter((g) => g.rooms.includes(room))
        .flatMap(piecesOf)
        .filter((p) => p.rooms.includes(room)),
    [room],
  );
  const visibleCustom = useMemo(() => {
    let out = customGenerators;
    if (hotspot) out = out.filter((p) => pieceMatchesHotspot(p, hotspot));
    const q = query.trim().toLowerCase();
    // Search the RESOLVED label, not the key — otherwise typing "ספה" in the
    // Hebrew UI matches nothing.
    return q ? out.filter((p) => pieceLabel(p).toLowerCase().includes(q)) : out;
  }, [customGenerators, hotspot, query, pieceLabel]);

  const items = useMemo(() => {
    let out = roomItems;
    if (hotspot) out = out.filter((i) => matchesHotspot(i, hotspot));
    if (activeCategory) out = out.filter((i) => i.category === activeCategory);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((i) => searchText(i).includes(q));
    // Collapse color/finish variant groups (Plan Dock P6) to their first
    // member — every sibling stays reachable via ItemCard's swatch-dot row,
    // so this only removes near-duplicate cards, not the colors themselves.
    const seenGroups = new Set<string>();
    out = out.filter((i) => {
      if (!i.variantKey || !variantGroupFor(i.assetId)) return true;
      if (seenGroups.has(i.variantKey)) return false;
      seenGroups.add(i.variantKey);
      return true;
    });
    return out;
  }, [roomItems, hotspot, activeCategory, query]);

  const roomCategories = useMemo(() => {
    const counts = new Map<FurnitureCategory, number>();
    for (const i of roomItems) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return CATEGORIES.filter((c) => counts.has(c)).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [roomItems]);

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      {searchOpen ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && closeSearch()}
            placeholder={`Search ${roomItems.length} models…`}
            // A placeholder is not a label: it disappears the moment anything is
            // typed, and some screen readers never announce it at all.
            aria-label={`Search ${roomItems.length} models in this room`}
            style={{
              flex: 1,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${PD.hairline}`,
              background: PD.inputBg,
              fontSize: 11.5,
              fontFamily: PD.fontUi,
              color: PD.textPrimary,
              outline: "none",
            }}
          />
          <Tooltip label={t("closeSearch")}>
            <DockIconBtn onClick={closeSearch} size={22}>
              <CloseIcon size={12} aria-hidden />
            </DockIconBtn>
          </Tooltip>
        </div>
      ) : (
        <div role="group" aria-label={t("filterItemsLabel")} style={{ display: "flex", alignItems: "center", gap: 3, overflowX: "auto" }}>
          <Tooltip label={t("search")}>
            <DockIconBtn onClick={() => setSearchOpen(true)} size={22}>
              <SearchIcon size={13} aria-hidden />
            </DockIconBtn>
          </Tooltip>
          <DockChip onClick={() => setActiveCategory(null)} active={activeCategory === null} extra={{ padding: "3px 8px", fontSize: 10.5 }}>
            {t("allCategories")}
          </DockChip>
          {roomCategories.map((c) => (
            <DockChip key={c} onClick={() => setActiveCategory(c)} active={activeCategory === c} extra={{ padding: "3px 8px", fontSize: 10.5 }}>
              {t(`categories.${c}`)}
            </DockChip>
          ))}
          {/* Deliberately NOT a live region: announcing a bare count on every
              keystroke is noise, not information. Naming it instead, so a
              screen reader that lands on it says what the number counts. */}
          <span
            aria-label={t("itemsShownLabel", { count: visibleCustom.length + items.length })}
            style={{ ...pdMicroLabel(), marginInlineStart: "auto", flex: "0 0 auto" }}
          >
            {visibleCustom.length + items.length}
          </span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 6, overflowY: "auto", overflowX: "hidden", alignContent: "flex-start" }}>
        {visibleCustom.length === 0 && items.length === 0 ? (
          <div style={{ padding: "8px 4px", fontSize: 11, color: PD.textTertiary }}>{t("nothingHere")}</div>
        ) : (
          <>
            {visibleCustom.map((p) => <CustomCard key={p.glyphKey} piece={p} />)}
            {items.map((i) => <ItemCard key={i.assetId} item={i} />)}
          </>
        )}
      </div>
    </div>
  );
}

export function BottomDock() {
  const t = useTranslations("editor.dock");
  const [tab, setTab] = useState<DockTab>("furniture");
  const [room, setRoom] = useState<RoomType>("kitchen");
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [dockHeight, setDockHeight] = useDockHeight();
  const brush = useSceneStore((s) => s.brush);
  const dockRequest = useSceneStore((s) => s.dockRequest);
  const replaceTarget = useSceneStore((s) => s.replaceTarget);
  const eyedropper = useSceneStore((s) => s.eyedropper);

  // Deep-link from the Build-tab house-cutaway navigator (Plan Dock P4): its
  // Floors/Paint hotspots have no build-mode tool, so "arming" them means
  // landing here with that tab already open. Keyed on `token`, not `tab`, so
  // a second click on the same hotspot (e.g. Floors again after switching
  // away) still re-opens it.
  useEffect(() => {
    if (dockRequest) setTab(dockRequest.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockRequest?.token]);

  return (
    <>
      <NavigatorPanel room={room} setRoom={setRoom} activeHotspot={activeHotspot} setActiveHotspot={setActiveHotspot} onFloorClick={() => setTab("floors")} />
      <EyedropperController />
      <div
        style={{
          position: "absolute",
          insetInlineStart: 240,
          insetInlineEnd: 16,
          bottom: 16,
          height: dockHeight,
          display: "flex",
          flexDirection: "column",
          padding: "8px 12px",
          gap: 6,
          overflow: "hidden",
          ...pdGlass(),
        }}
      >
        <DockResizeHandle dockHeight={dockHeight} setDockHeight={setDockHeight} />
        <div role="group" aria-label={t("dockSectionLabel")} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {/* `tab_`, not `t` — `t` is the translator in this scope now. */}
          {DOCK_TABS.map((tab_) => {
            const Icon = SECTION_ICON[tab_.id];
            return (
              <Tooltip key={tab_.id} label={t(`tabs.${tab_.labelKey}`)}>
                <DockIconBtn onClick={() => setTab(tab_.id)} active={tab === tab_.id}>
                  <Icon size={15} aria-hidden />
                </DockIconBtn>
              </Tooltip>
            );
          })}
          <Tooltip label={eyedropper ? t("eyedropperArmed") : t("eyedropper")}>
            <DockIconBtn onClick={() => useSceneStore.getState().setEyedropper(!eyedropper)} active={eyedropper}>
              <EyedropperIcon size={14} aria-hidden />
            </DockIconBtn>
          </Tooltip>
          {/* "A brush is armed and your next click paints something" is modal
              state. It appeared as a line of small text and nothing else, so a
              screen-reader user got no notice that clicking now does something
              different. role="status" announces it when it arms. */}
          {brush && (
            <span role="status" style={{ marginInlineStart: "auto", fontSize: 10.5, color: PD.accentText, fontFamily: PD.fontMono }}>
              {brush.kind === "frame"
                ? t("brushFrame")
                : brush.kind === "paint"
                  ? t("brushPaint")
                  : t("brushFloor")}
            </span>
          )}
          {!brush && replaceTarget && (
            <span role="status" style={{ marginInlineStart: "auto", fontSize: 10.5, color: PD.accentText, fontFamily: PD.fontMono }}>
              Replacing — pick a new item
            </span>
          )}
        </div>
        {tab === "furniture" && <FurnitureItemsForRoom room={room} activeHotspot={activeHotspot} />}
        {tab === "lighting" && <FixtureCatalog />}
        {tab === "paint" && <HomeColourPicker />}
        {tab === "floors" && <FloorsTab />}
      </div>
    </>
  );
}
