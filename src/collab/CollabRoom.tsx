"use client";

// S2 — live collaborative editing. Joins a Liveblocks room, binds a Yjs doc as
// the shared scene, and installs a collab sink into the store so every edit
// (commitScene / drag / undo) flows through the doc with granular merges and
// per-user undo. Others' selections show as coloured markers.

import { useEffect, useMemo, useRef } from "react";
import {
  LiveblocksProvider,
  RoomProvider,
  useRoom,
  useOthers,
  useSelf,
  useUpdateMyPresence,
} from "@liveblocks/react";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { Html } from "@react-three/drei";
import * as Y from "yjs";
import { Viewport } from "@/viewport3d/Viewport";
import { useSceneStore, pickExists, type AppMode } from "@/store/useSceneStore";
import { WALL_HEIGHT } from "@/schema/constants";
import type { Scene } from "@/schema/scene";
import { T, glass, chip } from "@/ui/tokens";
import { randomIdentity, initials, type Identity } from "./identity";
import type { RemoteSelection } from "./liveblocks";
import {
  isSceneEmpty,
  observeSceneDoc,
  readPresentation,
  readScene,
  sceneRoot,
  seedSceneDoc,
} from "./sceneDoc";
import { applySceneDiff } from "./sceneDiff";
import "./liveblocks";

interface Syncable {
  synced?: boolean;
  on(event: "synced", cb: () => void): void;
  off(event: "synced", cb: () => void): void;
}

// -- shared-scene binding -----------------------------------------------------

function useRoomBinding() {
  const room = useRoom();
  const framed = useRef(false);
  const seedChecked = useRef(false);

  useEffect(() => {
    const provider = getYjsProviderForRoom(room);
    const doc = provider.getYDoc();
    const LOCAL = { local: true }; // origin tag: only this client's edits are undoable by it
    const undo = new Y.UndoManager(sceneRoot(doc), { trackedOrigins: new Set([LOCAL]) });

    const project = () => {
      // Never clobber an in-flight local drag; it commits to the doc on release.
      if (useSceneStore.getState().gestureBase) return;
      const scene = readScene(doc);
      // Doc not seeded yet — don't overwrite the local scene with an empty one
      // (that empty would then get captured as the seed).
      if (scene.nodes.length === 0 && scene.walls.length === 0) return;
      const first = !framed.current && scene.nodes.length > 0;
      useSceneStore.setState((s) => ({
        scene,
        sel3d: s.sel3d && pickExists(scene, s.sel3d) ? s.sel3d : null,
        hover3d: s.hover3d && pickExists(scene, s.hover3d) ? s.hover3d : null,
        ...(first
          ? { appMode: "view" as AppMode, frameToken: s.frameToken + 1, ...readPresentation(doc) }
          : {}),
      }));
      if (first) framed.current = true;
    };

    const maybeSeed = () => {
      if (seedChecked.current) return;
      seedChecked.current = true;
      if (isSceneEmpty(doc)) {
        const st = useSceneStore.getState();
        seedSceneDoc(doc, st.scene, {
          envPreset: st.envPreset,
          timeOfDay: st.timeOfDay,
          weather: st.weather,
          wallMode: st.wallMode,
          showCeilings: st.showCeilings,
        });
      }
      project();
    };

    const unobserve = observeSceneDoc(doc, project);
    project();

    // Install the collab sink: edits go to the doc, undo/redo to the UndoManager.
    useSceneStore.getState().setCollab({
      commit: (prev: Scene, next: Scene) => applySceneDiff(doc, prev, next, LOCAL),
      undo: () => undo.undo(),
      redo: () => undo.redo(),
    });

    const sync = provider as unknown as Syncable;
    if (sync.synced) maybeSeed();
    else sync.on("synced", maybeSeed);
    const t = setTimeout(maybeSeed, 1500);

    return () => {
      clearTimeout(t);
      unobserve();
      sync.off("synced", maybeSeed);
      undo.destroy();
      useSceneStore.getState().setCollab(null);
    };
  }, [room]);
}

// -- others' selection markers (rendered INSIDE the R3F canvas) ---------------
// Liveblocks hooks can't run inside <Canvas> (React context doesn't cross the
// R3F reconciler), so the remote selections are passed in as a plain prop.

type RemotePick = { name: string; color: string; selection: RemoteSelection };

