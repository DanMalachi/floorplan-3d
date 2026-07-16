"use client";

// S2/S3 — live collaborative editing room with per-link roles. Joins a Liveblocks
// room (access token minted by /api/liveblocks-auth from the link's signed grant),
// binds a Yjs doc as the shared scene, installs a collab sink into the store, and
// gates the mode tabs to the link's role. A view link is READ-only (Liveblocks
// rejects writes); Share mints role links; "Save a copy" forks into local projects.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  importProject,
  getRoomOwner,
  getProjectSeed,
  scheduleProjectMirror,
  registerSharedProject,
} from "@/store/projectPersistence";
import { WALL_HEIGHT } from "@/schema/constants";
import type { Scene } from "@/schema/scene";
import { T, glass, chip, field } from "@/ui/tokens";
import { randomIdentity, initials, type Identity } from "./identity";
import type { RemoteSelection } from "./liveblocks";
import { ROLE_MODES, ROLE_LABEL, roleFromGrant, mintGrant, lbRoom, type ShareRole } from "./share";
import {
  isSceneEmpty,
  observeSceneDoc,
  readPresentation,
  readScene,
  readSceneTitle,
  sceneRoot,
  seedSceneDoc,
} from "./sceneDoc";
import { consumeGoLiveSeed, type GoLiveSeed } from "./goLiveHandoff";
import { applySceneDiff } from "./sceneDiff";
import "./liveblocks";

interface Syncable {
  synced?: boolean;
  on(event: "synced", cb: () => void): void;
  off(event: "synced", cb: () => void): void;
}

// -- shared-scene binding -----------------------------------------------------

function useRoomBinding(roomId: string, role: ShareRole) {
  const room = useRoom();
  const framed = useRef(false);
  const seedChecked = useRef(false);
  // The local project this browser mirrors the room into. For the owner it's the
  // project they went live from; for a link receiver it's a local copy we register
  // on first sight, so the shared doc shows up in THEIR gallery too (not a fork).
  const ownerProjectId = useRef<string | null>(null);
  const registering = useRef(false);

  useEffect(() => {
    // Only adopt a pre-existing mapping; don't clobber an id we register below with a
    // stale null if this resolves after first-sight registration.
    getRoomOwner(roomId).then((id) => { if (id) ownerProjectId.current = id; }).catch(() => {});

    const provider = getYjsProviderForRoom(room);
    const doc = provider.getYDoc();
    const LOCAL = { local: true };
    const undo = new Y.UndoManager(sceneRoot(doc), { trackedOrigins: new Set([LOCAL]) });

    const project = () => {
      if (useSceneStore.getState().gestureBase) return;
      const scene = readScene(doc);
      if (scene.nodes.length === 0 && scene.walls.length === 0) return; // not seeded yet
      const first = !framed.current && scene.nodes.length > 0;
      useSceneStore.setState((s) => ({
        scene,
        sel3d: s.sel3d && pickExists(scene, s.sel3d) ? s.sel3d : null,
        hover3d: s.hover3d && pickExists(scene, s.hover3d) ? s.hover3d : null,
        ...(first ? { appMode: "view" as AppMode, frameToken: s.frameToken + 1, ...readPresentation(doc) } : {}),
      }));
      if (first) framed.current = true;
      const p = readPresentation(doc);
      if (ownerProjectId.current) {
        // Continuously persist the live scene into the local project (durable keys
        // only — wallMode/showCeilings are runtime view prefs, not persisted).
        scheduleProjectMirror(ownerProjectId.current, {
          scene,
          envPreset: p.envPreset,
          timeOfDay: p.timeOfDay,
          weather: p.weather,
        });
      } else if (!registering.current) {
        // Link receiver, first sight: register a local copy of this shared doc so it
        // appears in their own gallery (same room, live tag). Idempotent.
        registering.current = true;
        registerSharedProject(roomId, { scene, ...p, title: readSceneTitle(doc) }, role)
          .then((id) => (ownerProjectId.current = id))
          .catch(() => {})
          .finally(() => (registering.current = false));
      }
    };

    const maybeSeed = async () => {
      if (seedChecked.current) return;
      seedChecked.current = true;
      if (isSceneEmpty(doc)) {
        // Seed from the "Go live" handoff, else the OWNER's persisted project. NEVER
        // from the store here: on /v the store is the default sample ("L-shaped
        // room"), and seeding that would mirror it back over the real project.
        const handoff = consumeGoLiveSeed(roomId);
        const owner = ownerProjectId.current ?? (await getRoomOwner(roomId).catch(() => null));
        ownerProjectId.current = owner;
        const seed: GoLiveSeed | null =
          handoff ?? (owner ? await getProjectSeed(owner) : null);
        // Re-check: a peer may have seeded while we awaited. Only seed if still empty
        // and we actually have a real plan — otherwise leave the room empty.
        if (seed && isSceneEmpty(doc)) seedSceneDoc(doc, seed.scene, seed, seed.title);
      }
      project();
    };

    const unobserve = observeSceneDoc(doc, project);
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
  }, [room, roomId]);
}

// -- others' selection markers (rendered INSIDE the R3F canvas) ---------------

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

