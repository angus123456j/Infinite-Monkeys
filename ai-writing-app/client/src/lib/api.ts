/** Base URL for the backend API. Server defaults to port 3001; set VITE_API_URL only if you run it elsewhere. */
const raw = (import.meta.env.VITE_API_URL as string) ?? "";
export const API_BASE =
  raw.trim() ? raw.replace(/\/$/, "") : "http://localhost:3001";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
