// Ceilings on what the importer will even attempt to parse.
//
// Imports run in the user's own browser, so the only victim of an oversized or
// hostile file is the person who chose it (or was talked into opening it) — but a
// tab that hangs on a decompression bomb, or a multi-hundred-megabyte data URL
// pushed into IndexedDB and then to cloud sync, is still a broken product and a
// storage bill. These are abuse ceilings well above any real floor plan: a scanned
// A0 sheet is tens of megabytes and a few thousand pixels.
//
// The byte cap is checked BEFORE the file is read at all; the pixel cap is checked
// as soon as the browser reports the decoded size, before the image is stored,
// rendered or synced.

export const MAX_IMPORT_BYTES = 60 * 1024 * 1024;
export const MAX_IMPORT_MB = 60;
/** Longest edge of a raster plan. The PDF path already caps its own render at 3000. */
export const MAX_IMAGE_EDGE_PX = 12_000;

export const exceedsImportBytes = (file: { size: number }) => file.size > MAX_IMPORT_BYTES;
export const exceedsImageEdge = (img: { width: number; height: number }) =>
  Math.max(img.width, img.height) > MAX_IMAGE_EDGE_PX;
