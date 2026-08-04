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

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import {
  CATEGORIES,
  getItemsForRoom,
  searchText,
  type FurnitureAsset,
  type FurnitureCategory,
  type RoomType,
} from "@/furniture/catalog";
import { useThumbnail } from "@/furniture/thumbnails";
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
import { ROOM_ICON, SECTION_ICON, SearchIcon, CloseIcon } from "./icons";

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

type DockTab = "furniture" | "lighting" | "paint" | "floors";
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
  const rendered = useThumbnail(item.thumbnail ? "" : item.model ?? item.assetId);
  const thumb = item.thumbnail ?? rendered;
  const active = placing?.assetId === item.assetId;
  return (
    <button
      onClick={() => useSceneStore.getState().setPlacing(active ? null : item.assetId)}
      title={`${item.name} · ${item.footprint.w}×${item.footprint.d} m`}
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
          <img src={thumb} alt={item.name} width={48} height={48} style={{ objectFit: "contain" }} draggable={false} />
        )}
      </div>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: PD.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
        {item.name}
      </span>
      {/* Imported catalogs' `subtitle` is the raw Hebrew product type — not
          useful as a caption for an English-reading picker. `kind` (added by
          enrich-catalog.ts) is the same information, normalized to English. */}
      {item.kind && (!item.subtitle || isHebrew(item.subtitle)) && (
        <span style={{ fontSize: 8, color: PD.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {item.kind}
        </span>
      )}
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
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 5, overflowX: "auto", alignItems: "flex-start", padding: "2px 2px" }}>
      <button
        onClick={() => pick(null)}
        title="Plaster (default)"
        style={{
          flex: "0 0 auto",
          width: 30,
          height: 30,
          borderRadius: 7,
          background: "#d8d2c4",
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
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6, overflowX: "auto", alignItems: "flex-start", padding: "2px 2px" }}>
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

  const items = useMemo(() => {
    let out = roomItems;
    if (hotspot) out = out.filter((i) => matchesHotspot(i, hotspot));
    if (activeCategory) out = out.filter((i) => i.category === activeCategory);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((i) => searchText(i).includes(q));
    return out;
  }, [roomItems, hotspot, activeCategory, query]);

  const roomCategories = useMemo(() => {
    const counts = new Map<FurnitureCategory, number>();
    for (const i of roomItems) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return CATEGORIES.filter((c) => counts.has(c)).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [roomItems]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
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
          <span style={{ ...pdMicroLabel(), marginLeft: "auto", flex: "0 0 auto" }}>{items.length}</span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6, overflowX: "auto", alignItems: "flex-start" }}>
        {items.length === 0 ? (
          <div style={{ padding: "8px 4px", fontSize: 11, color: PD.textTertiary }}>Nothing here yet.</div>
        ) : (
          items.map((i) => <ItemCard key={i.assetId} item={i} />)
        )}
      </div>
    </div>
  );
}

export function BottomDock() {
  const [tab, setTab] = useState<DockTab>("furniture");
  const [room, setRoom] = useState<RoomType>("kitchen");
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const brush = useSceneStore((s) => s.brush);

  return (
    <>
      <NavigatorPanel room={room} setRoom={setRoom} activeHotspot={activeHotspot} setActiveHotspot={setActiveHotspot} onFloorClick={() => setTab("floors")} />
      <div
        style={{
          position: "absolute",
          left: 240,
          right: 16,
          bottom: 16,
          height: 150,
          display: "flex",
          flexDirection: "column",
          padding: "8px 12px",
          gap: 6,
          ...pdGlass(),
        }}
      >
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
          {brush && (
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: PD.accentText, fontFamily: PD.fontMono }}>
              {brush.kind === "paint" ? "Painting" : "Flooring"} — click a surface · Esc to stop
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
