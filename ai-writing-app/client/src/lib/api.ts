/**
 * Base URL for the backend API.
 * - In dev, default is same-origin (`""`) so requests go through Vite's proxy; the proxy injects
 *   `X-Shared-Secret` from `server/.env` (see vite.config.ts). No `VITE_SHARED_SECRET` needed locally.
 * - Set `VITE_API_URL` to call the API directly (then set `VITE_SHARED_SECRET` to match the server).
 */
const raw = (import.meta.env.VITE_API_URL as string) ?? "";
const explicitApiUrl = raw.trim();
const useDevProxy = import.meta.env.DEV && !explicitApiUrl;

export const API_BASE = explicitApiUrl
  ? explicitApiUrl.replace(/\/$/, "")
  : useDevProxy
    ? ""
    : "http://localhost:3001";

/** When calling the API host directly (not via dev proxy), must match server `SHARED_SECRET`. */
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
