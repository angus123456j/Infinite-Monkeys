import { corsHeaders } from "./cors.ts";

export const MAX_BODY_BYTES_REWRITE = 512 * 1024;
export const MAX_BODY_BYTES_ORCHESTRATOR = 256 * 1024;

export function fieldTooLargeResponse(field: string, maxChars: number): Response {
  return new Response(
    JSON.stringify({
      error: "payload_too_large",
      type: "field",
      field,
      maxChars,
    }),
    {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function envelopeTooLargeResponse(maxBytes: number): Response {
  return new Response(
    JSON.stringify({
      error: "payload_too_large",
      type: "bytes",
      maxBytes,
    }),
    {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/**
 * Same as parseJsonBody, but rejects request bodies larger than maxBytes before JSON parse (abuse/backstop).
 */
export async function parseJsonBodyLimited<T = Record<string, unknown>>(
  req: Request,
  maxBytes: number,
): Promise<{ body: T; error: null } | { body: null; error: Response }> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    return { body: null, error: envelopeTooLargeResponse(maxBytes) };
  }
  try {
    const raw = new TextDecoder().decode(buf);
    const body = JSON.parse(raw) as T;
    return { body, error: null };
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
