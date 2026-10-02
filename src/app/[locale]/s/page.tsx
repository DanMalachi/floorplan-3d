"use client";

// /s#<code> — a short share link (supabase/migrations/0009_share_links.sql).
//
// The code is in the fragment, so the server never saw it on the way here. This
// page reads it, trades it for the room and a grant at /api/share/resolve (a
// POST body, also never a URL), and replaces itself with the ordinary
// `/v/<id>#g=<grant>` — from there on it is exactly a long link. `replace`, not
// assign: Back from the room should not land on a page that resolves again.
//
// A "use client" page — exempt from setRequestLocale (src/i18n/README-static.md).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, hardNavHref } from "@/i18n/navigation";
import { PD } from "@/ui/planDock/tokens";
import { PdThemeStyle } from "@/ui/planDock/theme";

type State = "opening" | "gone" | "failed";

export default function ShortLinkPage() {
  const t = useTranslations("collabRoom.shortLink");
  const [state, setState] = useState<State>("opening");
  const [attempt, setAttempt] = useState(0);

  // Pasting a second short link into this same tab changes only the fragment,
  // which is not a navigation — without this the page keeps the first answer.
  useEffect(() => {
    const again = () => setAttempt((a) => a + 1);
    window.addEventListener("hashchange", again);
    return () => window.removeEventListener("hashchange", again);
  }, []);

  useEffect(() => {
    const code = window.location.hash.replace(/^#/, "");
    let cancelled = false;
    const settle = (s: State) => !cancelled && setState(s);
    if (!/^[A-Za-z0-9]{12}$/.test(code)) {
      settle("gone");
      return;
    }
    settle("opening");
    fetch("/api/share/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (res.status === 404 || res.status === 400) return settle("gone");
        if (!res.ok) return settle("failed");
        const { room, grant } = (await res.json()) as { room: string; grant: string };
        if (cancelled) return;
        window.location.replace(hardNavHref(`/v/${room.replace(/^floorplan-/, "")}#g=${grant}`));
      })
      .catch(() => settle("failed"));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: PD.bg,
        color: PD.textPrimary,
        fontFamily: PD.fontUi,
      }}
    >
      <PdThemeStyle />
      {state === "opening" ? (
        <p role="status" style={{ margin: 0, fontSize: 15, color: PD.textSecondary }}>
          {t("opening")}
        </p>
      ) : (
        <div role="alert" style={{ width: "min(420px, 100%)", display: "grid", gap: 12, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{t(state === "gone" ? "goneTitle" : "failedTitle")}</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: PD.textSecondary }}>
            {t(state === "gone" ? "goneBody" : "failedBody")}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 6 }}>
            {state === "failed" && (
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                style={{ padding: "8px 16px", borderRadius: 999, border: "none", background: PD.accent, color: "#fff", fontFamily: PD.fontUi, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {t("retry")}
              </button>
            )}
            <Link
              href="/"
              style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${PD.hairline}`, color: PD.textPrimary, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
            >
              {t("home")}
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
