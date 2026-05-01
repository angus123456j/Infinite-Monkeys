export class QuotaExceededError extends Error {
  readonly quotaType: string;
  readonly used?: number;
  readonly limit?: number;

  constructor(
    quotaType: string,
    opts?: { message?: string; used?: number; limit?: number },
  ) {
    super(opts?.message ?? "quota_exceeded");
    this.name = "QuotaExceededError";
    this.quotaType = quotaType;
    this.used = opts?.used;
    this.limit = opts?.limit;
  }
}

export function isQuotaExceededError(e: unknown): e is QuotaExceededError {
  return e instanceof QuotaExceededError;
}

/** Per-minute burst (429 rate_limit from edge functions) */
export class BurstRateLimitError extends Error {
  readonly bucket?: string;

  constructor(bucket?: string) {
    super(
      "Too many requests in a short period. Wait about a minute and try again.",
    );
    this.name = "BurstRateLimitError";
    this.bucket = bucket;
  }
}

export function isBurstRateLimitError(e: unknown): e is BurstRateLimitError {
  return e instanceof BurstRateLimitError;
}

/** Oversized payload (413 / 400 payload_too_large from edge functions) */
export class PayloadTooLargeError extends Error {
  readonly field?: string;

  constructor(opts?: { field?: string; maxChars?: number; maxBytes?: number }) {
    let msg = "Selection or prompt is larger than allowed for one request.";
    if (opts?.maxBytes != null) {
      msg = "Request is too large. Try reducing selection or prompts.";
    } else if (opts?.field) {
      msg = `The "${opts.field}" field is larger than allowed.`;
    }
    super(msg);
    this.name = "PayloadTooLargeError";
    this.field = opts?.field;
  }
}

export function isPayloadTooLargeError(e: unknown): e is PayloadTooLargeError {
  return e instanceof PayloadTooLargeError;
}

/** Anonymous / trial server quota (402 trial_quota_exceeded from edge or scrutiny API). */
export class TrialQuotaExceededError extends Error {
  readonly trialType: "rewrite" | "scrutiny";

  constructor(trialType: "rewrite" | "scrutiny") {
    super("trial_quota_exceeded");
    this.name = "TrialQuotaExceededError";
    this.trialType = trialType;
  }
}

export function isTrialQuotaExceededError(e: unknown): e is TrialQuotaExceededError {
  return e instanceof TrialQuotaExceededError;
}
