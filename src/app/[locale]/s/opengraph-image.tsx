// The same branded card a long `/v/<id>` link unfurls with — it never drew the
// plan, so a short link loses nothing by sharing it. Config is restated rather
// than re-exported: Next reads `runtime` statically.
import Image from "../v/[id]/opengraph-image";

export const runtime = "nodejs";
export const alt = "A live shared home design — done.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default Image;
