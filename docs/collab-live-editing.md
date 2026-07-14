# Design: Live collaborative editing ("Google-Docs for the 3D home")

**Status:** approved 2026-07-14. **S1 shipped** (live doc + presence, read-only). Next: S2.
**Decisions locked (2026-07-14):** realtime host = **Liveblocks**; CRDT = **Yjs**;
identity = **anonymous + editable name/color** (no login for the alpha); sharing =
**server-backed `/v/<id>` links with per-link roles**, edits are **live and shared**
(true multiplayer, not local copies).

## Goal

A designer opens a project, clicks **Share**, picks a role (View / Decorate / Build),
and sends a link. Anyone with the link joins the *same live room* — they see each
other's cursors and selections, and edits merge in real time with no "who saved last"
data loss. Roles are enforced server-side: a View link literally cannot write.

This is the acquisition funnel's core surface, so it has to feel solid the first time.

## Non-negotiable foundation

- **Yjs** shared document per room — the scene (nodes / walls / openings / rooms /
  furniture + presentation) lives in Yjs types, so concurrent edits *merge* instead of
  clobbering. Every serious multiplayer editor is built this way.
- **Liveblocks** hosts the Yjs doc (`@liveblocks/yjs` + `@liveblocks/client`/`-react`),
  provides presence/awareness, persists the doc per room, and issues access tokens with
  room roles. A single serverless route (`/api/liveblocks-auth`) mints tokens — the only
  backend piece, and it fits Vercel's serverless model (no long-lived socket on our side).
- **Per-user undo** via Yjs `UndoManager` scoped to the local client's origin — you undo
  *your* edits, never a collaborator's.

## Architecture

```
 Browser A ─┐                         ┌─ Liveblocks room  <id>
 Browser B ─┼─ @liveblocks/yjs ⇄ WS ─►│    • Yjs doc (the scene)  ← persisted
 Browser C ─┘        (awareness)      │    • presence (cursors/sel)
                                      └─ role from access token
        ▲
        │ /api/liveblocks-auth  (Vercel serverless): link → room + role → token
```

- **Room id = share id.** Creating a share provisions/points at a Liveblocks room and
  seeds it with the current scene (once). The link is `/v/<id>`.
- **Roles** ride on the link. `/api/liveblocks-auth` reads the link's role and grants
  Liveblocks room access: View = read-only (writes rejected by Liveblocks), Decorate /
  Build = write. UI additionally shows only the permitted mode tabs. Because View is
  server-enforced read-only, it's a real permission, not just hidden buttons.

### Yjs data model (the scene)

A `Y.Map` root `scene` mirrors the existing `Scene` (schemaVersion stays 2, additive):

| Scene field | Yjs type | Why |
|---|---|---|
| `nodes`, `walls`, `openings`, `rooms`, `furniture` | `Y.Map<id → Y.Map>` (keyed by id) | id-keyed so two people editing *different* items never conflict; per-item fields merge |
| each item's scalars (`x,y`, `thickness`, `paintA`, `offset`, …) | plain values in the item's `Y.Map` | last-writer-wins *per field* — moving the same node resolves cleanly |
| `presentation` (`envPreset`, `timeOfDay`, `weather`, `wallMode`, `showCeilings`) | `Y.Map` | shared so everyone sees the same scene/time |
| `building`, room `semantics` | `Y.Map`/JSON | derived; recomputed on structural change |

