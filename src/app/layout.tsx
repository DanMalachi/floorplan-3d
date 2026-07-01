import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Floorplan → 3D",
  description: "Phase 1: trace a 2D plan into an editable 3D model",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
