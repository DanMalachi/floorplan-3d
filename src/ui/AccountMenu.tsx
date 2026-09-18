"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PD, pdGlass } from "./planDock/tokens";
import { useHover } from "./planDock/useHover";
import { Tooltip } from "./planDock/Tooltip";
import { CloseIcon } from "./planDock/icons";
import { avatarUrl, displayName, useSession } from "@/lib/auth/useSession";
import { Link } from "@/i18n/navigation";
import { SignInConsent } from "@/legal/SignInConsent";
import { POP_IN_CLASS, PopInStyle } from "./motion/popIn";

// -----------------------------------------------------------------------------
// The account control, top-right next to the theme toggle.
//
// Signing in is an OFFER, never a gate: a guest gets the whole editor and their
// projects still autosave locally. The only thing an account adds is that those
// projects follow them to another computer — which is what the button says.
//
// Renders nothing at all when the deployment has no Supabase configured, so a
// local checkout without env vars looks exactly like it did before.
// -----------------------------------------------------------------------------

const SIZE = 30;

/**
 * Below this CSS viewport width, the signed-out pill collapses to just the
 * Google "G" (aria-label unchanged, tooltip still names it) so it stops
 * overlapping the mode switcher's "View" tab.
 *
 * Derived, not guessed — measured with headless Chromium (`ctx.measureText`,
 * real Manrope/Rubik webfonts loaded, same weights/sizes the components use)
 * against the two things that actually collide:
 *   - the trailing cluster (Sign-in pill + LocaleSwitch + ThemeToggle,
 *     `gap: 8` between each, `insetInlineEnd: 132` in Build/Decorate/View
 *     mode — the value that dodges Go Live at `insetInlineEnd: 14`)
 *   - the centred mode switcher nav (`padding: 4`, `gap: 3`, three
 *     `pdChip` buttons at their ACTUAL rendered size — `pdChip()` ignores
 *     its `extra` argument, so despite the call site passing
 *     `{padding:"6px 18px", fontSize:13}` the real box is `padding:"6px
 *     12px"`, `fontSize: 12` — worth knowing if this number is ever
 *     re-derived from the call site's style object instead of the chip's).
 *
 * Solving "cluster's leading edge == nav's trailing edge" for the viewport
 * width gives `W = 264 + 2*clusterWidth + navWidth` (264 = 132 doubled, the
 * two symmetric halves either side of the centred nav). Worst case is
 * Hebrew (longer "Sign in"/locale text, even though the EN nav is itself
 * wider — "Decorate" alone out-measures the whole Hebrew nav):
 *   EN: cluster ~179px, nav ~196px -> threshold ~817px
 *   HE: cluster ~192px, nav ~176px -> threshold ~825px
 * 840 clears both with a margin for cross-browser font-metric slop. Below
 * it, the collapsed cluster is ~126px, pushing the real threshold down to
 * ~700-711px — comfortably under the 720px width Dan asked to be checked.
 */
const SIGNIN_COLLAPSE_BREAK = 840;

/** The only two things the callback route ever puts in `?authError=`. Anything
 *  else — a stale link, a crafted param — collapses to "failed" rather than
 *  being rendered: the raw provider text used to land here verbatim, which let
 *  a crafted `?authError=` render arbitrary text under our brand. */
type AuthErrorCode = "cancelled" | "failed";
function toAuthErrorCode(raw: string | null): AuthErrorCode | null {
  if (raw === "cancelled" || raw === "failed") return raw;
  if (raw === null) return null;
  return "failed";
}

// Pointer + keyboard feedback for the sign-in panel. Hover is React state (as
// everywhere in the dock), but press and focus-visible are pseudo-classes that
// inline styles cannot express, so they live here. Links get the same hover
// language as /legal (accent + underline). No transform under reduced motion.
const SIGNIN_PANEL_CSS = `
.fp-signin-go { transition: background 140ms ease, transform 120ms ease, box-shadow 140ms ease; }
.fp-signin-go:hover:not(:disabled) { box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.14); }
.fp-signin-go:active:not(:disabled) { transform: scale(0.97); }
.fp-signin-go:focus-visible { outline: 2px solid ${PD.accent}; outline-offset: 2px; }
.fp-signin-retry:focus-visible, .fp-signin-dismiss:focus-visible { outline: 2px solid ${PD.accent}; outline-offset: 2px; }
.fp-signin-compact { display: none; }
.fp-signin-compact:focus-visible { outline: 2px solid ${PD.accent}; outline-offset: 2px; }
/* See SIGNIN_COLLAPSE_BREAK above for how this number was derived. \`!important\`
   matches the repo's existing WIDE_ONLY_CLASS/NARROW_ONLY_CLASS pattern
   (src/landing/hoverCss.ts) so it wins over the inline \`display\` each button
   also carries — pure CSS, so it applies on first paint with no JS/hydration
   flash, and \`display: none\` removes the hidden trigger from the a11y tree
   so it is never announced twice. */
@media (max-width: ${SIGNIN_COLLAPSE_BREAK - 1}px) {
  .fp-signin-full { display: none !important; }
  .fp-signin-compact { display: flex !important; }
}
.fp-signin-note a { transition: color 140ms ease, text-decoration-color 140ms ease; text-decoration-color: oklch(1 0 0 / 0.35); }
.fp-signin-note a:hover { color: ${PD.accentText} !important; text-decoration-color: currentColor; }
.fp-signin-note a:focus-visible { outline: 2px solid ${PD.accent}; outline-offset: 2px; border-radius: 3px; }
@media (prefers-reduced-motion: reduce) { .fp-signin-go:active:not(:disabled) { transform: none; } }
`;

