import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/**
 * Resolves the signed-in user from the request Authorization header (Supabase anon + JWT).
 * Use when edge functions have verify_jwt = false (so OPTIONS CORS preflights work) and
 * we still require auth for POST/GET work.
 */
export async function getAuthedUser(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<User | { error: string; status: number }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().includes("bearer")) {
    return { error: "Missing or invalid Authorization", status: 401 };
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }
  return data.user;
}

export function isAuthedError(
  u: User | { error: string; status: number },
): u is { error: string; status: number } {
  return "error" in u;
}

export function jsonError(
  message: string,
  status: number,
  details?: string,
): Response {
  return new Response(
    JSON.stringify({ error: message, ...(details ? { details: details.slice(0, 400) } : {}) }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
