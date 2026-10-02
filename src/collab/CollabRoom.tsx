"use client";

// S2/S3 — live collaborative editing room with per-link roles. Joins a Liveblocks
// room (access token minted by /api/liveblocks-auth from the link's signed grant),
// binds a Yjs doc as the shared scene, installs a collab sink into the store, and
// gates the mode tabs to the link's role. A view link is READ-only (Liveblocks
// rejects writes); Share mints role links; "Save a copy" forks into local projects.

import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { useSceneStore, pickExists, reserveIds, sceneIds, type AppMode } from "@/store/useSceneStore";
import {
  importProject,
  getRoomOwner,
  getProjectSeed,
  scheduleProjectMirror,
  registerSharedProject,
} from "@/store/projectPersistence";
import { hardNavHref } from "@/i18n/navigation";
import { WALL_HEIGHT } from "@/schema/constants";
import type { Scene } from "@/schema/scene";
import { PD, pdChip, pdGlass, pdHoverTransition } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { Tooltip } from "@/ui/planDock/Tooltip";
import { CheckIcon } from "@/ui/planDock/icons";
import { ProjectBar } from "@/ui/ProjectBar";
import { PdThemeStyle } from "@/ui/planDock/theme";
import { randomIdentity, identityForUser, initials, type Identity } from "./identity";
import { displayName } from "@/lib/auth/profile";
import { useSession } from "@/lib/auth/useSession";
import type { RemoteSelection } from "./liveblocks";
import { inspectScene } from "./sceneGuard";
import {
  ROLE_MODES,
  roleFromGrant,
  mintGrant,
  revokeAllLinks,
  lbRoom,
  currentGrant,
  grantFromLocation,
  stripGrantFromUrl,
  ShareApiError,
  shortenGrant,
  shortLinkUrl,
  type ShareRole,
} from "./share";
// Same rule the server enforces when minting — roomPolicy.ts is pure (no
// next/headers, no Supabase), so the UI offers exactly what the API will allow.
import { canAttenuateTo } from "@/lib/api/roomPolicy";
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
import { Announcer } from "@/ui/a11y/Announcer";
import { HelpButton, HelpPanel } from "@/onboarding/HelpPanel";
import { guideStore } from "@/onboarding/guideStore";
import { LocaleSwitch } from "@/ui/planDock/LocaleSwitch";

interface Syncable {
  synced?: boolean;
  on(event: "synced", cb: () => void): void;
  off(event: "synced", cb: () => void): void;
}

// -- shared-scene binding -----------------------------------------------------

/** What the room has shown so far. "loading" until the shared doc delivers a
 *  plan; "empty" when it has synced and holds none. Until "ready", the 3D view
 *  is covered — the store on /v starts as the default sample ("L-shaped
 *  room"), and showing it read as "the link opened the wrong room" (Dan,
 *  2026-10-02). */
type RoomLoad = "loading" | "ready" | "empty";

