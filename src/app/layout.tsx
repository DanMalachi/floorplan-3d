// The root layout is a pass-through. `<html>`, `<body>`, the fonts and the
// i18n provider all live one level down, in `[locale]/layout.tsx`, because the
// `lang` and `dir` attributes are per-locale and this layout does not know the
// locale — it sits above the segment that carries it.
//
// Next requires a root layout to exist; it does not require this one to render
// the document shell when a nested layout does. Everything user-facing is
// under `[locale]`, so that nested layout always runs.

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
