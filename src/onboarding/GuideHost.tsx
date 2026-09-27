"use client";

import { useEffect } from "react";
import { useSceneStore, type StoreState } from "@/store/useSceneStore";
import { listProjects } from "@/store/projectPersistence";
import { MIN_SHORT_SIDE } from "@/ui/SmallScreenNotice";
import { deviceFromWheel } from "./device";
import { trackViewportClicks } from "./gestures";
import { guideStore, useGuides } from "./guideStore";
import type { GuideId } from "./guides";
import { guidesFor, outgrown, wantsWelcome, type TriggerSnapshot } from "./triggers";
import { GUIDE_VIEWS } from "./views";
import { HelpPanel } from "./HelpPanel";
import { Nudges } from "./Nudges";

function snapshotOf(s: StoreState): TriggerSnapshot {
  return {
    appMode: s.appMode,
    traceStep: s.traceStep,
    hasImage: s.image !== null,
    scaleSet: s.metersPerPixel !== null,
    calibrationPts: s.calibrationPts.length,
    walkthroughActive: s.walkthroughActive,
    furnitureCount: s.scene.furniture.length,
    projectId: s.currentProjectId,
  };
}

const tooSmall = () => Math.min(window.innerWidth, window.innerHeight) < MIN_SHORT_SIDE;

/**
 * Mounts the onboarding guides in the editor (design page only: shared rooms
 * on /v/ render their own shell and never include this).
 *
 * `ready` must turn true only after the saved project has been restored, so
 * the first trigger pass sees the person's real state rather than the store's
 * defaults, and a restore doesn't read as "a piece was just placed".
 */
export function GuideHost({ ready }: { ready: boolean }) {
  const active = useGuides((s) => s.active);
  const enabled = useGuides((s) => s.enabled);
  const dismiss = useGuides((s) => s.dismiss);

  // Which guides can be shown at all.
  useEffect(() => {
    guideStore().getState().setAvailable(Object.keys(GUIDE_VIEWS) as GuideId[]);
  }, []);

  // No guides on small screens (the editor itself says to use a bigger one)
  // or in a live room.
  useEffect(() => {
    const update = () =>
      guideStore().getState().setEnabled(!tooSmall() && useSceneStore.getState().liveRoomId === null);
    update();
    window.addEventListener("resize", update);
    const unsub = useSceneStore.subscribe((s, p) => {
      if (s.liveRoomId !== p.liveRoomId) update();
    });
    return () => {
      window.removeEventListener("resize", update);
      unsub();
    };
  }, []);

  // Where clicks land on the 3D view, for the "first piece placed" card.
  useEffect(() => trackViewportClicks(), []);

  // The first scroll tells us mouse or trackpad.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      guideStore().getState().setDevice(deviceFromWheel(e), "input");
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  // Welcome once per fresh visitor, then step triggers for as long as we live.
  useEffect(() => {
    if (!ready) return;
    const guides = guideStore().getState();
    const s = useSceneStore.getState();
    if (
      wantsWelcome({
        projectCount: listProjects().length,
        hasImage: s.image !== null,
        tracedPoints: s.points.length,
        liveRoomId: s.liveRoomId,
      })
    ) {
      guides.request("welcome");
    }
    let prev = snapshotOf(s);
    guides.request(guidesFor(null, prev));
    return useSceneStore.subscribe((state) => {
      const next = snapshotOf(state);
      const g = guideStore().getState();
      // A step guide the person has moved past closes itself first, so the
      // next step's guide can open in its place rather than queue behind it.
      if (g.active && g.activeSource === "trigger" && outgrown(g.active, next)) g.dismiss();
      guideStore().getState().request(guidesFor(prev, next));
      prev = next;
    });
  }, [ready]);

  const View = enabled && active ? GUIDE_VIEWS[active] : undefined;
  return (
    <>
      {View && <View onDone={dismiss} />}
      {enabled && <Nudges />}
      <HelpPanel />
    </>
  );
}
