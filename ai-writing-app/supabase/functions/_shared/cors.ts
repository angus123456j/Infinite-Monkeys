/**
 * Mirror @supabase/supabase-js `cors` export (see dist/cors.mjs) so preflight matches
 * what the browser client sends. Older hand-rolled lists missed `x-retry-count` and
 * a full Allow-Methods list, which can make OPTIONS fail with a non-2xx check.
 * @see https://supabase.com/docs/guides/functions/cors
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-retry-count",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

export function corsPreflightResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}
