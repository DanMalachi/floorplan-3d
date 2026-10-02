"use client";

// Keeps a WebGL failure from taking the whole page down.
//
// Dan hit "THREE.WebGLRenderer: Error creating WebGL context" (thrown from R3F's
// `configure` while the Canvas root starts) during a user session. Nothing in
// the app can make the browser hand out a context it will not give — that is
// the GPU process having crashed, a driver reset (TDR), hardware acceleration
// being off, or a blocklisted GPU. What the app CAN do is fail like a product:
// say what happened, keep the plan and every other control alive, and offer a
// retry that builds a fresh canvas. Before this the error was uncaught and the
// route showed a blank "Application error" page.
//
// Three ways in, one card out:
//   - "unsupported": a probe context could not be created before mounting.
//   - "crashed":     the Canvas failed while starting — as an unhandled
//                    rejection (how R3F v9 reports it) or a render throw
//                    (the boundary below).
//   - "lost":        a live context was lost and not restored in time. three's
//                    renderer calls preventDefault on `webglcontextlost`, so the
//                    browser may hand it back; the watchdog only steps in when
//                    it does not.
//
// A wrapper, not an edit to Viewport.tsx — the 3D layer is protected (CLAUDE.md
// rule 1). The wrapper is `display: contents`, so it adds no box and the
// Viewport lays out against the same parent it always did; the context events
// still reach it, because event dispatch follows the DOM tree, not the boxes.
// `webglcontextlost` does not bubble, so it is caught in the capture phase.

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { PD, pdGlass } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";

type Failure = "unsupported" | "crashed" | "lost";

/** How long a lost context gets to come back before the card shows. Restores
 *  after a brief driver reset usually land well inside this. */
const RESTORE_GRACE_MS = 3000;

/** Can this browser create a WebGL context right now? The probe context is
 *  released at once — contexts are a capped resource and this one has no use. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!ctx) return false;
    ctx.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const isWebglError = (e: unknown) => /webgl context/i.test(e instanceof Error ? e.message : String(e));

/** Catches the Canvas failing to start. Anything that is not a WebGL failure is
 *  thrown on to the next boundary up, exactly as it would have been without
 *  this one. */
class WebglBoundary extends Component<{ onFail: () => void; children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown) {
    if (isWebglError(error)) {
      console.warn("[viewport] WebGL failed to start:", error instanceof Error ? error.message : error);
      this.props.onFail();
    }
  }
  render() {
    if (this.state.error) {
      if (!isWebglError(this.state.error)) throw this.state.error;
      return null;
    }
    return this.props.children;
  }
}

export function ViewportGuard({ children }: { children: ReactNode }) {
  const [failure, setFailure] = useState<Failure | null>(null);
  // Bumped by "Try again": a new key remounts the Canvas, which asks the
  // browser for a brand-new context instead of reusing the dead one.
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!webglAvailable()) setFailure("unsupported");
  }, [attempt]);

  // The failure Dan actually hit does NOT reach the boundary. R3F's Canvas
  // (v9) starts its root with `run()` — an async function nobody awaits — so
  // the renderer's "Error creating WebGL context" becomes an unhandled promise
  // rejection, and the Canvas stays mounted as a dead black rectangle. It is
  // caught here instead. Verified by failing getContext on the live canvas.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (!isWebglError(e.reason)) return;
      e.preventDefault();
      console.warn("[viewport] WebGL failed to start:", e.reason instanceof Error ? e.reason.message : e.reason);
      setFailure("crashed");
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onLost = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setFailure("lost"), RESTORE_GRACE_MS);
    };
    const onRestored = () => clearTimeout(timer);
    el.addEventListener("webglcontextlost", onLost, true);
    el.addEventListener("webglcontextrestored", onRestored, true);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("webglcontextlost", onLost, true);
      el.removeEventListener("webglcontextrestored", onRestored, true);
    };
  }, [attempt]);

  const retry = () => {
    setFailure(null);
    setAttempt((a) => a + 1);
  };

  return (
    <div ref={host} style={{ display: "contents" }}>
      {failure ? (
        <WebglFailureCard failure={failure} onRetry={retry} />
      ) : (
        <WebglBoundary key={attempt} onFail={() => setFailure("crashed")}>
          {children}
        </WebglBoundary>
      )}
    </div>
  );
}

function WebglFailureCard({ failure, onRetry }: { failure: Failure; onRetry: () => void }) {
  const t = useTranslations("editor.webgl");
  const lost = failure === "lost";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: PD.bg,
        fontFamily: PD.fontUi,
        color: PD.textPrimary,
      }}
    >
      <div
        role="alert"
        style={{
          ...pdGlass({ borderRadius: 22 }),
          width: "min(440px, 100%)",
          padding: 24,
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t(lost ? "lostTitle" : "title")}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: PD.textSecondary }}>
          {t(lost ? "lostBody" : "body")}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          <CardButton primary onClick={onRetry}>{t("retry")}</CardButton>
          <CardButton onClick={() => window.location.reload()}>{t("reload")}</CardButton>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 700, color: PD.textSecondary }}>{t("tipsTitle")}</p>
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, lineHeight: 1.6, color: PD.textTertiary }}>
          <li>{t("tipAccel")}</li>
          <li>{t("tipRestart")}</li>
        </ul>
      </div>
    </div>
  );
}

function CardButton({ primary, onClick, children }: { primary?: boolean; onClick: () => void; children: ReactNode }) {
  const [hovered, bind] = useHover();
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      style={{
        padding: "8px 16px",
        borderRadius: 999,
        border: primary ? "none" : `1px solid ${PD.hairline}`,
        background: primary ? PD.accent : hovered ? PD.surfaceMutedHover : "transparent",
        color: primary ? "#fff" : PD.textPrimary,
        fontFamily: PD.fontUi,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        filter: primary && hovered ? "brightness(1.1)" : "none",
        transition: "filter 140ms ease, background 140ms ease",
      }}
    >
      {children}
    </button>
  );
}
