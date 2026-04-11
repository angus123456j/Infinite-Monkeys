import type { AgentInvocationLogEntry } from "../components/AgentInvocationTimeline";

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/** Parse persisted JSON from the API into timeline entries. Drops invalid rows. */
export function parseMonkeyTimeline(raw: unknown): AgentInvocationLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentInvocationLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = num(o.id, NaN);
    if (!Number.isFinite(id)) continue;
    const at = num(o.at, Date.now());
    let status: AgentInvocationLogEntry["status"] =
      o.status === "done" || o.status === "error" || o.status === "loading"
        ? o.status
        : "error";
    if (status === "loading") {
      status = "error";
    }
    const wasLoading = o.status === "loading";
    const response =
      o.response === null || typeof o.response === "string" ? o.response : null;
    let error: string | null =
      o.error === null || typeof o.error === "string" ? o.error : null;
    if (wasLoading && status === "error" && !response && !error) {
      error = "Session ended before completion";
    }
    out.push({
      id,
      at,
      agentId: typeof o.agentId === "string" ? o.agentId : null,
      agentName: str(o.agentName, "Unknown"),
      contextLabels: strArr(o.contextLabels),
      userPrompt: str(o.userPrompt),
      apiPromptSent: str(o.apiPromptSent),
      originalText: str(o.originalText),
      response,
      error,
      status,
    });
  }
  return out;
}
