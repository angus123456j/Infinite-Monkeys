import { requireUserId } from "./auth";
import { supabase } from "./supabase";

export type DailyUsageRow = {
  sentences_used: number;
  scrutiny_scans: number;
};

export function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyUsage(): Promise<DailyUsageRow> {
  const userId = await requireUserId();
  const date = todayUtcDateString();
  const { data, error } = await supabase
    .from("daily_usage")
    .select("sentences_used,scrutiny_scans")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    sentences_used: (data as { sentences_used?: number } | null)?.sentences_used ?? 0,
    scrutiny_scans: (data as { scrutiny_scans?: number } | null)?.scrutiny_scans ?? 0,
  };
}

export async function incrementScrutinyScans(): Promise<void> {
  const { error } = await supabase.rpc("increment_daily_scrutiny");
  if (error) throw new Error(error.message);
}
