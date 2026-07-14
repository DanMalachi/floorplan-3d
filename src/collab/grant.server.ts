// Server-only: sign/verify share grants with the Liveblocks secret as the HMAC
// key. Tamper-proof role links without a database — a user can't edit ?g= to
// upgrade "view" to "build" because they can't forge the signature. Import only
// from route handlers (never from client code — it reads process.env secret).

import crypto from "node:crypto";
import type { ShareRole } from "./share";

export interface GrantPayload {
  room: string; // the Liveblocks room this grant authorizes
  role: ShareRole;
}

const secret = () => process.env.LIVEBLOCKS_SECRET_KEY ?? "dev-unsafe-secret";
const b64 = (s: string) => Buffer.from(s).toString("base64url");

export function signGrant(p: GrantPayload): string {
  const body = b64(JSON.stringify(p));
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGrant(grant: string): GrantPayload | null {
  const [body, sig] = grant.split(".");
  if (!body || !sig) return null;
  const expect = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as GrantPayload;
  } catch {
    return null;
  }
}
