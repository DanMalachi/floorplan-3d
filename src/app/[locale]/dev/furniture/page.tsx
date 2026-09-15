import { notFound } from "next/navigation";
import FurnitureReview from "./FurnitureReview";

/**
 * Dev-only furniture review scene: every SOURCED catalog model (BlenderKit,
 * Poly Haven, Sketchfab, Poly Pizza — nothing parametric) on one floor, 40 cm
 * apart, with approve/reject per item. Not reachable on a production build.
 */
export default function FurnitureReviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FurnitureReview />;
}
