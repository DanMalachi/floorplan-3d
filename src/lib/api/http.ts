// Uniform error shape for every route handler. One body shape (`{ error, detail? }`)
// means the client never has to guess how a failure is spelled, and `detail` is the
// only place we ever put internals — so a route can stay quiet in production by
// simply not passing one.

export interface ApiErrorBody {
  error: string;
  detail?: string;
}

export function apiError(status: number, error: string, detail?: string): Response {
  const body: ApiErrorBody = detail ? { error, detail } : { error };
  return Response.json(body, { status });
}

export const badRequest = (error = "bad request", detail?: string) => apiError(400, error, detail);
export const unauthorized = (error = "sign in required", detail?: string) =>
  apiError(401, error, detail);
export const forbidden = (error = "forbidden", detail?: string) => apiError(403, error, detail);
export const payloadTooLarge = (error = "request too large", detail?: string) =>
  apiError(413, error, detail);
export const tooManyRequests = (error = "rate limit exceeded", retryAfterSec?: number) => {
  const res = apiError(429, error, retryAfterSec ? `retry in ${retryAfterSec}s` : undefined);
  if (retryAfterSec) res.headers.set("retry-after", String(Math.ceil(retryAfterSec)));
  return res;
};
export const unavailable = (error = "unavailable", detail?: string) => apiError(503, error, detail);

/** True only in a real deployment. Local `next dev` and tests are not production. */
export const isProduction = () => process.env.NODE_ENV === "production";

/** Best-effort caller IP for rate-limit keys. Vercel always sets x-forwarded-for. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
