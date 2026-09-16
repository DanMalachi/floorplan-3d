// Entrance for small anchored popovers (account menus, sign-in panel).
//
// Same curve and distance as HomeColourPicker's `menuIn`, so every popover in
// the product arrives the same way. Shipped as an inline <style> rather than a
// globals.css keyframe so both the editor chrome and the marketing header can
// use it without either depending on the other's stylesheet; a duplicate
// <style> when both mount is harmless. The origin follows the TRAILING edge the
// panels are anchored to, so the scale grows out of the button in RTL too.
// Reduced motion gets no animation at all — the panel simply appears.

export const POP_IN_CLASS = "done-pop-in";

const CSS = `
@keyframes done-pop-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.${POP_IN_CLASS} { animation: done-pop-in 160ms cubic-bezier(0.22, 1, 0.36, 1); transform-origin: top right; }
[dir="rtl"] .${POP_IN_CLASS} { transform-origin: top left; }
@media (prefers-reduced-motion: reduce) { .${POP_IN_CLASS} { animation: none; } }
`;

export function PopInStyle() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
