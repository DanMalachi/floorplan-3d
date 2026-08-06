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

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement } from "react";
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
import type { GeneratorDef } from "@/parametric/types";
import { FixtureCatalog } from "@/viewport3d/FixtureCatalog";
import { FLOOR_MATERIALS, FAMILY_ORDER, FAMILY_LABEL } from "@/materials/registry";
import { loadTambourColors, groupByFamily, type TambourColor, type TambourFamily } from "@/lib/tambourColors";
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
import { ROOM_ICON, SECTION_ICON, SearchIcon, CloseIcon, EyedropperIcon } from "./icons";
import { EyedropperController } from "@/decorate/EyedropperController";

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

// Item dock resize (Plan Dock P9). Default is sized to comfortably fit 2 full
// rows of ItemCard out of the box: card ≈ 4(pad-top) + 48(thumb) + 3(gap) +
// ~11.4(name line, 9.5px/1.2) + 3(gap) + ~9.6(kind line, 8px/1.2) + 4(pad-bottom)
// ≈ 83px, × 2 rows + 6px row gap ≈ 172px item-grid area; plus the resize
// handle (12) + gap (6) + tab-icon row (28) + gap (6) + category/search row
// (22) + inner gap (4) + outer padding (16) ≈ 268px total.
const DOCK_HEIGHT_KEY = "planDock:dockHeight";
const DOCK_HEIGHT_DEFAULT = 268;
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

/** Thin full-width strip pinned above the tab-icon row. Dragging it up grows
 *  the panel (the panel's `bottom` is pinned, so the top edge must move up as
 *  the mouse moves up — hence `startHeight + (startY - clientY)`). Plain DOM
 *  pointermove/pointerup listeners, not R3F — this is regular HTML, no
 *  Three.js raycasting involved. */
function DockResizeHandle({ dockHeight, setDockHeight }: { dockHeight: number; setDockHeight: (h: number) => void }) {
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
  return (
    <div
      onPointerDown={onPointerDown}
      title="Drag to resize"
      style={{
        flex: "0 0 auto",
        height: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "ns-resize",
        touchAction: "none",
      }}
    >
      <div style={{ width: 32, height: 3, borderRadius: 999, background: PD.textTertiary, opacity: 0.6 }} />
    </div>
  );
}

const DOCK_TABS: { id: DockTab; label: string }[] = [
  { id: "furniture", label: "Furniture" },
  { id: "lighting", label: "Lighting" },
  { id: "paint", label: "Paint" },
  { id: "floors", label: "Floors" },
];

// Every browsable room tab, all 11 with illustrated hotspot art in
// ROOM_SCENE_COMPONENT. NavigatorPanel's "scene not built yet" fallback stays
// in place for any future RoomType added without a Scene yet.
const ROOM_SCENES: { id: RoomType; label: string }[] = [
  { id: "kitchen", label: "Kitchen" },
  { id: "bathroom", label: "Bathroom" },
  { id: "bedroom", label: "Bedroom" },
  { id: "living", label: "Living" },
  { id: "dining", label: "Dining" },
  { id: "study", label: "Study" },
  { id: "laundry", label: "Laundry" },
  { id: "closet", label: "Closet" },
  { id: "kids", label: "Kids" },
  { id: "garage", label: "Garage" },
  { id: "outdoors", label: "Outdoors" },
];

function matchesHotspot(item: FurnitureAsset, hotspot: RoomHotspot): boolean {
  const text = searchText(item);
  return hotspot.keywords.some((k) => text.includes(k));
}

/** Hebrew text isn't useful to show as a caption — fall back to `kind`
 *  (English, normalized by enrich-catalog.ts) instead. */
const isHebrew = (s: string) => /[֐-׿]/.test(s);

// Which Building Knowledge Layer semantic types (src/lib/rooms/roomTaxonomy.ts's
// open vocabulary) count as a match for each Navigator room tag. "kids" has no
// entry — there's no matching semantic type — so it's a no-op focus click by
// design rather than a wrong guess. "study"->"office" mirrors catalog.ts's own
// "study is the renamed office RoomSection id" convention.
const FOCUS_SEMANTIC_TYPES: Partial<Record<RoomType, string[]>> = {
  kitchen: ["kitchen"],
  bathroom: ["bathroom"],
  bedroom: ["bedroom", "master_bedroom"],
  living: ["living"],
  dining: ["dining"],
  study: ["office"],
  laundry: ["laundry"],
  closet: ["closet"],
  garage: ["garage"],
  outdoors: ["balcony"],
};