Presentation moves *into* the shared doc so the room looks identical for everyone
(today it's per-client store state).

### Store integration — the one real decision

Today `commitScene(label, next)` is the **single choke point**: "all 3D edits go through
here" (drag gestures fold into it via `endGesture`; furniture/paint call it too). That
is what makes this tractable. Two ways to connect it to Yjs:

- **(Recommended) Diff-bridge.** Keep the entire mature editing codebase untouched.
  When a room is active, `commitScene(prev → next)` computes a structural diff and applies
  the *minimal* Yjs ops (add/remove/update the changed items + scalars). A Yjs observer
  projects remote changes back into the Zustand `scene`. Local (offline) projects keep
  working exactly as today — the bridge is inert with no room.
  - *Pros:* small, low-regression; every gesture/inspector/brush keeps working; ship in
    phases; offline mode unchanged. *Cons:* the diff must be exhaustive per field (covered
    by a headless test); mid-drag `updateGesture` stays **local-only** and we sync on
    `endGesture` — during a drag, collaborators see a lightweight **awareness "ghost"** of
    the moving item, and the committed result on release (documented, intentional).
- **(Alternative) Yjs-native store.** Rewrite every action to mutate Yjs directly; scene
  becomes a pure projection. Cleaner in theory but a large rewrite of a mature editor with
  real regression risk. Reserve as a graduation path only if the bridge proves limiting.

I recommend the **diff-bridge**; it can absolutely be "done well" and de-risks the mature
editor. Confirmed at the S2 STOP.

### Undo/redo

Replace `scenePast/sceneFuture` with Yjs `UndoManager` bound to the scene root, tracking
only the local origin. Local commits apply to Yjs with a local origin tag so undo affects
just your changes. Offline (no room) keeps the current stack.

### Presence / awareness

Liveblocks awareness carries `{ name, color, cursor (plan x,y), selection (PickRef) }`.
Viewport renders remote cursors + tinted selection highlights on hovered/selected items,
plus a small avatar stack. Names/colors are auto-assigned, name editable in a small chip.

### Persistence & offline

- **Shared room** = source of truth while collaborating (Liveblocks persists it).
- **Local IndexedDB projects** stay for solo/offline work. Opening a share hydrates from
  the room, not IndexedDB. "Save a copy to my projects" forks the live scene into a local
  project (reuses `importProject`). A local project can be **promoted to a room** via Share.
- The `frameToken` reframe fix (just shipped) applies on room-hydrate too, so a joined
  model seats correctly.

### Access / deploy

Production is currently SSO-gated, so no link would open for a guest. Set Deployment
Protection to **Standard** (previews gated, production public). Add
`LIVEBLOCKS_SECRET_KEY` (server) + public key (client) to Vercel env.

## Phased plan (each ends in a hard STOP for your confirmation)

- **S1 — Live doc + presence, read-only.** Add Yjs+Liveblocks; a `/v/<id>` room renders
  the seeded scene in View with live cursors/avatars across two browsers. No editing yet.
  Proves transport, seeding, presence, hydrate+reframe. **STOP.**
- **S2 — Collaborative editing (the core).** Diff-bridge in `commitScene`; remote-change
  projection; Yjs `UndoManager` per-user undo; drag "ghost" awareness. Two people edit
  walls/openings/furniture/paint at once with no loss. Headless diff test. **STOP.**
- **S3 — Roles + Share dialog.** `/api/liveblocks-auth` role tokens (View read-only
  enforced; Decorate/Build write); Share dialog picks the role and copies the link; viewer
  shows only permitted tabs; "Save a copy" fork. **STOP.**
- **S4 — Ship it.** Production public + env keys; OG link-preview image of the model;
  anonymous-name polish; revoke a link; verify end-to-end on the live URL. **STOP.**

## Risks / decisions to confirm at the relevant STOP

- **Diff-bridge exhaustiveness** (S2) — every scene field must round-trip; guarded by a
  headless prev→next→Yjs→scene test. If it gets hairy, graduate to native binding.
- **Drag latency vs. op volume** (S2) — mid-drag stays local + awareness ghost; commit on
  release. Confirm it feels live enough at the STOP.
- **Liveblocks free-tier limits** (MAU/rooms) — fine for alpha; watch as usage grows.
- **Anonymous abuse on public write links** — acceptable for alpha (unlisted links);
  revoke + later auth are the mitigations.
- **Schema stays v2, additive** — old local projects must keep loading unchanged.

## What I need from you (before/at S1 and S4)

1. A **Liveblocks account** + project → its **public key** and **secret key** (I'll wire
   the auth route and env). Free tier is fine.
2. At S4: flip **Deployment Protection → Standard** (or confirm you want me to try it via
   the Vercel API) so guests can open share links.
```