function useRoomBinding(roomId: string, role: ShareRole): RoomLoad {
  const room = useRoom();
  const [load, setLoad] = useState<RoomLoad>("loading");
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
      // The document is written by every editor in the room and cannot be
      // validated server-side, so a hostile or corrupt one is stopped HERE — before
      // it reaches this editor, the local project mirror, or the cloud copy that
      // mirror feeds. Refusing keeps the last good scene on screen and on disk.
      const verdict = inspectScene(scene);
      if (!verdict.ok) {
        console.warn("[collab] refused a shared scene:", verdict.reason);
        return;
      }
      // Ids arriving from the shared doc were minted in SOMEONE ELSE's session,
      // so this client's counter has to clear them before it mints its own —
      // otherwise two peers create the same id and their edits merge into one
      // item. Cheap: the counter only ever moves forward.
      reserveIds(sceneIds(scene));
      const first = !framed.current && scene.nodes.length > 0;
      useSceneStore.setState((s) => ({
        scene,
        sel3d: s.sel3d && pickExists(scene, s.sel3d) ? s.sel3d : null,
        hover3d: s.hover3d && pickExists(scene, s.hover3d) ? s.hover3d : null,
        ...(first ? { appMode: "view" as AppMode, frameToken: s.frameToken + 1, ...readPresentation(doc) } : {}),
      }));
      if (first) framed.current = true;
      setLoad("ready");
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
      markEmpty();
    };

    // Synced and still nothing in it: say so rather than spin forever. Checked on
    // "synced" too, because the 1.5s fallback above can run maybeSeed BEFORE the
    // doc has synced, and then the synced call returns early.
    const markEmpty = () => {
      if ((provider as unknown as Syncable).synced && isSceneEmpty(doc)) {
        setLoad((l) => (l === "loading" ? "empty" : l));
      }
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
    sync.on("synced", markEmpty);
    const t = setTimeout(maybeSeed, 1500);

    return () => {
      clearTimeout(t);
      unobserve();
      sync.off("synced", maybeSeed);
      sync.off("synced", markEmpty);
      undo.destroy();
      useSceneStore.getState().setCollab(null);
    };
  }, [room, roomId]);

  return load;
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
              <div style={{ background: r.color, color: "#fff", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap", fontFamily: PD.fontUi, transform: "translateY(-16px)" }}>
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

/** The share popover's surface.
 *
 *  Deliberately NOT `pdGlass()`. That recipe is 38% opacity, and this panel
 *  carries a share URL at 11px plus a role menu — at 38% the 3D scene reads
 *  straight through the one string in this app that has to be copied
 *  correctly. `PD.panelBg` (72%) is the same design language at the weight
 *  type this small needs. The mode switcher and the presence pill beside it DO
 *  use `pdGlass()`: those are short labels floating over the model, which is
 *  exactly what that recipe is for. */
const roomPanel = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: PD.panelBg,
  backdropFilter: PD.glassBlur,
  WebkitBackdropFilter: PD.glassBlur,
  border: `1px solid ${PD.hairline}`,
  boxShadow: PD.glassShadow,
  color: PD.textPrimary,
  fontFamily: PD.fontUi,
  ...extra,
});

/** `field()` had no PD counterpart, so this is the same three ingredients —
 *  input ground, hairline, UI font — named in PD terms. */
const roomField = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: PD.inputBg,
  border: `1px solid ${PD.hairline}`,
  borderRadius: PD.radiusS,
  color: PD.textPrimary,
  padding: "4px 8px",
  fontSize: 12.5,
  fontFamily: PD.fontUi,
  ...extra,
});

// Labels come from the editor's own `editor.modes` keys — same switcher.
const ROOM_MODES: AppMode[] = ["build", "furnish", "view"];

function ModeSwitcher({ role }: { role: ShareRole }) {
  // Reuses the design page's own key: this nav names the same thing
  // (the Build/Decorate/View switcher) the editor's own chrome does.
  const t = useTranslations("editor.chrome");
  const tm = useTranslations("editor.modes");
  const appMode = useSceneStore((s) => s.appMode);
  const setAppMode = useSceneStore((s) => s.setAppMode);
  const allowed = ROLE_MODES[role];
  const modes = ROOM_MODES.filter((m) => allowed.includes(m));

  // Keep the current mode within the role's allowance.
  useEffect(() => {
    if (!allowed.includes(appMode)) setAppMode("view");
  }, [allowed, appMode, setAppMode]);

  if (modes.length <= 1) return null; // view-only: no switcher
  return (
    <nav aria-label={t("modeSwitcherLabel")} style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 40, display: "flex", gap: 3, padding: 4, ...pdGlass({ borderRadius: 999 }) }}>
      {modes.map((m) => (
        <RoomChip
          key={m}
          active={appMode === m}
          onClick={() => setAppMode(m)}
          // Only the shape is overridden now. The active fill used to be a
          // hand-set solid `T.accent` with white text — the exact "different
          // shade of blue" Dan flagged — and it is `pdChip`'s accent tint here
          // like every other control in the app.
          extra={{ borderRadius: 999, padding: "6px 18px" }}
        >
          {tm(m)}
        </RoomChip>
      ))}
    </nav>
  );
}

