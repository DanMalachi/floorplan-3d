"use client";

// S1 — a live shared room at /v/<id>. Connects to a Liveblocks room, binds a Yjs
// doc as the shared scene, seeds it (from the current scene) if empty, projects
// it into the scene store, and renders the existing 3D Viewport in read-only View
// with a live "who's here" presence bar. Editing arrives in S2.

import { useEffect, useRef, useMemo } from "react";
import {
  LiveblocksProvider,
  RoomProvider,
  useRoom,
  useOthers,
  useSelf,
} from "@liveblocks/react";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { Viewport } from "@/viewport3d/Viewport";
import { useSceneStore } from "@/store/useSceneStore";
import { T, glass } from "@/ui/tokens";
import { randomIdentity, initials, type Identity } from "./identity";
import {
  isSceneEmpty,
  observeSceneDoc,
  readPresentation,
  readScene,
  seedSceneDoc,
} from "./sceneDoc";
import "./liveblocks";

// Minimal shape we rely on for the sync signal — the provider's exact event
// typing varies, and a fallback timer guarantees seeding regardless.
interface Syncable {
  synced?: boolean;
  on(event: "synced", cb: () => void): void;
  off(event: "synced", cb: () => void): void;
}

function RoomStage() {
  const room = useRoom();
  const framed = useRef(false);
  const seedChecked = useRef(false);

  useEffect(() => {
    const provider = getYjsProviderForRoom(room);
    const doc = provider.getYDoc();

    const project = () => {
      const scene = readScene(doc);
      const pres = readPresentation(doc);
      const needFrame = !framed.current && scene.nodes.length > 0;
      useSceneStore.setState((s) => ({
        scene,
        envPreset: pres.envPreset,
        timeOfDay: pres.timeOfDay,
        weather: pres.weather,
        wallMode: pres.wallMode,
        showCeilings: pres.showCeilings,
        appMode: "view",
        sel3d: null,
        frameToken: needFrame ? s.frameToken + 1 : s.frameToken,
      }));
      if (needFrame) framed.current = true;
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
    project(); // render whatever's already synced

    const sync = provider as unknown as Syncable;
    if (sync.synced) maybeSeed();
    else sync.on("synced", maybeSeed);
    // Fallback: seed even if the sync event never lands.
    const t = setTimeout(maybeSeed, 1500);

    return () => {
      clearTimeout(t);
      unobserve();
      sync.off("synced", maybeSeed);
    };
  }, [room]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: T.bg, overflow: "hidden" }}>
      <Viewport />
      <PresenceBar />
    </div>
  );
}

function Avatar({ name, color }: Identity) {
  return (
    <div
      title={name}
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "2px solid rgba(255,255,255,0.25)",
        marginLeft: -6,
        fontFamily: T.font,
      }}
    >
      {initials(name)}
    </div>
  );
}

function PresenceBar() {
  const others = useOthers();
  const me = useSelf();
  const count = others.length + (me ? 1 : 0);
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 12px 6px 14px",
        fontFamily: T.font,
        ...glass({ borderRadius: 999 }),
      }}
    >
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
      <RoomProvider id={`floorplan-${roomId}`} initialPresence={identity}>
        <RoomStage />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