export function AccountMenu() {
  const t = useTranslations("editor.chrome");
  const tc = useTranslations("signInConsent");
  const { user, loading, configured, signInWithGoogle, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorCode | null>(null);
  // Both hooks are called unconditionally, before the early returns below — one
  // for the signed-out sign-in pill, one for the signed-in avatar trigger. They
  // are separate flags because only ever one of the two is rendered.
  const [signInHover, signInHoverBind] = useHover();
  const [triggerHover, triggerHoverBind] = useHover();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The signed-out state renders TWO triggers (full pill + collapsed icon),
  // only one of which is ever visible — CSS picks which, not React — so
  // Escape's "focus back" below has to check which one is actually on screen.
  const compactTriggerRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [continueHover, continueHoverBind] = useHover();
  const [retryHover, retryHoverBind] = useHover();
  const [dismissHover, dismissHoverBind] = useHover();

  // The alert's "Try again" starts the exact same Google redirect the panel's
  // own button does — it is not a second flow, just a shorter path to it.
  const retrySignIn = () => {
    setAuthError(null);
    setBusy(true);
    void signInWithGoogle().catch(() => setBusy(false));
  };

  // The sign-in panel takes focus on open so Enter continues straight away —
  // the extra step exists to show the agreement line, not to slow anyone down.
  useEffect(() => {
    if (open && !user) continueRef.current?.focus();
  }, [open, user]);

  // A failed sign-in comes back as ?authError=<code> from the callback route —
  // always one of the fixed codes above, never provider text. Show it once,
  // then take it out of the URL so a refresh isn't haunted by it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = toAuthErrorCode(params.get("authError"));
    if (!code) return;
    setAuthError(code);
    params.delete("authError");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape already closed it; it now also puts focus back on the trigger,
    // so a keyboard user isn't left focused on a menu that no longer exists.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // `offsetParent` is null on a `display: none` element (and only that
      // element, of the two triggers, is ever hidden) — the cheapest way to
      // ask "which one is actually rendered" without reading matchMedia here.
      const visible = triggerRef.current?.offsetParent ? triggerRef.current : compactTriggerRef.current;
      visible?.focus();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!configured || loading) return null;

  if (!user) {
    return (
      <div ref={ref} style={{ position: "relative" }}>
        <PopInStyle />
        <style dangerouslySetInnerHTML={{ __html: SIGNIN_PANEL_CSS }} />
        {/* `placement="bottom"`: this control sits in the top-right chrome, so a
            tooltip above it would be clipped off the top of the window. Also
            gives the button its accessible name (Tooltip clones `label` on as
            aria-label) — richer than its own visible "Sign in" text alone.
            The pill no longer signs in directly: it opens a small panel whose
            button does, so the Terms/Privacy agreement is on screen BEFORE the
            Google redirect, next to the action, not somewhere nobody looks. */}
        <Tooltip label={t("accountMenu.signInTooltip")} placement="bottom">
          <button
            ref={triggerRef}
            className="fp-signin-full"
            onClick={() => {
              setAuthError(null);
              setOpen((v) => !v);
            }}
            disabled={busy}
            aria-haspopup="dialog"
            aria-expanded={open}
            {...signInHoverBind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              height: SIZE + 6,
              padding: "0 14px",
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: PD.fontUi,
              color: PD.textPrimary,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
              ...pdGlass({ borderRadius: 999 }),
              // The glass recipe owns `background`, so hover lifts it after the
              // spread rather than through the helper. Held lifted while open.
              background: (signInHover || open) && !busy ? PD.surfaceMutedHover : PD.glassBg,
              transition: "background 140ms ease",
            }}
          >
            <GoogleMark />
            {busy ? t("accountMenu.signInOpening") : t("accountMenu.signIn")}
          </button>
        </Tooltip>
        {/* Collapsed twin: same trigger, same accessible name (Tooltip still
            clones `label` on as aria-label), just the mark with no text — see
            SIGNIN_COLLAPSE_BREAK. Below that width the full pill's own text
            ("Sign in" / "התחברות") is what pushes it into the mode switcher's
            "View" tab, so the fix is to drop the text, not shrink the pill. */}
        <Tooltip label={t("accountMenu.signInTooltip")} placement="bottom">
          <button
            ref={compactTriggerRef}
            className="fp-signin-compact"
            onClick={() => {
              setAuthError(null);
              setOpen((v) => !v);
            }}
            disabled={busy}
            aria-haspopup="dialog"
            aria-expanded={open}
            {...signInHoverBind}
            style={{
              display: "none", // default/no-JS state; the media query above is what shows it
              alignItems: "center",
              justifyContent: "center",
              width: SIZE + 6,
              height: SIZE + 6,
              padding: 0,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
              ...pdGlass({ borderRadius: 999 }),
              background: (signInHover || open) && !busy ? PD.surfaceMutedHover : PD.glassBg,
              transition: "background 140ms ease",
            }}
          >
            <GoogleMark />
          </button>
        </Tooltip>
        {open && (
          <div
            role="dialog"
            aria-label={tc("panelLabel")}
            className={POP_IN_CLASS}
            style={{
              position: "absolute",
              top: SIZE + 14,
              insetInlineEnd: 0, // trailing edge — see the note on the error panel below
              width: 264,
              padding: 8,
              zIndex: 40,
              ...pdGlass({ borderRadius: PD.radiusM }),
            }}
          >
            <button
              ref={continueRef}
              className="fp-signin-go"
              onClick={() => {
                setBusy(true);
                void signInWithGoogle().catch(() => {
                  setBusy(false);
                  setOpen(false);
                });
              }}
              disabled={busy}
              {...continueHoverBind}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                height: 34,
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: PD.fontUi,
                color: PD.textPrimary,
                background: continueHover && !busy ? PD.surfaceMutedHover : PD.surfaceMuted,
                border: "none",
                borderRadius: PD.radiusS,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
                transition: "background 140ms ease",
              }}
            >
              <GoogleMark />
              {busy ? t("accountMenu.signInOpening") : tc("continue")}
            </button>
            <SignInConsent
              className="fp-signin-note"
              newTab
              linkColor={PD.textPrimary}
              style={{
                padding: "8px 4px 2px",
                fontSize: 11,
                lineHeight: 1.5,
                fontFamily: PD.fontUi,
                // Secondary, not tertiary: tertiary is under 4.5:1 even on an
                // opaque ground (docs/ACCESSIBILITY.md P2), and this is a
                // sentence people are agreeing to.
                color: PD.textSecondary,
              }}
            />
          </div>
        )}
        {authError && (
          <div
            role="alert"
            style={{
              position: "absolute",
              top: SIZE + 14,
              // Anchored to the button's TRAILING edge, so it opens back across
              // the screen rather than off it. Physical `right: 0` was correct
              // only while the button sat at the right of an LTR window; in
              // Hebrew the whole cluster is on the left and a right-anchored
              // panel would hang past the viewport edge.
              insetInlineEnd: 0,
              width: 264,
              padding: "10px 8px",
              zIndex: 40,
              ...pdGlass({ borderRadius: PD.radiusM }),
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <p
                style={{
                  flex: 1,
                  margin: 0,
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  fontFamily: PD.fontUi,
                  color: PD.textPrimary,
                }}
              >
                {t(
                  authError === "cancelled"
                    ? "accountMenu.signInErrorCancelled"
                    : "accountMenu.signInErrorFailed",
                )}
              </p>
              {/* Its own `aria-label`, more specific than a shared tooltip string
                  ("Dismiss sign-in error", not just "Dismiss") — same pattern as
                  ConsentNotice's DismissButton. */}
              <button
                type="button"
                className="fp-signin-dismiss"
                onClick={() => setAuthError(null)}
                aria-label={t("accountMenu.signInErrorDismiss")}
                {...dismissHoverBind}
                style={{
                  flex: "0 0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  background: dismissHover ? PD.surfaceMutedHover : "transparent",
                  color: dismissHover ? PD.textPrimary : PD.textTertiary,
                  cursor: "pointer",
                  borderRadius: PD.radiusS,
                  padding: 3,
                  transition: "background 140ms ease, color 140ms ease",
                }}
              >
                <CloseIcon size={14} />
              </button>
            </div>
            <button
              type="button"
              className="fp-signin-retry"
              onClick={retrySignIn}
              disabled={busy}
              {...retryHoverBind}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                height: 30,
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: PD.fontUi,
                color: PD.textPrimary,
                background: retryHover && !busy ? PD.surfaceMutedHover : PD.surfaceMuted,
                border: "none",
                borderRadius: PD.radiusS,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
                transition: "background 140ms ease",
              }}
            >
              {busy ? t("accountMenu.signInOpening") : t("accountMenu.signInRetry")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const name = displayName(user);
  const avatar = avatarUrl(user);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <PopInStyle />
      <Tooltip label={name} placement="bottom">
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          {...triggerHoverBind}
          // Deliberately "true" and not "menu": role="menu" would promise
          // arrow-key navigation and roving tabindex, which this popover does
          // not implement. It is a small panel of ordinary links and buttons,
          // and Tab reaches them in DOM order, so it is described as exactly
          // that rather than as a menu it would then fail to behave like.
          aria-haspopup="true"
          aria-expanded={open}
          style={{
            width: SIZE + 6,
            height: SIZE + 6,
            display: "grid",
            placeItems: "center",
            padding: 0,
            cursor: "pointer",
            overflow: "hidden",
            ...pdGlass({ borderRadius: 999 }),
            // An avatar fills the button, so the only surface hover can touch is
            // the ring around it.
            border: `1px solid ${triggerHover || open ? "oklch(1 0 0 / 0.28)" : "oklch(1 0 0 / 0.09)"}`,
            transition: "border-color 140ms ease",
          }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- a remote avatar of unknown host; next/image would need a domain allowlist per provider
            <img src={avatar} alt="" width={SIZE} height={SIZE} style={{ borderRadius: 999, display: "block" }} />
          ) : (
            <span aria-hidden style={{ fontSize: 13, fontWeight: 700, fontFamily: PD.fontUi, color: PD.textPrimary }}>
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        <div
          role="group"
          aria-label={t("accountMenu.account")}
          className={POP_IN_CLASS}
          style={{
            position: "absolute",
            top: SIZE + 14,
            insetInlineEnd: 0, // trailing edge — see the note on the error panel above
            minWidth: 208,
            padding: 6,
            zIndex: 40,
            ...pdGlass({ borderRadius: PD.radiusM }),
          }}
        >
          <div style={{ padding: "8px 10px 10px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: PD.textPrimary, fontFamily: PD.fontUi }}>{name}</div>
            {user.email && (
              <div
                style={{
                  fontSize: 11.5,
                  color: PD.textTertiary,
                  fontFamily: PD.fontUi,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email}
              </div>
            )}
            <div style={{ fontSize: 11, color: PD.textTertiary, fontFamily: PD.fontUi, marginTop: 8 }}>
              {t("accountMenu.savedToAccount")}
            </div>
          </div>
          {/* The data page (export + account deletion). Reachable from here
              because a right-to-erasure control nobody can find is not one. */}
          <MenuRow href="/account" onSelect={() => setOpen(false)}>
            {t("accountMenu.yourData")}
          </MenuRow>
          <MenuRow
            onSelect={() => {
              setOpen(false);
              void signOut();
            }}
          >
            {t("accountMenu.signOut")}
          </MenuRow>
        </div>
      )}
    </div>
  );
}

/** One row of the dropdown. The two rows were an `<a>` and a `<button>` with
 *  the same 14 style properties duplicated and no hover on either; this is that
 *  style once, with the flag. `href` picks the element — the data page is a
 *  real navigation and must stay a link. */
function MenuRow({
  href,
  onSelect,
  children,
}: {
  href?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const [hovered, hoverBind] = useHover();
  const style: React.CSSProperties = {
    display: "block",
    width: href ? undefined : "100%",
    textAlign: "start",
    padding: "8px 10px",
    marginBottom: 4,
    fontSize: 12.5,
    fontFamily: PD.fontUi,
    color: hovered ? PD.textPrimary : PD.textSecondary,
    background: hovered ? PD.surfaceMutedHover : PD.surfaceMuted,
    border: "none",
    borderRadius: PD.radiusS,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 140ms ease, color 140ms ease",
  };
  return href ? (
    <Link href={href} onClick={onSelect} {...hoverBind} style={style}>
      {children}
    </Link>
  ) : (
    <button onClick={onSelect} {...hoverBind} style={style}>
      {children}
    </button>
  );
}

/** Google's mark, inline so the sign-in button needs no network request. */
function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
      />
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.7z" />
      <path
        fill="#EA4335"
        d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.4 12.2-9.4z"
      />
    </svg>
  );
}
