"use client";

// Guides 2-6: the trace steps. Each one opens when its step does, sits beside
// that step in the trace rail, and closes itself if the person moves on first
// (see `outgrown` in triggers.ts). Copy and pictures follow the north-star
// artifact (docs/ONBOARDING-HANDOFF.md §1).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import { useGuides } from "./guideStore";
import {
  GuideButton,
  GuideCard,
  GuideDemo,
  GuideFoot,
  GuideOptions,
  GuideSteps,
  GuideText,
  richTags,
} from "./GuideCard";
import { DemoDimension, DemoDoor, DemoOpenings, DemoRail, DemoWalls } from "./demos";
import type { GuideViewProps } from "./views";

/** The trace UI's own control names, so a guide always names a control
 *  exactly as the rail labels it. */
function useToolNames() {
  const t = useTranslations("editor.trace");
  return {
    apply: t("scale.apply"),
    finish: t("finish.label"),
    rail: t("tools.rail"),
    open: t("tools.open"),
    interior: t("tools.interior"),
    exterior: t("tools.exterior"),
    door: t("tools.doorPatio"),
    window: t("tools.window"),
  };
}

export function ScaleGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor.guides");
  const device = useGuides((s) => s.device);
  return (
    <GuideCard
      anchor="trace-step-2"
      clearOf="trace-rail-panel"
      width={560}
      kicker={t("scale.kicker")}
      title={t("scale.title")}
      onClose={onDone}
      foot={
        <GuideFoot>
          <GuideButton onClick={onDone}>{t("gotIt")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideText>{t("scale.body")}</GuideText>
      <GuideOptions
        items={[
          { demo: <DemoDimension />, title: t("scale.dimTitle"), body: t("scale.dimBody") },
          { demo: <DemoDoor />, title: t("scale.doorTitle"), body: t("scale.doorBody") },
        ]}
      />
      <GuideText note>{device === "mouse" ? t("scale.noteMouse") : t("scale.noteTrackpad")}</GuideText>
    </GuideCard>
  );
}

export function Scale2Guide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor.guides");
  const names = useToolNames();
  return (
    <GuideCard
      anchor="trace-scale-distance"
      clearOf="trace-rail-panel"
      width={380}
      ringRadius={10}
      kicker={t("scale2.kicker")}
      title={t("scale2.title")}
      onClose={onDone}
      foot={
        <GuideFoot>
          <GuideButton onClick={onDone}>{t("gotIt")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideText>{t.rich("scale2.body", { ...richTags, apply: names.apply })}</GuideText>
    </GuideCard>
  );
}

/** Two pages: the order to trace in, then balconies on their own, because a
 *  rail is the one tool nobody guesses. */
export function WallsGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor.guides");
  const names = useToolNames();
  const [page, setPage] = useState(0);

  if (page === 1) {
    return (
      <GuideCard
        anchor="trace-rail"
        clearOf="trace-rail-panel"
        width={470}
        ringRadius="pill"
        kicker={t("rail.kicker")}
        title={t("rail.title")}
        onClose={onDone}
        foot={
          <GuideFoot page={{ index: 1, count: 2 }}>
            <GuideButton kind="ghost" onClick={() => setPage(0)}>
              {t("back")}
            </GuideButton>
            <GuideButton onClick={onDone}>{t("gotIt")}</GuideButton>
          </GuideFoot>
        }
      >
        <GuideDemo>
          <DemoRail />
        </GuideDemo>
        <GuideSteps
          items={[
            { body: t.rich("rail.step1", { ...richTags, rail: names.rail }) },
            { body: t.rich("rail.step2", richTags) },
            { body: t("rail.step3") },
          ]}
        />
      </GuideCard>
    );
  }

  return (
    <GuideCard
      anchor="trace-wall-tools"
      clearOf="trace-rail-panel"
      width={500}
      kicker={t("walls.kicker")}
      title={t("walls.title")}
      onClose={onDone}
      foot={
        <GuideFoot page={{ index: 0, count: 2 }}>
          <GuideButton kind="quiet" onClick={() => setPage(1)}>
            {t("walls.showRail")}
          </GuideButton>
          <GuideButton onClick={onDone}>{t("gotIt")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideDemo>
        <DemoWalls />
      </GuideDemo>
      <GuideSteps
        items={[
          {
            title: t("walls.wallsTitle"),
            body: t.rich("walls.wallsBody", { ...richTags, exterior: names.exterior, interior: names.interior }),
          },
          { title: t("walls.railTitle"), body: t.rich("walls.railBody", { ...richTags, rail: names.rail }) },
          { title: t("walls.openTitle"), body: t.rich("walls.openBody", { ...richTags, open: names.open }) },
        ]}
      />
      <GuideText note>{t("walls.note", { finish: names.finish })}</GuideText>
    </GuideCard>
  );
}

export function OpeningsGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor.guides");
  const names = useToolNames();
  return (
    <GuideCard
      anchor="trace-opening-tools"
      clearOf="trace-rail-panel"
      width={470}
      ringRadius={10}
      kicker={t("openings.kicker")}
      title={t("openings.title")}
      onClose={onDone}
      foot={
        <GuideFoot>
          <GuideButton onClick={onDone}>{t("gotIt")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideDemo>
        <DemoOpenings />
      </GuideDemo>
      <GuideText>{t.rich("openings.body", { ...richTags, door: names.door, window: names.window })}</GuideText>
      <GuideText note>{t("openings.note", { door: names.door })}</GuideText>
    </GuideCard>
  );
}

export function BuildGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor.guides");
  const setTraceStep = useSceneStore((s) => s.setTraceStep);
  return (
    <GuideCard
      anchor="trace-step-6"
      clearOf="trace-rail-panel"
      width={440}
      kicker={t("build.kicker")}
      title={t("build.title")}
      onClose={onDone}
      foot={
        <GuideFoot>
          <GuideButton
            kind="quiet"
            onClick={() => {
              // Closing first: leaving step 6 would close it anyway (outgrown),
              // and this keeps the order of events obvious.
              onDone();
              setTraceStep(3);
            }}
          >
            {t("build.backToWalls")}
          </GuideButton>
          <GuideButton onClick={onDone}>{t("gotIt")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideText>{t.rich("build.body", richTags)}</GuideText>
      <GuideText note>{t("build.note")}</GuideText>
    </GuideCard>
  );
}
