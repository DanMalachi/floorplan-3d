"use client";

// Shown whenever a 3D tab opens on an empty scene: a plan was imported (which
// clears the old scene) but "Generate 3D model" was never pressed. The second
// sim round found this: Ruth closed her room, clicked the Build TAB instead of
// the last trace step, and landed in an empty void where the camera card had
// her practise moving around nothing. Not a one-time guide but a state notice:
// it's there for as long as the scene is empty, unless the person chooses to
// stay (Build can draw walls from scratch too).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import { GuideButton, GuideCard, GuideFoot, GuideText, richTags } from "./GuideCard";

export function NotBuiltNotice() {
  const t = useTranslations("editor");
  const appMode = useSceneStore((s) => s.appMode);
  const empty = useSceneStore((s) => s.scene.walls.length === 0);
  const walking = useSceneStore((s) => s.walkthroughActive);
  const traced = useSceneStore((s) => s.segments.length > 0);
  // "Stay here" holds until they go back to Trace.
  const [stayed, setStayed] = useState(false);
  const show = appMode !== "trace" && empty && !walking && !stayed;
  // Going back to Trace resets it (adjusting state during render, the
  // React-sanctioned alternative to an effect).
  if (appMode === "trace" && stayed) setStayed(false);
  if (!show) return null;

  const go = () => {
    const s = useSceneStore.getState();
    s.setAppMode("trace");
    if (traced) s.setTraceStep(6);
  };

  return (
    <GuideCard
      park="centre"
      width={440}
      kicker={t("guides.notBuilt.kicker")}
      title={t("guides.notBuilt.title")}
      onClose={() => setStayed(true)}
      foot={
        <GuideFoot>
          <GuideButton kind="ghost" onClick={() => setStayed(true)}>
            {t("guides.notBuilt.stay")}
          </GuideButton>
          <GuideButton onClick={go}>{t(traced ? "guides.notBuilt.goBuild" : "guides.notBuilt.goTrace")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideText>
        {traced
          ? t.rich("guides.notBuilt.bodyTraced", { ...richTags, generate: t("trace.build.generate") })
          : t("guides.notBuilt.bodyEmpty")}
      </GuideText>
    </GuideCard>
  );
}