/** Plan Dock P8: camera focus on room click. Finds the first scene.rooms
 *  entry whose Building Knowledge Layer verdict matches `tag`, computes its
 *  loop centroid, and arms CameraFocusRig — a no-op (not a wrong guess) when
 *  nothing in the built scene has been classified as that room type yet. */
function focusRoomForTag(tag: RoomType) {
  const types = FOCUS_SEMANTIC_TYPES[tag];
  if (!types) return;
  const { scene, setFocusTarget } = useSceneStore.getState();
  const room = scene.rooms.find((r) => r.semantics && types.includes(r.semantics.type));
  if (!room) return;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const pts = room.loop.map((id) => nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
  if (pts.length === 0) return;
  const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  setFocusTarget({ x, y });
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
  const RoomBigIcon = ROOM_ICON[room];
  const Scene = ROOM_SCENE_COMPONENT[room];
  return (
    <div style={{ position: "absolute", left: 16, bottom: 16, width: 208, height: 224, display: "flex", flexDirection: "column", ...pdGlass() }}>
      <div style={{ display: "flex", gap: 2, padding: "8px 8px 6px", flexWrap: "wrap" }}>
        {ROOM_SCENES.map((r) => {
          const Icon = ROOM_ICON[r.id];
          return (
            <Tooltip key={r.id} label={r.label}>
              <button
                onClick={() => {
                  setRoom(r.id);
                  setActiveHotspot(null);
                  focusRoomForTag(r.id);
                }}
                style={pdIconBtn(room === r.id)}
              >
                <Icon size={15} />
              </button>
            </Tooltip>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "2px 12px 12px" }}>
        {Scene ? (
          <Scene activeHotspot={activeHotspot} onHotspotClick={(id) => setActiveHotspot(activeHotspot === id ? null : id)} onFloorClick={onFloorClick} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: PD.textTertiary }}>
            <RoomBigIcon size={40} />
            <span style={{ fontSize: 10, textAlign: "center", padding: "0 10px" }}>
              {ROOM_SCENES.find((r) => r.id === room)?.label} scene not built yet — showing everything tagged for this room
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: FurnitureAsset }) {
  const placing = useSceneStore((s) => s.placing);
  const replaceTarget = useSceneStore((s) => s.replaceTarget);
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

  return (
    <button
      onClick={() => arm(activeSpec.assetId)}
      title={`${activeSpec.name} · ${activeSpec.footprint.w}×${activeSpec.footprint.d} m`}
      style={{
        flex: "0 0 auto",
        width: 68,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: 4,
        borderRadius: PD.radiusS,
        border: `1.5px solid ${active ? PD.accent : "transparent"}`,
        background: active ? PD.accentTint : PD.surfaceMuted,
        cursor: "pointer",
        fontFamily: PD.fontUi,
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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={activeSpec.name} width={48} height={48} style={{ objectFit: "contain" }} draggable={false} />
        )}
      </div>
      {group && (
        <div style={{ display: "flex", gap: 3 }}>
          {group.slice(0, 4).map((v) => (
            <span
              key={v.assetId}
              role="button"
              aria-label={`${v.name} · ${v.colors?.[0]?.name ?? "variant"}`}
              onClick={(e) => {
                e.stopPropagation();
                setActiveVariantId(v.assetId);
                arm(v.assetId);
              }}
              title={v.colors?.[0]?.name}
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
}

function WardrobeGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9.5" cy="12" r="0.8" fill="currentColor" />
      <circle cx="14.5" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

function BaseRunGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="8" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="13" y="8" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <line x1="7" y1="10.5" x2="7" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="17" y1="10.5" x2="17" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function WallCabinetsGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="4" x2="22" y2="4" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="6" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="13" y="6" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <line x1="7" y1="7.5" x2="7" y2="10.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="17" y1="7.5" x2="17" y2="10.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SofaGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 20v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 20v-2M20 20v-2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 11V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.4" />
      <line x1="9" y1="11" x2="9" y2="16" stroke="currentColor" strokeWidth="1.2" />
      <line x1="15" y1="11" x2="15" y2="16" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SinkGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="6" y="9" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M15 6V3.5a1.5 1.5 0 0 1 3 0V5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CooktopGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8.5" cy="10" r="2" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="15.5" cy="10" r="2" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="8.5" cy="15" r="2" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="15.5" cy="15" r="2" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

// Keyed by GeneratorDef.id.
const GENERATOR_GLYPH: Record<string, (props: { size: number }) => ReactElement> = {
  wardrobe: WardrobeGlyph,
  kitchenBase: BaseRunGlyph,
  kitchenWall: WallCabinetsGlyph,
  sofa: SofaGlyph,
  sink: SinkGlyph,
  cooktop: CooktopGlyph,
};

/** Pinned custom-generator card, mirrors ItemCard's tile styling. Click arms
 *  placement of the generator's default spec, same ghost/click-to-place flow
 *  as a catalog item. */
function CustomCard({ generator }: { generator: GeneratorDef }) {
  const placing = useSceneStore((s) => s.placing);
  const placingRun = useSceneStore((s) => s.placingRun);
  const assetId = `param:${generator.id}`;
  // kitchenBase/kitchenWall use the run-draw drag tool (RunDrawGhost)
  // instead of the single-click ghost every other generator uses.
  const isRun = generator.id === "kitchenBase" || generator.id === "kitchenWall";
  const active = isRun ? placingRun?.generator === generator.id : placing?.assetId === assetId;
  const Glyph = GENERATOR_GLYPH[generator.id];

  const arm = () => {
    const s = useSceneStore.getState();
    if (s.replaceTarget) return; // Replace flow doesn't support parametric items in v1
    if (generator.id === "kitchenBase" || generator.id === "kitchenWall") {
      s.setPlacingRun(active ? null : { generator: generator.id, spec: generator.defaultSpec });
      return;
    }
    s.setPlacing(active ? null : assetId, generator.defaultSpec);
  };

  return (
    <button
      onClick={arm}
      title={generator.label}
      style={{
        flex: "0 0 auto",
        width: 68,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: 4,
        borderRadius: PD.radiusS,
        border: `1.5px solid ${active ? PD.accent : "transparent"}`,
        background: active ? PD.accentTint : PD.surfaceMuted,
        cursor: "pointer",
        fontFamily: PD.fontUi,
      }}
    >
      <div style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", color: PD.textSecondary }}>
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
        Custom
      </span>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: PD.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
        {generator.label}
      </span>
    </button>
  );
}

function PaintTab() {
  const brush = useSceneStore((s) => s.brush);
  const activeHex = brush?.kind === "paint" ? brush.hex : undefined;
  const [colors, setColors] = useState<TambourColor[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadTambourColors().then((c) => alive && setColors(c));
    return () => {
      alive = false;
    };
  }, []);
  const grouped = useMemo(() => groupByFamily(colors ?? []), [colors]);
  const pick = (hex: string | null) => useSceneStore.getState().setBrush({ kind: "paint", hex });
  const plasterActive = brush?.kind === "paint" && activeHex === null;
  const families: TambourFamily[] = ["white", "neutral", "red", "orange", "yellow", "green", "blue", "purple"];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 5, overflowY: "auto", overflowX: "hidden", alignContent: "flex-start", alignItems: "flex-start", padding: "2px 2px" }}>
      <button
        onClick={() => pick(null)}
        title="Plaster (default)"
        style={{
          flex: "0 0 auto",
          width: 30,
          height: 30,
          borderRadius: 7,
          background: "#f3ece1",
          cursor: "pointer",
          border: plasterActive ? `2px solid ${PD.accent}` : "1.5px solid transparent",
        }}
      />
      {!colors && <span style={{ fontSize: 10, color: PD.textTertiary, padding: "6px 0" }}>Loading…</span>}
      {families.flatMap((slug) =>
        (grouped[slug] ?? []).map((c) => {
          const active = activeHex === c.hex;
          return (
            <button
              key={c.code}
              title={`${c.code} · ${c.nameEn}`}
              onClick={() => pick(c.hex)}
              style={{
                flex: "0 0 auto",
                width: 30,
                height: 30,
                borderRadius: 7,
                background: c.hex,
                cursor: "pointer",
                border: active ? `2px solid ${PD.accent}` : "1.5px solid transparent",
              }}
            />
          );
        }),
      )}
    </div>
  );
}

function FloorsTab() {
  const brush = useSceneStore((s) => s.brush);
  const active = brush?.kind === "floor" ? brush.style : undefined;
  const pick = (style: FloorStyle) => useSceneStore.getState().setBrush({ kind: "floor", style });
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 6, overflowY: "auto", overflowX: "hidden", alignContent: "flex-start", alignItems: "flex-start", padding: "2px 2px" }}>
      {FAMILY_ORDER.flatMap((family) =>
        FLOOR_MATERIALS.filter((m) => m.family === family).map((m) => {
          const on = active === m.id;
          return (
            <button
              key={m.id}
              onClick={() => pick(m.id)}
              title={`${m.name} · ${FAMILY_LABEL[family]} · tiles every ${m.coverM} m`}
              style={{
                flex: "0 0 auto",
                width: 44,
                height: 44,
                borderRadius: 7,
                backgroundImage: `url(${m.thumb})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                cursor: "pointer",
                border: on ? `2px solid ${PD.accent}` : "1.5px solid transparent",
              }}
            />
          );
        }),
      )}
    </div>
  );
}

function FurnitureItemsForRoom({ room, activeHotspot }: { room: RoomType; activeHotspot: string | null }) {
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

  // Pinned first, unaffected by category chips or the hotspot filter — only
  // search narrows this list.
  const customGenerators = useMemo(() => Object.values(GENERATORS).filter((g) => g.rooms.includes(room)), [room]);
  const visibleCustom = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? customGenerators.filter((g) => g.label.toLowerCase().includes(q)) : customGenerators;
  }, [customGenerators, query]);

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
          <button onClick={closeSearch} style={pdIconBtn(false, 22)}>
            <CloseIcon size={12} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 3, overflowX: "auto" }}>
          <Tooltip label="Search">
            <button onClick={() => setSearchOpen(true)} style={pdIconBtn(false, 22)}>
              <SearchIcon size={13} />
            </button>
          </Tooltip>
          <button onClick={() => setActiveCategory(null)} style={pdChip(activeCategory === null, { padding: "3px 8px", fontSize: 10.5 })}>
            All
          </button>
          {roomCategories.map((c) => (
            <button key={c} onClick={() => setActiveCategory(c)} style={pdChip(activeCategory === c, { padding: "3px 8px", fontSize: 10.5 })}>
              {c}
            </button>
          ))}
          <span style={{ ...pdMicroLabel(), marginLeft: "auto", flex: "0 0 auto" }}>{visibleCustom.length + items.length}</span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 6, overflowY: "auto", overflowX: "hidden", alignContent: "flex-start" }}>
        {visibleCustom.length === 0 && items.length === 0 ? (
          <div style={{ padding: "8px 4px", fontSize: 11, color: PD.textTertiary }}>Nothing here yet.</div>
        ) : (
          <>
            {visibleCustom.map((g) => <CustomCard key={g.id} generator={g} />)}
            {items.map((i) => <ItemCard key={i.assetId} item={i} />)}
          </>
        )}
      </div>
    </div>
  );
}

export function BottomDock() {
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
          left: 240,
          right: 16,
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
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {DOCK_TABS.map((t) => {
            const Icon = SECTION_ICON[t.id];
            return (
              <Tooltip key={t.id} label={t.label}>
                <button onClick={() => setTab(t.id)} style={pdIconBtn(tab === t.id)}>
                  <Icon size={15} />
                </button>
              </Tooltip>
            );
          })}
          <Tooltip label={eyedropper ? "Eyedropper armed (E)" : "Eyedropper (E)"}>
            <button onClick={() => useSceneStore.getState().setEyedropper(!eyedropper)} style={pdIconBtn(eyedropper)}>
              <EyedropperIcon size={14} />
            </button>
          </Tooltip>
          {brush && (
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: PD.accentText, fontFamily: PD.fontMono }}>
              {brush.kind === "paint" ? "Painting" : "Flooring"} — click a surface · Esc to stop
            </span>
          )}
          {!brush && replaceTarget && (
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: PD.accentText, fontFamily: PD.fontMono }}>
              Replacing — pick a new item
            </span>
          )}
        </div>
        {tab === "furniture" && <FurnitureItemsForRoom room={room} activeHotspot={activeHotspot} />}
        {tab === "lighting" && <FixtureCatalog />}
        {tab === "paint" && <PaintTab />}
        {tab === "floors" && <FloorsTab />}
      </div>
    </>
  );
}
