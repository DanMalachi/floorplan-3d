"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { fixtureDropM, stripOutline, STRIP_WIDTH_M, STRIP_HEIGHT_M, type LightPoint } from "@/fixtures/linear";
import { ACCENT } from "./WallMesh";

/** Outline the entire profile, including every turn, in fixture-local space. */
export function StripSelection({ path, dim }: { path: LightPoint[]; dim: boolean }) {
  const points = useMemo(() => {
    const outline = stripOutline(path, STRIP_WIDTH_M + 0.12);
    const y = fixtureDropM("fx:linear") - STRIP_HEIGHT_M - 0.005;
    return (outline.length ? [...outline, outline[0]] : []).map((p): [number, number, number] => [p.x, y, p.y]);
  }, [path]);
  if (points.length < 3) return null;
  return <Line points={points} color={ACCENT} lineWidth={1.5} transparent opacity={dim ? 0.4 : 0.9}
    depthTest={false} depthWrite={false} renderOrder={10} raycast={() => {}} />;
}
