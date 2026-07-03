import type { RasterProposal } from "./rasterCandidates";

// POST the loaded plan image to the serverless CV proposer (Phase 3 M2 python).
// Returns rough wall centerlines in the image's natural px space — the same
// space the trace lives in, so no coordinate conversion is needed.
export async function proposeRaster(imageSrc: string): Promise<RasterProposal> {
  const res = await fetch("/api/propose-raster", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: imageSrc }),
  });
  const j = (await res.json()) as RasterProposal & { error?: string; detail?: string };
  if (!res.ok || j.error) {
    throw new Error(j.error ? `${j.error}${j.detail ? `: ${j.detail}` : ""}` : `HTTP ${res.status}`);
  }
  return j;
}
