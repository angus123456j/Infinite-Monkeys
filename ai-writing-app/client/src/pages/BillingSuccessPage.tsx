import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMySubscription, type SubscriptionTier } from "../lib/subscriptions";

function tierLabel(t: SubscriptionTier | null): string {
  if (!t || t === "free") return "Free";
  if (t === "pro") return "Pro";
  return "Infinite";
}

export default function BillingSuccessPage() {
  const navigate = useNavigate();
  // Stripe may append ?session_id=… to the return URL; we poll Supabase for tier instead of reading it.
  const [tier, setTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const sub = await getMySubscription();
        if (!mounted) return;
        setTier(sub?.tier ?? "free");
        const elapsed = Date.now() - startedAtRef.current;
        if ((sub?.tier ?? "free") !== "free") {
          setPolling(false);
          return;
        }
        if (elapsed > 25_000) {
          setPolling(false);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Could not confirm subscription.");
        setPolling(false);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 1500);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const upgraded = tier !== null && tier !== "free";

  return (
    <div className="signup-auth">
      <div className="signup-auth__inner">
        <div className="signup-auth__center">
          <div className="signup-auth__logo-wrap" aria-hidden>
            <img className="signup-auth__logo" src="/images/monkey.png" alt="" />
          </div>

          <h1 className="signup-auth__headline">Welcome to Infinite Monkeys</h1>

          <main className="signup-auth__card" aria-label="Subscription confirmed">
            <p style={{ margin: "0 0 1rem", lineHeight: 1.55 }}>
              {upgraded ? (
                <>
                  Your account is on the <strong>{tierLabel(tier)}</strong> tier. When you are ready, continue
                  to the Drive.
                </>
              ) : polling ? (
                <>
                  Payment succeeded. We’re confirming your plan in Infinite Monkeys—this usually takes a few
                  seconds.
                </>
              ) : (
                <>
                  Payment succeeded, but we couldn’t confirm your upgraded tier yet. You can still open the
                  Drive—if your tier looks wrong, wait a minute and refresh, then check Stripe webhook
                  deliveries.
                </>
              )}
            </p>

            <p className="signup-auth__hint" style={{ margin: "0 0 1rem" }}>
              Current tier:{" "}
              <strong>{tier !== null ? tierLabel(tier) : "…"}</strong>
              {polling && !upgraded ? (
                <span className="signup-auth__fine"> — checking…</span>
              ) : null}
            </p>

            {/* Keep this page focused on getting the user into the product. */}

            {error ? <p className="signup-auth__error">{error}</p> : null}

            <button
              type="button"
              className="signup-auth__primary"
              style={{ width: "100%" }}
              onClick={() => navigate("/drive", { replace: true })}
            >
              Enter the Drive
            </button>
          </main>
        </div>
      </div>
    </div>
  );
}