/** The hover `pdChip` alone does not give these chips. An ACTIVE chip keeps
 *  its tint under the cursor (pdChip does not deepen it), so Share and Copy —
 *  both drawn active — did not react at all, and an idle chip's 9% white wash
 *  is close to invisible over a bright 3D scene. Dan's "no hover animation".
 *  So the room's chips also brighten and pick up a soft accent glow, the same
 *  answer the editor's Go live button gives (src/app/[locale]/design/page.tsx).
 *  The glow is hover-only, per the navigator rules. */
const roomChipLift = (active: boolean, hovered: boolean): React.CSSProperties => ({
  filter: hovered ? "brightness(1.15)" : "none",
  boxShadow: hovered
    ? `0 6px 18px -8px oklch(0.62 0.15 258 / ${active ? 0.9 : 0.6})`
    : "0 0 0 0 oklch(0.62 0.15 258 / 0)",
  transition: `${pdHoverTransition(hovered)}, filter ${hovered ? "110ms" : "320ms"} ease-out`,
});

/** A `pdChip()` in the room's chrome, with hover. Its own component because
 *  `useHover` is a hook and the mode tabs / role rows are rendered in loops.
 *
 *  `extra` is spread AFTER `pdChip(...)`, never passed INTO it: `pdChip` accepts
 *  an `extra` argument and deliberately drops it (see the note in
 *  planDock/tokens.ts), so `pdChip(active, extra)` would silently lose every
 *  override — this chip's pill radius and padding among them.
 *
 *  `tooltip` replaces what was a native `title`. The room chrome is pinned at
 *  top:14, so it opens downward or it is clipped off the top of the window. */
const RoomChip = forwardRef<HTMLButtonElement, {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
  extra?: React.CSSProperties;
  /** For a chip that opens its own popover (Share) rather than toggling a
   *  mode — announces it as a disclosure control, not just a pressed toggle. */
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  children: React.ReactNode;
}>(function RoomChip(
  { active = false, onClick, disabled, tooltip, extra, "aria-expanded": ariaExpanded, "aria-controls": ariaControls, children },
  ref,
) {
  const [hov, bind] = useHover();
  const button = (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaExpanded === undefined ? active : undefined}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      {...bind}
      style={{ ...pdChip(active, undefined, !disabled && hov), ...roomChipLift(active, !disabled && hov), ...(disabled ? { opacity: 0.5, cursor: "default" } : {}), ...extra }}
    >
      {children}
    </button>
  );
  return tooltip ? (
    <Tooltip label={tooltip} placement="bottom">
      {button}
    </Tooltip>
  ) : (
    button
  );
});

/** The green presence light. A drawn circle rather than the `●` character it
 *  replaces — a text bullet reflows with the font. */
function Pip({ color, size = 7 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: 999, background: color, flex: "0 0 auto" }}
    />
  );
}

const SHARE_ROLES: ShareRole[] = ["view", "decorate", "build"];

/** Share popover + "Save a copy". Anyone in the room can fork, but a link may
 *  only be minted at the minter's own role or below — the server enforces that
 *  (src/lib/api/roomPolicy.ts), so offering a role above it would just produce a
 *  403. Offer exactly what `held` can actually hand out. */
