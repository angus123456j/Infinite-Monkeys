import Stripe from "npm:stripe@16.1.0";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function tierForPriceId(priceId: string, pro: string, infinite: string): "pro" | "infinite" | null {
  if (priceId === pro) return "pro";
  if (priceId === infinite) return "infinite";
  return null;
}

function customerIdString(
  c: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!c) return null;
  if (typeof c === "string") return c;
  if (c.deleted) return null;
  return c.id;
}

/** Prefer subscription metadata; fall back to matching Stripe customer id in DB. */
async function resolveUserIdForStripeSubscription(
  sub: Stripe.Subscription,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<string | null> {
  const fromMeta = (sub.metadata?.user_id as string | undefined)?.trim();
  if (fromMeta) return fromMeta;

  const cus = customerIdString(sub.customer);
  if (!cus) return null;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", cus)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { user_id: string }).user_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const pricePro = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
  const priceInfinite = Deno.env.get("STRIPE_PRICE_INFINITE") ?? "";
  if (!stripeSecretKey || !webhookSecret || !pricePro || !priceInfinite) {
    return json(500, { error: "Missing Stripe configuration" });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json(400, { error: "Missing stripe-signature header" });

  const rawBody = await req.text();
  const stripe = new Stripe(stripeSecretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2024-06-20",
  });

  let event: Stripe.Event;
  try {
    const cryptoProvider = Stripe.createSubtleCryptoProvider();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(400, { error: "Invalid signature", details: msg.slice(0, 200) });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = (session.metadata?.user_id as string | undefined) ?? null;
      if (!userId) return json(200, { received: true, ignored: "missing_user_id" });

      // Retrieve full session with line items to determine which plan was purchased.
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items.data.price"],
      });
      const line = full.line_items?.data?.[0];
      const priceId = (line?.price as any)?.id as string | undefined;
      if (!priceId) return json(200, { received: true, ignored: "missing_price" });

      const tier = tierForPriceId(priceId, pricePro, priceInfinite);
      if (!tier) return json(200, { received: true, ignored: "unknown_price" });

      const cus = customerIdString(
        session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null,
      );

      const supabase = createServiceClient();
      const { error } = await supabase
        .from("subscriptions")
        .update({
          tier,
          ...(cus ? { stripe_customer_id: cus } : {}),
        })
        .eq("user_id", userId);
      if (error) return json(500, { error: "Failed to update subscription", details: error.message });

      return json(200, { received: true, userId, tier });
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const supabase = createServiceClient();
      const userId = await resolveUserIdForStripeSubscription(sub, supabase);
      if (!userId) return json(200, { received: true, ignored: "missing_user_id" });

      const status = sub.status;

      if (
        status === "canceled" ||
        status === "unpaid" ||
        status === "incomplete_expired"
      ) {
        const { error } = await supabase
          .from("subscriptions")
          .update({ tier: "free" })
          .eq("user_id", userId);
        if (error) {
          return json(500, { error: "Failed to downgrade subscription", details: error.message });
        }
        return json(200, { received: true, userId, tier: "free" });
      }

      const priceId = sub.items?.data?.[0]?.price?.id;
      if (!priceId) return json(200, { received: true, ignored: "missing_price" });

      const tier = tierForPriceId(priceId, pricePro, priceInfinite);

      if (status === "active" || status === "trialing") {
        if (!tier) return json(200, { received: true, ignored: "unknown_price" });
        const cus = customerIdString(sub.customer);
        const { error } = await supabase
          .from("subscriptions")
          .update({
            tier,
            ...(cus ? { stripe_customer_id: cus } : {}),
          })
          .eq("user_id", userId);
        if (error) {
          return json(500, { error: "Failed to update subscription", details: error.message });
        }
        return json(200, { received: true, userId, tier });
      }

      return json(200, { received: true, ignored: `status_${status}` });
    }

    if (
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const supabase = createServiceClient();
      const userId = await resolveUserIdForStripeSubscription(sub, supabase);
      if (!userId) return json(200, { received: true, ignored: "missing_user_id" });
      const { error } = await supabase
        .from("subscriptions")
        .update({ tier: "free" })
        .eq("user_id", userId);
      if (error) return json(500, { error: "Failed to downgrade subscription", details: error.message });
      return json(200, { received: true, userId, tier: "free" });
    }

    // Other events are acknowledged but ignored for now.
    return json(200, { received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(500, { error: "Webhook handler failed", details: msg.slice(0, 400) });
  }
});

