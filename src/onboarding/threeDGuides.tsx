"use client";

// Guides 7-11: the 3D view. The camera card comes first and teaches by doing:
// each move ticks off as the person makes it, and the card closes itself once
// all three are done. Then one card per navigator, one after the first piece
// is placed, and one before the first walk. Copy and pictures follow the
// north-star artifact (docs/ONBOARDING-HANDOFF.md §1).

import { useEffect, useState } from "react";
import type React from "react";
import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import { useGuides } from "./guideStore";
import {
  ControlRow,
  DeviceSwitch,
  GuideButton,
  GuideCard,
  GuideFoot,
  GuideSteps,
  GuideText,
  Keycap,
  richTags,
} from "./GuideCard";
import { DemoNavigator, KeyIcon, MouseIcon, PadIcon, SpaceDragIcon } from "./demos";
import { lastViewportClick, viewportCanvas, watchCameraMoves, type CameraMove } from "./gestures";
import type { GuideViewProps } from "./views";

/** How long "All done" stays up before the camera card closes itself. */
const DONE_LINGER_MS = 1400;

export function CameraGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor.guides.camera");
  const tg = useTranslations("editor.guides");
  const device = useGuides((s) => s.device);
  const appMode = useSceneStore((s) => s.appMode);
  const [done, setDone] = useState<Record<CameraMove, boolean>>({ turn: false, zoom: false, slide: false });
  const count = Object.values(done).filter(Boolean).length;

  useEffect(() => watchCameraMoves((m) => setDone((d) => (d[m] ? d : { ...d, [m]: true }))), []);
  useEffect(() => {
    if (count < 3) return;
    const id = window.setTimeout(onDone, DONE_LINGER_MS);
    return () => window.clearTimeout(id);
  }, [count, onDone]);

  const mouse = device === "mouse";
  const rows: Array<{ move: CameraMove; icon: React.ReactNode; how: string }> = [
    { move: "turn", icon: mouse ? <MouseIcon part="right" /> : <PadIcon gesture="swipe" />, how: t(mouse ? "turnMouse" : "turnPad") },
    { move: "zoom", icon: mouse ? <MouseIcon part="wheel" /> : <PadIcon gesture="pinch" />, how: t(mouse ? "zoomMouse" : "zoomPad") },
    { move: "slide", icon: mouse ? <MouseIcon part="wheeldrag" /> : <SpaceDragIcon />, how: t(mouse ? "slideMouse" : "slidePad") },
  ];

  return (
    <GuideCard
      park="bottom"
      // Clear of the Decorate dock when that's where the 3D view first opens.
      parkBottom={appMode === "furnish" ? 280 : 40}
      width={560}
      kicker={t("kicker")}
      aside={<DeviceSwitch />}
      title={t("title")}
      onClose={onDone}
      foot={
        <GuideFoot status={count === 3 ? t("allDone") : t("progress", { n: count })}>
          <GuideButton kind="ghost" onClick={onDone}>
            {tg("skip")}
          </GuideButton>
        </GuideFoot>
      }
    >
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <ControlRow key={r.move} icon={r.icon} title={t(r.move)} body={r.how} done={done[r.move]} />
        ))}
      </div>
      <GuideText note>{t("note")}</GuideText>
    </GuideCard>
  );
}

