import { corsHeaders } from "./cors.ts";

/**
 * Safely parse JSON from a request body.
 * Returns `{ body, error }` — if parsing fails, `error` is a ready-to-return Response.
 */
export async function parseJsonBody<T = Record<string, unknown>>(
  req: Request,
): Promise<{ body: T; error: null } | { body: null; error: Response }> {
  try {
    const body = await req.json();
    return { body: body as T, error: null };
  } catch {
    return {
      body: null,
      error: new Response(
        JSON.stringify({ error: "Invalid or missing JSON body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      ),
    };
  }
}
