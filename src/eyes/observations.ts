// EYES layer — observation contract (see [[eyes-brain-split]]).
//
// The eyes emit a flat list of visual-primitive observations recovered from the
// raster, each UNLABELED and carrying a perception confidence. They attach zero
// architectural MEANING: a Text observation says "this string is here", never
// "this is a balcony / room label / level marker". Turning observations into
// structure is the interpreter's job; deciding what they mean is the brain's.
//
// This file currently defines only the TEXT channel (the first one built —
// pure OCR). Stroke / ElementCandidate / Region / Symbol / Boundary land here
// as their channels come online. All geometry is in ORIGINAL image-px, which is
// the same space the trace/editor lives in, so no coordinate conversion.

/** Script of an OCR string by Unicode range — describes the glyphs, not meaning. */
export type TextScript = "hebrew" | "latin" | "digit" | "mixed" | "other";

/** One OCR observation: a string and where it sits. Nothing more. */
export interface TextObservation {
  /** Axis-aligned box [x0, y0, x1, y1] in original image px. */
  bbox: [number, number, number, number];
  /** The recognized string, verbatim. No normalization, no interpretation. */
  text: string;
  /** Script tag derived from Unicode ranges (optional — absent if not computed). */
  script?: TextScript;
  /** Perception confidence in [0, 1]. */
  confidence: number;
}

/**
 * Output of the raster OCR channel (`scripts/ocr_raster.py`). The `engine` is
 * pluggable behind this contract (surya offline / tesseract shippable), so
 * downstream code never depends on which reader produced the observations.
 */
export interface OcrObservations {
  /** [width, height] of the source image in px. */
  imageSize: [number, number];
  /** Source filename (provenance only). */
  source: string;
  /** Which OCR engine produced these observations. */
  engine: "surya" | "tesseract";
  texts: TextObservation[];
}
