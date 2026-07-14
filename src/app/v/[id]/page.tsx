import type { Metadata } from "next";
import { CollabRoom } from "@/collab/CollabRoom";

// Share links shouldn't be indexed; give them a friendly unfurl (og image is the
// sibling opengraph-image.tsx).
export const metadata: Metadata = {
  title: "A live shared home design · Floorplan → 3D",
  description: "Open to explore this home in 3D — and design your own.",
  robots: { index: false, follow: false },
};

// Live collaborative room. The [id] is the Liveblocks room / share id.
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CollabRoom roomId={id} />;
}
