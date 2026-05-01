import type { Request } from "express";
import { createClient } from "@supabase/supabase-js";

const FIVE_H_MS = 5 * 3600 * 1000;

function trialBucketId(): number {
  return Math.floor(Date.now() / FIVE_H_MS);
}

export type ScrutinyTrialBlock = {
  status: 402;
  body: { error: string; type: string };
};

/**
 * For Supabase anonymous JWTs: consume one scrutiny slot in the current 5h bucket before ONNX runs.
 */
export async function enforceAnonymousScrutinyTrialQuota(
  req: Request,
): Promise<ScrutinyTrialBlock | null> {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return null;
  }

  const rawAuth = req.headers.authorization;
  if (!rawAuth || !rawAuth.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: rawAuth } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return null;
  }

  const user = userData.user;
  if (!user.is_anonymous) {
    return null;
  }

  const bucketId = trialBucketId();
  const { data: allowed, error: rpcErr } = await supabase.rpc("try_consume_anonymous_trial_scrutiny", {
    p_bucket_id: bucketId,
  });

  if (rpcErr) {
    console.error("[scrutiny] anonymous trial RPC:", rpcErr.message);
    return null;
  }

  if (allowed !== true) {
    return {
      status: 402,
      body: { error: "trial_quota_exceeded", type: "scrutiny" },
    };
  }

  return null;
}