function anchor(sel: NonNullable<RemoteSelection>, scene: Scene, nodes: Map<string, { x: number; y: number }>) {
  const P = (x: number, y: number, h: number) => ({ x, y: h, z: y });
  if (sel.kind === "wall") {
    const w = scene.walls.find((v) => v.id === sel.id);
    const a = w && nodes.get(w.a);
    const b = w && nodes.get(w.b);
    if (a && b) return P((a.x + b.x) / 2, (a.y + b.y) / 2, (w!.height ?? WALL_HEIGHT) + 0.35);
  } else if (sel.kind === "opening") {
    const o = scene.openings.find((v) => v.id === sel.id);
    const w = o && scene.walls.find((v) => v.id === o.wallId);
    const a = w && nodes.get(w.a);
    const b = w && nodes.get(w.b);
    if (a && b && o) {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = o.offset / L;
      return P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, o.sill + o.height + 0.35);
    }
  } else if (sel.kind === "room") {
    const r = scene.rooms.find((v) => v.id === sel.id);
    const pts = r?.loop.map((id) => nodes.get(id)).filter((p): p is { x: number; y: number } => !!p) ?? [];
    if (pts.length) return P(pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length, 1.4);
  } else if (sel.kind === "furniture") {
    const f = scene.furniture.find((v) => v.id === sel.id);
    if (f) return P(f.x, f.y, 0.6);
  }
  return null;
}

function SelectionMarkers({ remote }: { remote: RemotePick[] }) {
  const scene = useSceneStore((s) => s.scene);
  const nodes = useMemo(() => new Map(scene.nodes.map((n) => [n.id, { x: n.x, y: n.y }])), [scene.nodes]);
  return (
    <>
      {remote.map((r, i) => {
        if (!r.selection) return null;
        const p = anchor(r.selection, scene, nodes);
        if (!p) return null;
        return (
          <group key={i} position={[p.x, p.y, p.z]}>
            <mesh>
              <sphereGeometry args={[0.11, 16, 12]} />
              <meshBasicMaterial color={r.color} />
            </mesh>
            <Html center distanceFactor={12} style={{ pointerEvents: "none" }}>
              <div style={{ background: r.color, color: "#fff", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap", fontFamily: T.font, transform: "translateY(-16px)" }}>
                {r.name}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

// -- room chrome --------------------------------------------------------------

const ROOM_MODES: { id: AppMode; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "furnish", label: "Decorate" },
  { id: "view", label: "View" },
];

function ModeSwitcher() {
  const appMode = useSceneStore((s) => s.appMode);
  const setAppMode = useSceneStore((s) => s.setAppMode);
  return (
    <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 40, display: "flex", gap: 3, padding: 4, ...glass({ borderRadius: 999 }) }}>
      {ROOM_MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setAppMode(m.id)}
          style={chip(appMode === m.id, { borderRadius: 999, border: "none", padding: "6px 18px", background: appMode === m.id ? T.accent : "transparent", color: appMode === m.id ? "#fff" : T.textDim })}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function Avatar({ name, color }: Identity) {
  return (
    <div title={name} style={{ width: 28, height: 28, borderRadius: "50%", background: color, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.25)", marginLeft: -6, fontFamily: T.font }}>
      {initials(name)}
    </div>
  );
}

function PresenceBar() {
  const others = useOthers();
  const me = useSelf();
  const count = others.length + (me ? 1 : 0);
  return (
    <div style={{ position: "absolute", top: 14, right: 14, zIndex: 40, display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 6px 14px", fontFamily: T.font, ...glass({ borderRadius: 999 }) }}>
      <span style={{ fontSize: 12.5, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: T.ok, fontSize: 10 }}>●</span> Live · {count} here
      </span>
      <div style={{ display: "flex", paddingLeft: 6 }}>
        {me && <Avatar name={me.presence.name} color={me.presence.color} />}
        {others.map(({ connectionId, presence }) => (
          <Avatar key={connectionId} name={presence.name} color={presence.color} />
        ))}
      </div>
    </div>
  );
}

function RoomStage() {
  useRoomBinding();

  // Broadcast my selection so collaborators can see what I'm editing.
  const updateMyPresence = useUpdateMyPresence();
  const sel3d = useSceneStore((s) => s.sel3d);
  useEffect(() => {
    updateMyPresence({ selection: (sel3d as RemoteSelection) ?? null });
  }, [sel3d, updateMyPresence]);

  const others = useOthers();
  const remote = useMemo<RemotePick[]>(
    () => others.map((o) => ({ name: o.presence.name, color: o.presence.color, selection: o.presence.selection })),
    [others],
  );

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: T.bg, overflow: "hidden" }}>
      <Viewport collabOverlay={<SelectionMarkers remote={remote} />} />
      <ModeSwitcher />
      <PresenceBar />
    </div>
  );
}

export function CollabRoom({ roomId }: { roomId: string }) {
  const identity = useMemo(() => randomIdentity(), []);
  const publicApiKey = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;

  if (!publicApiKey) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: T.text, fontFamily: T.font, background: T.bg }}>
        <p>Live sharing isn’t configured (missing Liveblocks key).</p>
      </div>
    );
  }

  return (
    <LiveblocksProvider publicApiKey={publicApiKey} throttle={16}>
      <RoomProvider id={`floorplan-${roomId}`} initialPresence={{ ...identity, selection: null }}>
        <RoomStage />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
