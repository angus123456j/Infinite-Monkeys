/**
 * HTTP client for the Scrutiny service (`/api/scrutiny/*`).
 * Rewrite, orchestrator, and agent search use Supabase Edge Functions.
 *
 * - Dev: Vite proxies `/api/scrutiny` → localhost:3001 and can inject X-Shared-Secret from server/.env.
 * - Production: set `VITE_API_URL` to your deployed scrutiny base URL (no trailing slash),
 *   and `VITE_SHARED_SECRET` if the service requires it.
 */
const raw = (import.meta.env.VITE_API_URL as string) ?? "";
const explicitApiUrl = raw.trim();
const useDevProxy = import.meta.env.DEV && !explicitApiUrl;

export const API_BASE = explicitApiUrl
  ? explicitApiUrl.replace(/\/$/, "")
  : useDevProxy
    ? ""
    : "http://localhost:3001";

const SHARED_SECRET = (import.meta.env.VITE_SHARED_SECRET as string | undefined)?.trim();

export class ScrutinyTrialQuotaError extends Error {
  constructor() {
    super("trial_quota_exceeded");
    this.name = "ScrutinyTrialQuotaError";
  }
}

const sendClientSecretHeader = Boolean(SHARED_SECRET) && !useDevProxy;

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  // #region agent log
  {
    let urlHost = "";
    try {
      urlHost = new URL(url).host;
    } catch {
      /* ignore */
    }
    fetch("http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6fdb8f" },
      body: JSON.stringify({
        sessionId: "6fdb8f",
        hypothesisId: "H1",
        location: "client/src/lib/api.ts:apiFetch",
        message: "api_fetch_before",
        data: {
          path,
          urlHost,
          hasApiBase: Boolean(explicitApiUrl),
          pageOrigin: typeof window !== "undefined" ? window.location.origin : "",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(sendClientSecretHeader ? { "X-Shared-Secret": SHARED_SECRET! } : {}),
        ...options?.headers,
      },
    });
  } catch (e: unknown) {
    // #region agent log
    const err =
      e instanceof Error
        ? { name: e.name, message: e.message }
        : { name: "unknown", message: String(e) };
    fetch("http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6fdb8f" },
      body: JSON.stringify({
        sessionId: "6fdb8f",
        hypothesisId: "H4",
        location: "client/src/lib/api.ts:apiFetch",
        message: "api_fetch_network_error",
        data: { path, ...err },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw e;
  }
  // #region agent log
  if (!res.ok) {
    fetch("http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6fdb8f" },
      body: JSON.stringify({
        sessionId: "6fdb8f",
        hypothesisId: "H5",
        location: "client/src/lib/api.ts:apiFetch",
        message: "api_fetch_http_error",
        data: { path, status: res.status, statusText: res.statusText },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  if (!res.ok) {
    if (res.status === 402) {
      let j: { error?: string } = {};
      try {
        j = (await res.clone().json()) as { error?: string };
      } catch {
        /* ignore */
      }
      if (j.error === "trial_quota_exceeded") {
        throw new ScrutinyTrialQuotaError();
      }
    }
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: string;
    };
    const msg =
      err.error && err.details
        ? `${err.error} — ${err.details}`
        : err.error || `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
