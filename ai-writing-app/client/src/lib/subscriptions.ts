import { supabase } from "./supabase";
import { requireUserId } from "./auth";

export type SubscriptionTier = "free" | "pro" | "infinite";

export type SubscriptionRow = {
  user_id: string;
  tier: SubscriptionTier;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getMySubscription(): Promise<SubscriptionRow | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id,tier,stripe_customer_id,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SubscriptionRow | null) ?? null;
}

