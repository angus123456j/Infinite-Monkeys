/** Free tier caps (align with pricing copy). */
export const FREE_TIER_MAX_DOCUMENTS = 3;
export const FREE_TIER_MAX_CONTEXTS = 2;
/** Blank “New monkey” agents from Drive, not template copies (Logic/Pathos/Synonym Sensei saves). */
export const FREE_TIER_MAX_CUSTOM_MONKEYS = 1;
export const FREE_TIER_DAILY_SENTENCES = 100;
export const FREE_TIER_DAILY_SCRUTINY_SCANS = 2;
/** Output characters per “sentence” unit for rewrite quota (server matches). */
export const OUTPUT_CHARS_PER_SENTENCE = 75;

/** Pro tier caps (align with pricing copy). */
export const PRO_TIER_MAX_CONTEXTS = 10;
export const PRO_TIER_MAX_CUSTOM_MONKEYS = 10;
export const PRO_TIER_DAILY_SENTENCES = 1500;
export const PRO_TIER_DAILY_SCRUTINY_SCANS = 25;

export function dailySentenceLimitForTier(tier: "free" | "pro" | "infinite"): number | null {
  if (tier === "free") return FREE_TIER_DAILY_SENTENCES;
  if (tier === "pro") return PRO_TIER_DAILY_SENTENCES;
  return null;
}

export function dailyScrutinyLimitForTier(tier: "free" | "pro" | "infinite"): number | null {
  if (tier === "free") return FREE_TIER_DAILY_SCRUTINY_SCANS;
  if (tier === "pro") return PRO_TIER_DAILY_SCRUTINY_SCANS;
  return null;
}

export function contextLimitForTier(tier: "free" | "pro" | "infinite"): number | null {
  if (tier === "free") return FREE_TIER_MAX_CONTEXTS;
  if (tier === "pro") return PRO_TIER_MAX_CONTEXTS;
  return null;
}

export function customMonkeyLimitForTier(tier: "free" | "pro" | "infinite"): number | null {
  if (tier === "free") return FREE_TIER_MAX_CUSTOM_MONKEYS;
  if (tier === "pro") return PRO_TIER_MAX_CUSTOM_MONKEYS;
  return null;
}