function ShareControls({ roomId, held }: { roomId: string; held: ShareRole }) {
  const t = useTranslations("collabRoom");
  const [open, setOpen] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const sharePanelId = useId();
  const [role, setRole] = useState<ShareRole>("view");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);

  const offerable = useMemo(() => SHARE_ROLES.filter((r) => canAttenuateTo(held, r)), [held]);

  // Minting is a network round trip. While one is in flight the box still holds
  // the PREVIOUS role's link, so Copy is held off until the new one lands — and
  // only the latest request may write the box: the "view" link minted on open
  // can resolve after a later "edit" click and would otherwise replace it, with
  // the edit row still showing as selected.
  const mintSeq = useRef(0);
  const [minting, setMinting] = useState(false);

  const makeLink = useCallback(async (r: ShareRole) => {
    const seq = ++mintSeq.current;
    setRole(r);
    setCopied(false);
    setErr(null);
    setMinting(true);
    try {
      const grant = await mintGrant(lbRoom(roomId), r);
      if (seq !== mintSeq.current) return;
      // Short when the deployment can store one (`/s#k7Qm2xPa9Lz4` — Dan: the
      // long form "looks suspicious"), else the long form, which always works.
      // Both put the secret part in the fragment (F-20): it never leaves this
      // browser in a request, a Referer header, or a server log. Old links
      // already sent to people used `?g=` and CollabRoom below still reads that.
      const code = await shortenGrant(grant);
      if (seq !== mintSeq.current) return;
      setLink(code ? shortLinkUrl(window.location.origin, code) : `${window.location.origin}/v/${roomId}#g=${grant}`);
    } catch (e) {
      if (seq !== mintSeq.current) return;
      // Minting can fail for reasons the UI cannot rule out in advance —
      // an unconfigured signing secret, or ownership that has since moved.
      // Say so; a silent rejected promise leaves a stale link in the box.
      // The server's own message is English and not written for users; log
      // it, show the localized line. F-24's room-claim cap gets its own,
      // specific message rather than the generic one — "could not create a
      // link" would send someone looking for a network problem that isn't there.
      console.warn("[share] mint failed:", (e as Error).message);
      setLink("");
      setErr(e instanceof ShareApiError && e.code === "ROOM_LIMIT" ? t("roomLimitError") : t("linkError"));
    } finally {
      if (seq === mintSeq.current) setMinting(false);
    }
  }, [roomId, t]);

  useEffect(() => {
    if (open && !link) void makeLink("view");
  }, [open, link, makeLink]);

  // A11y: the popover had no Escape handler, so once open the only way to
  // dismiss it was to click the Share button again — reachable by keyboard,
  // but Escape is what everyone reaches for, and it is what the rest of this
  // app already does (ProjectsOverlay, AccountMenu, ConsentNotice).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      shareBtnRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ...and a press anywhere outside it closes it too — on the 3D view most of
  // all, which is where a hand goes next (Dan: "not closing when pressing on the
  // editor"). Capture phase, because the canvas's own pointer handlers may stop
  // the event before it would bubble up to window.
  const shareRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (shareRoot.current && !shareRoot.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const copy = async () => {
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
  };

  // Withdraw every link sent so far, then mint a fresh one for the box — the link
  // that was showing was minted before the cut-off, so it is dead too.
  const revoke = async () => {
    setErr(null);
    setRevoked(false);
    try {
      await revokeAllLinks(lbRoom(roomId));
      await makeLink(role);
      setRevoked(true);
    } catch (e) {
      console.warn("[share] revoke failed:", (e as Error).message);
      setErr(t("revokeError"));
    }
  };

  const saveCopy = async () => {
    await importProject(t("copyOfSharedPlan"), { scene: useSceneStore.getState().scene, appMode: "view" });
    setSaved(true);
  };

  return (
    <div ref={shareRoot} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <RoomChip
          onClick={saveCopy}
          tooltip={t("saveCopyTooltip")}
          extra={{ display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          {saved ? (
            <>
              {t("saved")} <CheckIcon size={12} aria-hidden />
            </>
          ) : (
            t("saveCopy")
          )}
        </RoomChip>
        {/* A disclosure, not a menu: see the account button in src/ui/AccountMenu.tsx. */}
        <RoomChip active ref={shareBtnRef} aria-expanded={open} aria-controls={open ? sharePanelId : undefined} onClick={() => setOpen((o) => !o)}>
          {t("share")}
        </RoomChip>
      </div>
      {open && (
        <div id={sharePanelId} role="group" aria-labelledby="fp-share-title" style={{ position: "absolute", top: 40, insetInlineEnd: 0, width: 320, padding: 14, display: "flex", flexDirection: "column", gap: 10, zIndex: 50, ...roomPanel({ borderRadius: PD.radiusM }) }}>
          <div id="fp-share-title" style={{ fontSize: 13, fontWeight: 600, color: PD.textPrimary }}>{t("shareTitle")}</div>
          <div role="group" aria-label={t("linkPermissionLabel")} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {offerable.map((r) => (
              <RoleRow key={r} selected={role === r} label={t(`roles.${r}`)} onClick={() => makeLink(r)} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input readOnly aria-label={t("shareLinkLabel")} value={link} aria-busy={minting} style={roomField({ flex: 1, fontSize: 11, opacity: minting ? 0.5 : 1 })} onFocus={(e) => e.target.select()} />
            <RoomChip active onClick={copy} disabled={!link || minting}>
              {copied ? t("copied") : t("copy")}
            </RoomChip>
          </div>
          {/* The chip's label change alone is silent to a screen reader. */}
          <span role="status" className="fp-sr-only">{copied ? t("copied") : ""}</span>
          {err && <div role="alert" style={{ fontSize: 11.5, color: PD.warnText }}>{err}</div>}
          {held === "build" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RoomChip onClick={revoke}>{t("revokeLinks")}</RoomChip>
              <span role="status" style={{ fontSize: 11, color: PD.textTertiary }}>{revoked ? t("revoked") : ""}</span>
            </div>
          )}
          {held !== "build" && (
            <div style={{ fontSize: 11, color: PD.textTertiary }}>
              {t("heldNote", { role: t(`roles.${held}`) })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One row of the share-role menu. The selected row led with a `● `; it is a
 *  tick now, which is what a selected menu row means. */
function RoleRow({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  const t = useTranslations("collabRoom");
  const [hov, bind] = useHover();
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      {...bind}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        textAlign: "start",
        padding: "7px 10px",
        borderRadius: PD.radiusS,
        cursor: "pointer",
        fontFamily: PD.fontUi,
        fontSize: 12.5,
        color: PD.textPrimary,
        border: `1px solid ${selected ? PD.accent : hov ? PD.surfaceMutedHover : PD.hairline}`,
        background: selected ? PD.accentTint : hov ? PD.surfaceMutedHover : PD.inputBg,
        transition: pdHoverTransition(hov),
      }}
    >
      {selected && <CheckIcon size={12} aria-hidden />}
      <span>
        {t.rich("anyoneWithLink", { role: label, b: (c) => <b>{c}</b> })}
      </span>
    </button>
  );
}

/** One face in the presence stack.
 *
 *  `marginInlineStart: -6` is what makes the pile overlap, and it has to stay on
 *  the OUTERMOST element: `Tooltip` wraps its child in an `inline-flex` span, so
 *  leaving the negative margin on the inner circle would shrink that span to
 *  22px and shift the stack instead of overlapping it. The margin therefore
 *  moves to a wrapper around the tooltip, and the circle keeps its own box. */
function Avatar({ name, color }: Identity) {
  // Announced as two stray capitals before; role="img" + the full name makes
  // "who else is in this room" readable rather than decorative initials.
  return (
    <span style={{ marginInlineStart: -6, display: "inline-flex", flex: "0 0 auto" }}>
      <Tooltip label={name} placement="bottom">
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: color, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid oklch(1 0 0 / 0.25)", fontFamily: PD.fontUi }}>
          {initials(name)}
        </div>
      </Tooltip>
    </span>
  );
}

function TopBar({ roomId, role }: { roomId: string; role: ShareRole }) {
  const t = useTranslations("collabRoom");
  const others = useOthers();
  const me = useSelf();
  const count = others.length + (me ? 1 : 0);
  return (
    <div style={{ position: "absolute", top: 14, insetInlineEnd: 14, zIndex: 40, display: "flex", alignItems: "center", gap: 10, fontFamily: PD.fontUi }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 6px 14px", ...pdGlass({ borderRadius: 999 }) }}>
        {/* The head count changes as people join and leave — the one fact in
            this room that arrives without the user doing anything. */}
        <span role="status" style={{ fontSize: 12.5, color: PD.textPrimary, display: "flex", alignItems: "center", gap: 6 }}>
          <Pip color={PD.ok} /> {t("hereCount", { count })}
          {role === "view" && <span style={{ color: PD.textTertiary }}>· {t("viewOnly")}</span>}
        </span>
        <div role="group" aria-label={t("peopleInRoomLabel")} style={{ display: "flex", paddingInlineStart: 6 }}>
          {me && <Avatar name={me.presence.name} color={me.presence.color} />}
          {others.map(({ connectionId, presence }) => (
            <Avatar key={connectionId} name={presence.name} color={presence.color} />
          ))}
        </div>
      </div>
      <ShareControls roomId={roomId} held={role} />
      <ReportRoomLink roomId={roomId} />
      {/* The editor's own help and language controls (its top-right cluster in
          src/app/[locale]/design/page.tsx). The room is a separate route and
          never had them, so a link recipient was stuck in English with no way
          to look up the camera controls. */}
      <HelpButton />
      <LocaleSwitch />
    </div>
  );
}

/** A viewer of a public share link has no other way to flag this room — it
 *  needs no sign-in, no ownership, and no held role, so it renders for
 *  everyone in the room regardless of `role`. Opens /report in a new tab with
 *  the room id pre-filled (never trusted there — see that page's own
 *  comment), so reporting never interrupts whatever the visitor is doing in
 *  the 3D view. */
function ReportRoomLink({ roomId }: { roomId: string }) {
  const t = useTranslations("collabRoom");
  const [hov, bind] = useHover();
  return (
    <Tooltip label={t("reportTooltip")} placement="bottom">
      <a
        href={hardNavHref(`/report?target=${encodeURIComponent(lbRoom(roomId))}`)}
        target="_blank"
        rel="noopener noreferrer"
        {...bind}
        style={{ ...pdChip(false, undefined, hov), ...roomChipLift(false, hov), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
      >
        {t("report")}
      </a>
    </Tooltip>
  );
}

function RoomStage({ roomId, role }: { roomId: string; role: ShareRole }) {
  const load = useRoomBinding(roomId, role);
  const t = useTranslations("collabRoom");

  // Guides off here (see the HelpPanel note below). The editor's GuideHost
  // decides this from `liveRoomId`, which /v never sets, and it is not mounted
  // on this route anyway — so say it directly.
  useEffect(() => {
    guideStore().getState().setEnabled(false);
  }, []);

  // useSceneStore.projectName is NOT set on /v — persistence never initializes
  // on this route, so it stays stuck at the local-editor default. The room's
  // display name is the shared doc's own title instead, read directly (not
  // via useRoomBinding, which doesn't expose it). It arrives asynchronously —
  // the doc syncs in after mount — so read on mount AND keep observing.
  const room = useRoom();
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    const doc = getYjsProviderForRoom(room).getYDoc();
    const read = () => setTitle(readSceneTitle(doc));
    read();
    return observeSceneDoc(doc, read);
  }, [room]);

  // Back to the projects gallery. The `live:left` flag + `?home=1` tell the
  // home page to show the gallery instead of auto-reopening this room.
  const leave = () => {
    try {
      sessionStorage.setItem("live:left", roomId);
    } catch {
      /* ignore */
    }
    window.location.href = hardNavHref("/design?home=1");
  };

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
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: PD.bg, overflow: "hidden" }}>
      {/* PD tokens (the shared ProjectBar) need their light-theme vars defined
          here too — this route never mounts src/app/design/page.tsx's copy. */}
      <PdThemeStyle />
      <Viewport collabOverlay={<SelectionMarkers remote={remote} />} />
      {load !== "ready" && (
        <RoomNotice title={load === "loading" ? null : t("emptyTitle")} body={load === "loading" ? t("loading") : t("emptyBody")} />
      )}
      <ModeSwitcher role={role} />
      <ProjectBar name={title ?? t("sharedPlan")} onOpenProjects={leave} />
      <TopBar roomId={roomId} role={role} />
      {/* The panel only — no GuideHost. Guides are off in a live room (they
          teach tracing and building a plan of your own), and with them off the
          panel shows what a visitor does need: the camera controls and how to
          reach us. */}
      <HelpPanel />
      <Announcer />
    </div>
  );
}

/** Covers the 3D view while the room has nothing real to show. */
function RoomNotice({ title, body }: { title: string | null; body: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "grid", placeItems: "center", padding: 16, background: PD.bg, fontFamily: PD.fontUi, color: PD.textPrimary }}>
      <div role="status" style={{ width: "min(420px, 100%)", display: "grid", gap: 10, textAlign: "center" }}>
        {title && <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{title}</h1>}
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: PD.textSecondary }}>{body}</p>
      </div>
    </div>
  );
}

/** The whole page when the server refused this visitor. Most often: the link
 *  was copied from the address bar, which never carries the access part. */
function NoAccess() {
  const t = useTranslations("collabRoom");
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: PD.bg, fontFamily: PD.fontUi, color: PD.textPrimary }}>
      <PdThemeStyle />
      <div role="alert" style={{ width: "min(440px, 100%)", display: "grid", gap: 12, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{t("noAccessTitle")}</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: PD.textSecondary }}>{t("noAccessBody")}</p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          <a href={hardNavHref("/")} style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${PD.hairline}`, color: PD.textPrimary, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            {t("noAccessHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export function CollabRoom({ roomId }: { roomId: string }) {
  // Client-only: the room reads the grant from the URL and drives a WebGL canvas,
  // so render nothing on the server to avoid a hydration mismatch (which would
  // remount the Liveblocks provider and break auth).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // RoomProvider only reads initialPresence on the first connect, so the session
  // has to be resolved BEFORE the room mounts — otherwise a signed-in user joins
  // as "Swift Fox" and keeps that name for the whole visit.
  const { user, loading: sessionLoading } = useSession();
  const guest = useMemo(() => randomIdentity(), []);
  const identity = useMemo(
    () => (user ? identityForUser(displayName(user), user.id) : guest),
    [user, guest],
  );
  // Read once, before the URL is cleaned up below. `roleFromGrant`'s side effect
  // remembers the grant in localStorage, so every later read (a Liveblocks
  // reconnect, a tab refocus) has it even after stripGrantFromUrl runs.
  //
  // `currentGrant`, not the URL alone: the URL loses its grant on the first load
  // (stripGrantFromUrl), so a reload, or the remount a language switch causes,
  // arrived with no grant and the UI fell to "view" — an edit link recipient
  // locked in View with no mode tabs. The grant remembered for THIS room is the
  // same capability, so it gates the UI exactly as the link did.
  const initialGrant = useMemo(() => (mounted ? currentGrant(lbRoom(roomId)) : null), [mounted, roomId]);
  const role = useMemo<ShareRole>(() => roleFromGrant(initialGrant), [initialGrant]);

  // F-20: take the grant out of the visible URL once it is safely remembered.
  // New links already arrive in the fragment, which never reached the server in
  // the first place; an old-format `?g=` link did reach the server on this very
  // request, but this at least keeps it out of this tab's later history entries.
  useEffect(() => {
    if (mounted && grantFromLocation()) stripGrantFromUrl();
  }, [mounted]);

  // A refusal (no grant, a grant for another room, a withdrawn or expired one)
  // used to be a thrown error, which Liveblocks retries forever — the visitor sat
  // looking at the default sample room with nothing to say why. Now a 401/403
  // ends the attempt ({ error: "forbidden" } tells Liveblocks to stop) and the
  // room says what happened. Other failures still throw, and so still retry.
  const [denied, setDenied] = useState(false);
  const authEndpoint = useCallback(async (room?: string) => {
    const grant = currentGrant(lbRoom(roomId));
    const res = await fetch("/api/liveblocks-auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room, grant }),
    });
    if (res.status === 401 || res.status === 403) {
      setDenied(true);
      return { error: "forbidden" as const, reason: "no access to this room" };
    }
    if (!res.ok) throw new Error("auth failed");
    return res.json();
  }, [roomId]);

  if (!mounted || sessionLoading) return <div style={{ height: "100vh", background: PD.bg }} />;
  if (denied) return <NoAccess />;

  return (
    <LiveblocksProvider authEndpoint={authEndpoint} throttle={16}>
      <RoomProvider id={lbRoom(roomId)} initialPresence={{ ...identity, selection: null }}>
        <RoomStage roomId={roomId} role={role} />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
