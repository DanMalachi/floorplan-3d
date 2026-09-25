import { notFound } from "next/navigation";
import DoorShowroom from "./DoorShowroom";

/**
 * Dev-only door review room: the real wall/joinery builders, real
 * environment and tone mapping, with a row of interior doors and an entry
 * door whose looks can be swapped from the page (or from a capture script via
 * `window.__setLooks`). Not reachable on a production build.
 */
export default function DoorShowroomPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DoorShowroom />;
}