export function BuildNavGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor");
  return (
    <GuideCard
      anchor="build-navigator"
      ringRadius={20}
      width={400}
      kicker={t("modes.build")}
      title={t("guides.buildnav.title")}
      onClose={onDone}
      foot={
        <GuideFoot>
          <GuideButton onClick={onDone}>{t("guides.gotIt")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideText>{t("guides.buildnav.body")}</GuideText>
    </GuideCard>
  );
}

export function DecNavGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor");
  return (
    <GuideCard
      anchor="dec-navigator"
      ringAnchor={false}
      sides={["above", "end"]}
      rings={[
        { anchor: "dec-rooms", badge: 1, badgeAt: "start", radius: 12 },
        { anchor: "dec-scene", badge: 2, badgeAt: "start", radius: 12 },
        { anchor: "dec-shelf", badge: 3, badgeAt: "start", radius: 20 },
      ]}
      width={760}
      media={<DemoNavigator />}
      mediaWidth={280}
      kicker={t("modes.furnish")}
      title={t("guides.decnav.title")}
      onClose={onDone}
      foot={
        <GuideFoot>
          <GuideButton onClick={onDone}>{t("guides.gotIt")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideSteps
        items={[
          { body: t.rich("guides.decnav.step1", richTags) },
          { body: t.rich("guides.decnav.step2", richTags) },
          { body: t.rich("guides.decnav.step3", richTags) },
        ]}
      />
      <GuideText note>{t("guides.decnav.noFloor", { cutaway: t("wallModes.cutaway"), top: t("wallModes.top") })}</GuideText>
    </GuideCard>
  );
}

export function PlacedGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor");
  const device = useGuides((s) => s.device);
  // Read once: the piece is where the click that placed it landed.
  const [point] = useState(lastViewportClick);
  return (
    <GuideCard
      point={point}
      park="centre"
      width={400}
      kicker={t("modes.furnish")}
      title={t("guides.placed.title")}
      onClose={onDone}
      foot={
        <GuideFoot>
          <GuideButton onClick={onDone}>{t("guides.gotIt")}</GuideButton>
        </GuideFoot>
      }
    >
      <GuideText>{t.rich("guides.placed.body", richTags)}</GuideText>
      <div style={{ display: "grid", gap: 6 }}>
        {/* First: placing stays armed after a placement, and until Esc every
            click adds another piece and R turns the NEXT one, not this one. */}
        <ControlRow compact icon={<KeyIcon label="Esc" />} title={t("guides.placed.stop")} body={t("guides.placed.stopHow")} />
        <ControlRow
          compact
          icon={device === "mouse" ? <MouseIcon part="left" size={44} /> : <PadIcon gesture="one" size={44} />}
          title={t("guides.placed.move")}
          body={t("guides.placed.moveHow")}
        />
        <ControlRow compact icon={<KeyIcon label="R" />} title={t("guides.placed.turn")} body={t("guides.placed.turnHow")} />
        <ControlRow compact icon={<KeyIcon label="Delete" />} title={t("guides.placed.remove")} body={t("guides.placed.removeHow")} />
      </div>
    </GuideCard>
  );
}

export function WalkGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor.guides.walk");
  const device = useGuides((s) => s.device);

  // The first click on the view locks the pointer and walking starts: the
  // card has done its job by then.
  useEffect(() => {
    const onLock = () => {
      if (document.pointerLockElement) onDone();
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, [onDone]);

  const row = (icon: React.ReactNode, title: string, body: string) => (
    <>
      <div style={{ width: 118, display: "grid", placeItems: "center" }}>{icon}</div>
      <div style={{ display: "grid", gap: 2 }}>
        <b style={{ fontSize: 16 }}>{title}</b>
        <GuideText>{body}</GuideText>
      </div>
    </>
  );

  return (
    <GuideCard
      park="centre"
      width={500}
      kicker={t("kicker")}
      aside={<DeviceSwitch />}
      title={t("title")}
      onClose={onDone}
      foot={
        <GuideFoot>
          <GuideButton
            onClick={() => {
              // Walkthrough locks on a click on the canvas and watches
              // `pointerlockchange`, so locking from this click (a real user
              // gesture) starts the walk exactly as that click would.
              const canvas = viewportCanvas();
              onDone();
              void canvas?.requestPointerLock();
            }}
          >
            {t("start")}
          </GuideButton>
        </GuideFoot>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "14px 18px", alignItems: "center" }}>
        {row(
          <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 34px)", gap: 4, direction: "ltr" }}>
            <span />
            <Keycap>↑</Keycap>
            <span />
            <Keycap>←</Keycap>
            <Keycap>↓</Keycap>
            <Keycap>→</Keycap>
          </span>,
          t("walk"),
          t("walkHow"),
        )}
        {row(
          device === "mouse" ? <MouseIcon part="none" size={72} /> : <PadIcon gesture="one" size={72} />,
          t("look"),
          t(device === "mouse" ? "lookMouse" : "lookPad"),
        )}
        {row(<Keycap wide>Esc</Keycap>, t("stop"), t("stopHow"))}
      </div>
    </GuideCard>
  );
}
