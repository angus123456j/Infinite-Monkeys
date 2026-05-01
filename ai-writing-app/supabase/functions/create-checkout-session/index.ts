import Stripe from "npm:stripe@16.1.0";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { getAuthedUser, isAuthedError, jsonError } from "../_shared/jwtUser.ts";
import { parseJsonBody } from "../_shared/request.ts";

type Plan = "pro" | "infinite";

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
  const pricePro = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
  const priceInfinite = Deno.env.get("STRIPE_PRICE_INFINITE") ?? "";
  if (!stripeSecretKey || !pricePro || !priceInfinite) {
    return jsonError("Missing Stripe configuration", 500);
  }

  const { body, error: parseErr } = await parseJsonBody(req);
  if (parseErr) return parseErr;

  const planRaw = (body as Record<string, unknown>).plan;
  const plan: Plan | null =
    planRaw === "pro" || planRaw === "infinite" ? planRaw : null;
  if (!plan) {
    return jsonError("Missing or invalid 'plan' (pro|infinite)", 400);
  }

  const originRaw = (body as Record<string, unknown>).origin;
  const origin =
    typeof originRaw === "string" && originRaw.startsWith("http")
      ? originRaw
      : (req.headers.get("origin") || "");
  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    return jsonError("Missing origin (send { origin: window.location.origin })", 400);
  }

  const priceId = plan === "pro" ? pricePro : priceInfinite;

  const stripe = new Stripe(stripeSecretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2024-06-20",
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/drive?checkout=cancel`,
      billing_address_collection: "required",
      allow_promotion_codes: true,
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
        },
      },
      metadata: {
        user_id: user.id,
        plan,
      },
    });

    if (!session.url) {
      return jsonError("Stripe session created but no URL returned", 500);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("Failed to create checkout session", 500, msg);
  }
});

