import { getSupabase } from "@/lib/supabase/client";
import type { ProjectState } from "./projectDoc";

// -----------------------------------------------------------------------------
// The cloud side of a project: one table row per gallery card, one row per
// document, and the two big base64 strings in storage buckets.
//
// This module is data access only — what to push and when is syncEngine's job.
// Every function returns null / false rather than throwing when there is no
// session or no Supabase, because being signed out is a normal state here.
// -----------------------------------------------------------------------------

const PLANS = "plans";
const THUMBS = "thumbs";

export interface RemoteProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  rev: number;
  planImagePath: string | null;
  planImageHash: string | null;
  thumbPath: string | null;
  liveRoomId: string | null;
  liveRole: string | null;
}

interface RemoteRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  rev: number;
  plan_image_path: string | null;
  plan_image_hash: string | null;
  thumb_path: string | null;
  live_room_id: string | null;
  live_role: string | null;
}

const toRemote = (r: RemoteRow): RemoteProject => ({
  id: r.id,
  name: r.name,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
  rev: Number(r.rev),
  planImagePath: r.plan_image_path,
  planImageHash: r.plan_image_hash,
  thumbPath: r.thumb_path,
  liveRoomId: r.live_room_id,
  liveRole: r.live_role,
});

/** Every project on this account, newest first. Null means "couldn't reach the server". */
export async function listRemote(): Promise<RemoteProject[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,created_at,updated_at,rev,plan_image_path,plan_image_hash,thumb_path,live_room_id,live_role")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) return null;
  return (data as RemoteRow[]).map(toRemote);
}

export async function pullDoc(projectId: string): Promise<{ state: ProjectState; rev: number } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("project_docs")
    .select("state,rev")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return { state: data.state as ProjectState, rev: Number(data.rev) };
}

export interface PushArgs {
  id: string;
  expectedRev: number;
  name: string;
  state: ProjectState;
  schemaVersion: number;
  planImagePath?: string | null;
  planImageHash?: string | null;
  thumbPath?: string | null;
  liveRoomId?: string | null;
  liveRole?: string | null;
  createdAt?: number;
}

export interface PushResult {
  rev: number;
  /** True when the server had moved past `expectedRev` — this push wrote nothing. */
  conflict: boolean;
}

/**
 * Write a project, but only if the server is still at `expectedRev`. The check
 * and the write happen inside one Postgres function, so two devices pushing at
 * the same moment can't interleave into a half-updated project.
 */
export async function pushProject(args: PushArgs): Promise<PushResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("push_project", {
    p_id: args.id,
    p_expected_rev: args.expectedRev,
    p_name: args.name,
    p_state: args.state,
    p_schema_version: args.schemaVersion,
    p_plan_image_path: args.planImagePath ?? null,
    p_plan_image_hash: args.planImageHash ?? null,
    p_thumb_path: args.thumbPath ?? null,
    p_live_room_id: args.liveRoomId ?? null,
    p_live_role: args.liveRole ?? null,
    p_created_at: args.createdAt ? new Date(args.createdAt).toISOString() : null,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { rev: Number(row.rev), conflict: Boolean(row.conflict) };
}

/** Soft delete, so the user's other devices learn the project is gone. */
export async function softDeleteRemote(projectId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", projectId);
  return !error;
}

// ---- storage ----------------------------------------------------------------

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Data URLs are base64, which is a third bigger than the bytes they encode.
 * Uploading the decoded blob keeps both the bill and the transfer honest.
 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const head = /^data:([^;,]+)(;base64)?,/.exec(dataUrl);
  if (!head) return null;
  const mime = head[1];
  const body = dataUrl.slice(head[0].length);
  if (!head[2]) return new Blob([decodeURIComponent(body)], { type: mime });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function upload(bucket: string, path: string, dataUrl: string): Promise<string | null> {
  const supabase = getSupabase();
  const blob = dataUrlToBlob(dataUrl);
  if (!supabase || !blob) return null;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: blob.type,
  });
  return error ? null : path;
}

async function download(bucket: string, path: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return blobToDataUrl(data);
}

// The first path segment is the user id, which is also what the storage policy
// checks — so a path is self-describing about who owns it.
export async function uploadPlanImage(userId: string, projectId: string, dataUrl: string): Promise<string | null> {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/png";
  return upload(PLANS, `${userId}/${projectId}.${EXT[mime] ?? "png"}`, dataUrl);
}

export const downloadPlanImage = (path: string): Promise<string | null> => download(PLANS, path);

export async function uploadThumb(userId: string, projectId: string, dataUrl: string): Promise<string | null> {
  return upload(THUMBS, `${userId}/${projectId}.jpg`, dataUrl);
}

export const downloadThumb = (path: string): Promise<string | null> => download(THUMBS, path);
