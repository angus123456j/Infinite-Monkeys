/**
 * HTTP client for the Scrutiny service only (`/api/scrutiny/*`).
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

const sendClientSecretHeader = Boolean(SHARED_SECRET) && !useDevProxy;

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sendClientSecretHeader ? { "X-Shared-Secret": SHARED_SECRET! } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
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
