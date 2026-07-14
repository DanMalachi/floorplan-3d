import { CollabRoom } from "@/collab/CollabRoom";

// Shared read-only (S1) live room. The [id] is the Liveblocks room / share id.
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CollabRoom roomId={id} />;
}
