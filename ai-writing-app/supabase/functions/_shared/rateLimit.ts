import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/** Per authenticated user — rewrite edge */
export const LIMIT_BURST_REWRITE_USER = 45;
/** Loose IP ceiling (NAT); runs only when a client IP is present */
export const LIMIT_BURST_REWRITE_IP = 300;

/** Per user — orchestrator-plan edge */
export const LIMIT_BURST_ORCHESTRATOR_USER = 15;
export const LIMIT_BURST_ORCHESTRATOR_IP = 120;

export const BUCKET_REWRITE_USER = "rewrite_user";
export const BUCKET_REWRITE_IP = "rewrite_ip_backstop";
export const BUCKET_ORCHESTRATOR_USER = "orchestrator_user";
export const BUCKET_ORCHESTRATOR_IP = "orchestrator_ip_backstop";

/** Selection / phrase (“text”) portion */
export const MAX_REWRITE_TEXT_CHARS = 52_000;
/** User instruction appended to prompts */
export const MAX_REWRITE_PROMPT_CHARS = 12_000;
/** Full sentence for synonym sense disambiguation */
export const MAX_REWRITE_SENTENCE_CTX_CHARS = 52_000;

export const MAX_ORCHESTRATOR_TEXT_CHARS = MAX_REWRITE_TEXT_CHARS;
export const MAX_ORCHESTRATOR_PROMPT_CHARS = MAX_REWRITE_PROMPT_CHARS;

function rateLimitResponse(bucket: string): Response {
  return new Response(
    JSON.stringify({ error: "rate_limit", type: "burst", bucket }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function burstAllowed(
  supabase: SupabaseClient,
  subjectKind: "user" | "ip",
  subjectId: string,
  bucket: string,
  limitPerMinute: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_rate_limit_burst", {
    p_subject_kind: subjectKind,
    p_subject_id: subjectId,
    p_bucket: bucket,
    p_limit_per_minute: limitPerMinute,
  });
  if (error) {
    console.warn(`[burst] RPC ${bucket} failed:`, error.message);
    return true;
  }
  return data !== false;
}

/** First publicly routable IPv4/v6-ish token from forwarded headers */
export function extractClientIp(req: Request): string | null {
  const direct = req.headers.get("cf-connecting-ip")?.trim();
  if (direct) return direct.slice(0, 128);

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }

  const real = req.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 128) : null;
}

export async function hashIpFingerprint(ip: string): Promise<string> {
  const enc = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 48);
}

/**
 * Burst limits beforeexpensive work. Fail-open only when the RPC fails.
 * @returns Response (429) if blocked, null if allowed
 */
export async function guardRewriteBursts(
  supabase: SupabaseClient,
  userId: string,
  req: Request,
): Promise<Response | null> {
  const userOk = await burstAllowed(
    supabase,
    "user",
    userId,
    BUCKET_REWRITE_USER,
    LIMIT_BURST_REWRITE_USER,
  );
  if (!userOk) return rateLimitResponse(BUCKET_REWRITE_USER);

  const rawIp = extractClientIp(req);
  if (rawIp) {
    const fingerprint = await hashIpFingerprint(rawIp);
    const ipOk = await burstAllowed(
      supabase,
      "ip",
      fingerprint,
      BUCKET_REWRITE_IP,
      LIMIT_BURST_REWRITE_IP,
    );
    if (!ipOk) return rateLimitResponse(BUCKET_REWRITE_IP);
  }

  return null;
}

export async function guardOrchestratorBursts(
  supabase: SupabaseClient,
  userId: string,
  req: Request,
): Promise<Response | null> {
  const userOk = await burstAllowed(
    supabase,
    "user",
    userId,
    BUCKET_ORCHESTRATOR_USER,
    LIMIT_BURST_ORCHESTRATOR_USER,
  );
  if (!userOk) return rateLimitResponse(BUCKET_ORCHESTRATOR_USER);

  const rawIp = extractClientIp(req);
  if (rawIp) {
    const fingerprint = await hashIpFingerprint(rawIp);
    const ipOk = await burstAllowed(
      supabase,
      "ip",
      fingerprint,
      BUCKET_ORCHESTRATOR_IP,
      LIMIT_BURST_ORCHESTRATOR_IP,
    );
    if (!ipOk) return rateLimitResponse(BUCKET_ORCHESTRATOR_IP);
  }

  return null;
}
