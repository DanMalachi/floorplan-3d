import { idbDel, idbGet, idbSet } from "./idb";

// -----------------------------------------------------------------------------
// Side stores for a project's two big base64 strings: the imported plan image and
// the gallery thumbnail. Both used to ride inside the things that are written on
// every autosave tick (the document and the manifest), which meant a 600ms editing
// loop rewrote megabytes it had not touched. Each now has its own key, written
// only when it actually changes.
//
//   image:<projectId>   → data URL of the imported plan (multi-MB, read on open)
//   thumb:<projectId>   → small JPEG data URL of the 3D view (read once at boot)
// -----------------------------------------------------------------------------

const imageKey = (id: string) => `image:${id}`;
const thumbKey = (id: string) => `thumb:${id}`;

export const getPlanImage = (id: string): Promise<string | null> => idbGet<string>(imageKey(id));
export const setPlanImage = (id: string, src: string): Promise<void> => idbSet(imageKey(id), src);
export const deletePlanImage = (id: string): Promise<void> => idbDel(imageKey(id));

export const getThumb = (id: string): Promise<string | null> => idbGet<string>(thumbKey(id));
export const setThumb = (id: string, dataUrl: string): Promise<void> => idbSet(thumbKey(id), dataUrl);
export const deleteThumb = (id: string): Promise<void> => idbDel(thumbKey(id));
