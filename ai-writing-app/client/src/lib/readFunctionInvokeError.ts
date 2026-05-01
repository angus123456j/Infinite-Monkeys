/**
 * When a Supabase Edge Function returns 4xx, the JSON body may be on `data` or on `error.context` (Response).
 */

export type ParsedEdgeInvoke =
  | { kind: "quota_exceeded"; type?: string; used?: number; limit?: number }
  | { kind: "trial_quota_exceeded"; type?: "rewrite" | "scrutiny" }
  | { kind: "rate_limit"; bucket?: string }
  | {
      kind: "payload_too_large";
      maxBytes?: number;
      field?: string;
      maxChars?: number;
    };

async function parsedJsonFromInvoke(
  error: unknown,
  data: unknown,
): Promise<ParsedEdgeInvoke | null> {
  const asObj = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : null;

  const fromBody = (o: Record<string, unknown> | null): ParsedEdgeInvoke | null => {
    if (!o || typeof o.error !== "string") return null;

    if (o.error === "quota_exceeded") {
      return {
        kind: "quota_exceeded",
        type: typeof o.type === "string" ? o.type : undefined,
        used: typeof o.used === "number" ? o.used : undefined,
        limit: typeof o.limit === "number" ? o.limit : undefined,
      };
    }
    if (o.error === "trial_quota_exceeded") {
      const t = o.type;
      return {
        kind: "trial_quota_exceeded",
        type: t === "scrutiny" || t === "rewrite" ? t : "rewrite",
      };
    }
    if (o.error === "rate_limit") {
      return {
        kind: "rate_limit",
        bucket: typeof o.bucket === "string" ? o.bucket : undefined,
      };
    }
    if (o.error === "payload_too_large") {
      return {
        kind: "payload_too_large",
        maxBytes: typeof o.maxBytes === "number" ? o.maxBytes : undefined,
        field: typeof o.field === "string" ? o.field : undefined,
        maxChars: typeof o.maxChars === "number" ? o.maxChars : undefined,
      };
    }
    return null;
  };

  const fromData = fromBody(asObj(data));
  if (fromData) return fromData;

  if (error && typeof error === "object" && error !== null && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const j = asObj(await ctx.clone().json());
        return fromBody(j);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Parse quota, burst, or oversized-payload edges from invoke errors. */
export async function readEdgeInvokeParsed(
  error: unknown,
  data: unknown,
): Promise<ParsedEdgeInvoke | null> {
  return parsedJsonFromInvoke(error, data);
}

/**
 * Legacy helper: quota exceeded only (used where upgrade modal should open).
 */
export async function readQuotaExceededFromInvoke(
  error: unknown,
  data: unknown,
): Promise<{ type?: string; used?: number; limit?: number } | null> {
  const p = await parsedJsonFromInvoke(error, data);
  if (!p || p.kind !== "quota_exceeded") return null;
  return {
    type: p.type,
    used: p.used,
    limit: p.limit,
  };
}
