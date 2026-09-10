import type { ReactNode } from "react";

function Icon({ size = 26, children }: { size?: number; children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
export const LinearLightIcon = (p: { size?: number }) => <Icon {...p}><path d="M3 5h16v14h-3V8H3z" /><path d="M4 12v2m4-2v2m13 0h2m-2 4h2" /></Icon>;
export const GlobePendantIcon = (p: { size?: number }) => <Icon {...p}><path d="M8 2h8M12 2v7" /><circle cx="12" cy="15" r="6" /></Icon>;
export const DrumPendantIcon = (p: { size?: number }) => <Icon {...p}><path d="M8 2h8M12 2v7" /><ellipse cx="12" cy="10" rx="8" ry="2" /><path d="M4 10v9c0 3 16 3 16 0v-9" /></Icon>;
export const GlobeSconceIcon = (p: { size?: number }) => <Icon {...p}><path d="M3 4v16m0-8h6" /><circle cx="15" cy="12" r="6" /></Icon>;
export const BoxSconceIcon = (p: { size?: number }) => <Icon {...p}><path d="M3 4v16m0-8h6" /><rect x="9" y="4" width="10" height="16" rx="1" /></Icon>;
export const SquareLightIcon = (p: { size?: number }) => <Icon {...p}><path d="M3 3h18" /><rect x="5" y="4" width="14" height="5" rx="1" /><path d="M6 13l-2 4m8-4v5m6-5 2 4" /></Icon>;
