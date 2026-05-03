/**
 * Public "Start writing" trial: one rewrite + one scrutiny scan per browser
 * session. No Supabase user is created. Refresh resets the counters; we accept
 * that tradeoff (one wasted call per refresh on a single sentence is fine).
 *
 * Backend: `rewrite-demo` Supabase Edge Function (no JWT) and the
 * `/api/scrutiny/detect-demo` Express route on the scrutiny service.
 */
import { API_BASE } from "./api";

const TRIAL_REWRITE_KEY = "im-trial-rewrite-used";
const TRIAL_SCRUTINY_KEY = "im-trial-scrutiny-used";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getFlag(key: string): boolean {
  const s = safeStorage();
  return s?.getItem(key) === "1";
}

function setFlag(key: string): void {
  const s = safeStorage();
  try {
    s?.setItem(key, "1");
  } catch {
    /* sessionStorage can throw in private mode; refresh path still gated by network rate limits */
  }
}

export function hasUsedTrialRewrite(): boolean {
  return getFlag(TRIAL_REWRITE_KEY);
}

export function markTrialRewriteUsed(): void {
  setFlag(TRIAL_REWRITE_KEY);
}

export function hasUsedTrialScrutiny(): boolean {
  return getFlag(TRIAL_SCRUTINY_KEY);
}

export function markTrialScrutinyUsed(): void {
  setFlag(TRIAL_SCRUTINY_KEY);
}

/**
 * POST {text, prompt} to the unauthenticated rewrite-demo edge function.
 * The Supabase platform still expects the apikey header to route the request,
 * but no JWT (no Authorization header) is required.
 */
export async function callTrialDemoRewrite(args: {
  text: string;
  prompt: string;
  llmProvider?: "auto" | "gemini" | "deepseek";
}): Promise<{ rewrite: string }> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!supabaseUrl || !anon) {
    throw new Error("Demo rewrite is not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY).");
  }

  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/rewrite-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({
      text: args.text,
      prompt: args.prompt,
      llmProvider: args.llmProvider ?? "auto",
    }),
  });

  if (!res.ok) {
    let payload: { error?: string; details?: string } = {};
    try {
      payload = (await res.json()) as { error?: string; details?: string };
    } catch {
      /* ignore */
    }
    const msg = payload.error
      ? payload.details
        ? `${payload.error} — ${payload.details}`
        : payload.error
      : `Demo rewrite failed: HTTP ${res.status}`;
    throw new Error(msg);
  }

  return (await res.json()) as { rewrite: string };
}

/**
 * POST {text, mode} to the unauthenticated /api/scrutiny/detect-demo route on
 * the scrutiny Express service. Returns the same payload shape as the
 * authenticated /api/scrutiny/detect endpoint.
 */
export async function callTrialDemoScrutiny<T = unknown>(args: {
  text: string;
  mode: "selection" | "document";
}): Promise<T> {
  const url = `${API_BASE}/api/scrutiny/detect-demo`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: args.text, mode: args.mode }),
  });

  if (!res.ok) {
    let payload: { error?: string; details?: string } = {};
    try {
      payload = (await res.json()) as { error?: string; details?: string };
    } catch {
      /* ignore */
    }
    const msg = payload.error
      ? payload.details
        ? `${payload.error} — ${payload.details}`
        : payload.error
      : `Demo scrutiny failed: HTTP ${res.status}`;
    throw new Error(msg);
  }

  return (await res.json()) as T;
}
