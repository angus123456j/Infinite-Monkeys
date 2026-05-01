import Stripe from "npm:stripe@16.1.0";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { getAuthedUser, isAuthedError, jsonError } from "../_shared/jwtUser.ts";
import { parseJsonBody } from "../_shared/request.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Server misconfiguration", 500);
  }

  const userResult = await getAuthedUser(req, supabaseUrl, supabaseAnonKey);
  if (isAuthedError(userResult)) {
    return jsonError(userResult.error, userResult.status);
  }
  const user = userResult;

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeSecretKey) {
    return jsonError("Missing Stripe configuration", 500);
  }

  const { body, error: parseErr } = await parseJsonBody(req);
  if (parseErr) return parseErr;

  const originRaw = (body as Record<string, unknown>).origin;
  const origin =
    typeof originRaw === "string" && originRaw.startsWith("http")
      ? originRaw
      : (req.headers.get("origin") || "");
  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    return jsonError("Missing origin (send { origin: window.location.origin })", 400);
  }

  const supabase = createServiceClient();
  const { data: subRow, error: subErr } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (subErr) {
    return jsonError("Failed to load subscription", 500, subErr.message);
  }

  let customerId =
    (subRow as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ??
    null;

  const stripe = new Stripe(stripeSecretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2024-06-20",
  });

  if (!customerId && user.email) {
    const list = await stripe.customers.list({ email: user.email, limit: 3 });
    customerId = list.data[0]?.id ?? null;
    if (customerId) {
      await supabase
        .from("subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);
    }
  }

  if (!customerId) {
    return jsonError(
      "No Stripe customer on file yet. Complete checkout once, then try again.",
      400,
    );
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/drive`,
    });

    if (!portal.url) {
      return jsonError("Portal session created but no URL returned", 500);
    }

    return new Response(JSON.stringify({ url: portal.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("Failed to create billing portal session", 500, msg);
  }
});
