import { supabase } from "./supabase";

export type PaidPlan = "pro" | "infinite";

async function getAccessToken(): Promise<string> {
  const { data: s1 } = await supabase.auth.getSession();
  let token = s1.session?.access_token ?? null;
  if (!token) {
    const { data: ref } = await supabase.auth.refreshSession();
    token = ref.session?.access_token ?? null;
  }
  return token ?? "";
}

/**
 * Creates a Stripe Checkout Session via Edge Function and redirects the browser.
 */
export async function redirectToStripeCheckout(plan: PaidPlan): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("Your session is still loading. Refresh the page and try again.");
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anon,
    },
    body: JSON.stringify({ plan, origin: window.location.origin }),
  });

  const txt = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(txt) as unknown;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const payload = parsed as { error?: string; details?: string } | null;
    const msg = payload?.error ?? `HTTP ${res.status}`;
    const details = payload?.details ? ` — ${payload.details}` : txt ? ` — ${txt.slice(0, 300)}` : "";
    throw new Error(`${msg}${details}`);
  }

  const checkoutUrl =
    parsed && typeof parsed === "object" && parsed !== null && "url" in parsed
      ? String((parsed as { url?: unknown }).url ?? "")
      : "";

  if (!checkoutUrl) throw new Error("Missing checkout URL");
  window.location.assign(checkoutUrl);
}