function ModeSwitcher({ role }: { role: ShareRole }) {
  const appMode = useSceneStore((s) => s.appMode);
  const setAppMode = useSceneStore((s) => s.setAppMode);
  const allowed = ROLE_MODES[role];
  const modes = ROOM_MODES.filter((m) => allowed.includes(m.id));

  // Keep the current mode within the role's allowance.
  useEffect(() => {
    if (!allowed.includes(appMode)) setAppMode("view");
  }, [allowed, appMode, setAppMode]);

  if (modes.length <= 1) return null; // view-only: no switcher
  return (
    <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 40, display: "flex", gap: 3, padding: 4, ...glass({ borderRadius: 999 }) }}>
      {modes.map((m) => (
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

const SHARE_ROLES: ShareRole[] = ["view", "decorate", "build"];

/** Share popover + "Save a copy". Anyone in the room can mint links / fork. */
function ShareControls({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<ShareRole>("view");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const makeLink = useCallback(async (r: ShareRole) => {
    setRole(r);
    setCopied(false);
    const grant = await mintGrant(lbRoom(roomId), r);
    setLink(`${window.location.origin}/v/${roomId}?g=${grant}`);
  }, [roomId]);

  useEffect(() => {
    if (open && !link) void makeLink("view");
  }, [open, link, makeLink]);

  const copy = async () => {
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
  };

  const saveCopy = async () => {
    await importProject("Copy of shared plan", { scene: useSceneStore.getState().scene, appMode: "view" });
    setSaved(true);
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={saveCopy} style={chip(false)} title="Fork this plan into your own projects">
          {saved ? "Saved ✓" : "Save a copy"}
        </button>
        <button onClick={() => setOpen((o) => !o)} style={chip(true)}>Share</button>
      </div>
      {open && (
        <div style={{ position: "absolute", top: 40, right: 0, width: 320, padding: 14, display: "flex", flexDirection: "column", gap: 10, zIndex: 50, ...glass({ borderRadius: T.radiusM }) }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Share this plan</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SHARE_ROLES.map((r) => (
              <button
                key={r}
                onClick={() => makeLink(r)}
                style={{ textAlign: "left", padding: "7px 10px", borderRadius: T.radiusS, cursor: "pointer", fontFamily: T.font, fontSize: 12.5, color: T.text, border: `1px solid ${role === r ? T.accent : T.panelBorder}`, background: role === r ? T.accentSoft : T.inputBg }}
              >
                {role === r ? "● " : ""}Anyone with the link — <b>{ROLE_LABEL[r]}</b>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input readOnly value={link} style={field({ flex: 1, fontSize: 11 })} onFocus={(e) => e.target.select()} />
            <button onClick={copy} style={chip(true)}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
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

function TopBar({ roomId, role }: { roomId: string; role: ShareRole }) {
  const others = useOthers();
  const me = useSelf();
  const count = others.length + (me ? 1 : 0);
  // Leave back to the projects gallery. The `live:left` flag + `?home=1` tell the
  // home page to show the gallery instead of auto-reopening this room.
  const leave = () => {
    try {
      sessionStorage.setItem("live:left", roomId);
    } catch {
      /* ignore */
    }
    window.location.href = "/?home=1";
  };
  return (
    <div style={{ position: "absolute", top: 14, right: 14, zIndex: 40, display: "flex", alignItems: "center", gap: 10, fontFamily: T.font }}>
      <button onClick={leave} style={chip(false)} title="Back to your projects">← Projects</button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 6px 14px", ...glass({ borderRadius: 999 }) }}>
        <span style={{ fontSize: 12.5, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: T.ok, fontSize: 10 }}>●</span> {count} here
          {role === "view" && <span style={{ color: T.textFaint }}>· view only</span>}
        </span>
        <div style={{ display: "flex", paddingLeft: 6 }}>
          {me && <Avatar name={me.presence.name} color={me.presence.color} />}
          {others.map(({ connectionId, presence }) => (
            <Avatar key={connectionId} name={presence.name} color={presence.color} />
          ))}
        </div>
      </div>
      <ShareControls roomId={roomId} />
    </div>
  );
}

function RoomStage({ roomId, role }: { roomId: string; role: ShareRole }) {
  useRoomBinding(roomId, role);

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
      <ModeSwitcher role={role} />
      <TopBar roomId={roomId} role={role} />
    </div>
  );
}

export function CollabRoom({ roomId }: { roomId: string }) {
  // Client-only: the room reads the grant from the URL and drives a WebGL canvas,
  // so render nothing on the server to avoid a hydration mismatch (which would
  // remount the Liveblocks provider and break auth).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const identity = useMemo(() => randomIdentity(), []);
  const role = useMemo<ShareRole>(
    () => (mounted ? roleFromGrant(new URLSearchParams(window.location.search).get("g")) : "view"),
    [mounted],
  );

  const authEndpoint = useCallback(async (room?: string) => {
    const grant = new URLSearchParams(window.location.search).get("g");
    const res = await fetch("/api/liveblocks-auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room, grant }),
    });
    if (!res.ok) throw new Error("auth failed");
    return res.json();
  }, []);

  if (!mounted) return <div style={{ height: "100vh", background: T.bg }} />;

  return (
    <LiveblocksProvider authEndpoint={authEndpoint} throttle={16}>
      <RoomProvider id={lbRoom(roomId)} initialPresence={{ ...identity, selection: null }}>
        <RoomStage roomId={roomId} role={role} />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
