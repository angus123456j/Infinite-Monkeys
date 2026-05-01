import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getMySubscription, type SubscriptionTier } from "../lib/subscriptions";
import { redirectToStripeCheckout, type PaidPlan } from "../lib/checkout";

type Plan = PaidPlan;

const TIERS = [
  {
    id: "free" as const,
    name: "Free",
    monthlyPrice: 0,
    showDollar: true,
    priceSub: "per month",
    annualPrice: null as number | null,
    blurb: "Perfect for small experiments and lightweight drafting.",
    features: [
      "Documents: 3",
      "Context books: 2",
      "Saved custom monkeys: 1",
      "Template monkeys: Included",
      "Custom monkey creation: Limited",
      "Daily writing assistance: Up to 100 assisted sentences/day",
      "Rewrite tools: Limited daily access",
      "Orchestrator usage: Limited",
      "Scrutiny checks: Limited",
      "Future premium features: —",
    ],
    footer: "No credit card required.",
  },
  {
    id: "pro" as const,
    name: "Pro",
    monthlyPrice: 12,
    showDollar: true,
    priceSub: "per month",
    annualPrice: 96,
    blurb: "Built for consistent writing weeks and deeper iteration.",
    features: [
      "Documents: Unlimited",
      "Context books: 10",
      "Saved custom monkeys: 10",
      "Template monkeys: Included",
      "Custom monkey creation: Full access",
      "Daily writing assistance: Up to 1,500 assisted sentences/day",
      "Rewrite tools: Extended daily access",
      "Orchestrator usage: Full access",
      "Scrutiny checks: Extended",
      "Future premium features: Included",
    ],
    footer: "Cancel any time.",
  },
  {
    id: "infinite" as const,
    name: "Infinite",
    monthlyPrice: 24,
    showDollar: true,
    priceSub: "per month",
    annualPrice: 192,
    blurb: "Built for sustained long-form writing and high usage.",
    features: [
      "Documents: Unlimited",
      "Context books: Unlimited",
      "Saved custom monkeys: Unlimited",
      "Template monkeys: Included",
      "Custom monkey creation: Full access",
      "Daily writing assistance: Built for sustained long-form writing",
      "Rewrite tools: Priority access",
      "Orchestrator usage: Full access",
      "Scrutiny checks: High usage",
      "Future premium features: Priority first access",
    ],
    footer: "Priority first access as new features land.",
  },
] as const;

type TierCard = (typeof TIERS)[number];

const TILT_MAX_DEG = 4.25;
const PERSPECTIVE = 980;

function useFinePointerHover(): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return ok;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function canUpgrade(current: SubscriptionTier, target: TierCard["id"]): boolean {
  if (target === "free") return false;
  if (current === "infinite") return false;
  if (target === "pro") return current === "free";
  // target === "infinite"
  return current === "free" || current === "pro";
}

function BillingTierPanel({
  tier,
  currentTier,
  checkoutLoading,
  onUpgrade,
}: {
  tier: TierCard;
  currentTier: SubscriptionTier | null;
  checkoutLoading: Plan | null;
  onUpgrade: (plan: Plan) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const finePointer = useFinePointerHover();
  const allowTilt = finePointer && !reducedMotion;
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const rafRef = useRef<number | null>(null);

  const isCurrent = currentTier != null && currentTier === tier.id;
  const showUpgrade = currentTier != null && canUpgrade(currentTier, tier.id);

  const applyTilt = useCallback(
    (clientX: number, clientY: number) => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (clientX - cx) / (rect.width / 2);
      const dy = (clientY - cy) / (rect.height / 2);
      const rx = Math.max(-1, Math.min(1, -dy)) * TILT_MAX_DEG;
      const ry = Math.max(-1, Math.min(1, dx)) * TILT_MAX_DEG;
      setTilt({ rx, ry });
    },
    [],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!allowTilt) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyTilt(e.clientX, e.clientY);
      });
    },
    [applyTilt, allowTilt],
  );

  const onMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setTilt({ rx: 0, ry: 0 });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const tiltStyle: CSSProperties = allowTilt
    ? {
        transform: `perspective(${PERSPECTIVE}px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transformStyle: "preserve-3d" as const,
      }
    : {};

  const annualSavingsPct =
    tier.annualPrice === null
      ? null
      : Math.max(
          0,
          Math.round(100 - (tier.annualPrice / Math.max(1, tier.monthlyPrice * 12)) * 100),
        );

  return (
    <div
      ref={wrapRef}
      className={`signup-glass-tilt${allowTilt ? "" : " signup-glass-tilt--static"}`}
      style={tiltStyle}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <article className={`signup-glass signup-glass--${tier.id}`}>
        <h2 className="signup-glass__name">{tier.name}</h2>

        {tier.id === "free" ? null : (
          <div className="signup-glass__price-block">
            {tier.annualPrice !== null ? (
              <div className="signup-glass__annual">
                <p className="signup-glass__annual-label">Annual</p>
                <p className="signup-glass__annual-price">
                  {tier.showDollar ? (
                    <span className="signup-glass__annual-symbol" aria-hidden>
                      $
                    </span>
                  ) : null}
                  <span className="signup-glass__annual-figure">{tier.annualPrice}</span>
                  <span className="signup-glass__annual-suffix">/year</span>
                </p>
                {annualSavingsPct !== null ? (
                  <p className="signup-glass__annual-note">Save {annualSavingsPct}% vs monthly</p>
                ) : null}
              </div>
            ) : (
              <div className="signup-glass__annual signup-glass__annual--na">
                <p className="signup-glass__annual-label">Annual</p>
                <p className="signup-glass__annual-price">
                  <span className="signup-glass__annual-figure">—</span>
                </p>
              </div>
            )}

            <div className="signup-glass__monthly">
              <p className="signup-glass__monthly-label">Monthly</p>
              <p className="signup-glass__monthly-price">
                {tier.showDollar ? (
                  <span className="signup-glass__monthly-symbol" aria-hidden>
                    $
                  </span>
                ) : null}
                <span className="signup-glass__monthly-figure">{tier.monthlyPrice}</span>
                <span className="signup-glass__monthly-suffix">/month</span>
              </p>
            </div>
          </div>
        )}

        <p className="signup-glass__blurb">{tier.blurb}</p>

        <ul className="signup-glass__features">
          {tier.features.map((f) => (
            <li key={f} className="signup-glass__feature">
              {f}
            </li>
          ))}
        </ul>

        {isCurrent ? (
          <button type="button" className="signup-glass__cta" disabled>
            Current plan
          </button>
        ) : showUpgrade ? (
          <button
            type="button"
            className="signup-glass__cta"
            disabled={checkoutLoading !== null}
            onClick={() => onUpgrade(tier.id as Plan)}
          >
            {checkoutLoading === tier.id ? "Opening Stripe…" : "Upgrade"}
          </button>
        ) : (
          <div style={{ height: 42 }} />
        )}

        <p className="signup-glass__fine">{tier.footer}</p>
      </article>
    </div>
  );
}

export default function PricingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tier, setTier] = useState<SubscriptionTier | null>(null);
  const [loadingTier, setLoadingTier] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancelled = useMemo(() => searchParams.get("checkout") === "cancel", [searchParams]);
  const requestedPlan = useMemo(() => {
    const p = searchParams.get("plan");
    return p === "pro" || p === "infinite" ? p : null;
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) navigate("/login", { replace: true });
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sub = await getMySubscription();
        if (!mounted) return;
        setTier(sub?.tier ?? "free");
      } catch {
        if (!mounted) return;
        setTier(null);
      } finally {
        if (!mounted) return;
        setLoadingTier(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!requestedPlan) return;
    if (checkoutLoading !== null) return;
    void startCheckout(requestedPlan);
    // intentionally reacts only when the requested plan changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPlan]);

  async function startCheckout(plan: Plan) {
    if (checkoutLoading) return;
    setError(null);
    setCheckoutLoading(plan);
    try {
      await redirectToStripeCheckout(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setCheckoutLoading(null);
    }
  }

  return (
    <div className="signup-page">
      <div className="signup-page__ambient" aria-hidden>
        <span className="signup-page__blob signup-page__blob--a" />
        <span className="signup-page__blob signup-page__blob--b" />
        <span className="signup-page__blob signup-page__blob--c" />
      </div>

      <div className="signup-page__inner">
        <header className="signup-page__header">
          <div className="signup-page__header-copy">
            <p className="signup-page__eyebrow">Billing</p>
            <h1 className="signup-page__title">Choose a tier</h1>
            <p className="signup-page__lede">
              {loadingTier ? "Loading your current plan…" : "Manage your plan and upgrade anytime."}
            </p>
            {cancelled ? (
              <p className="signup-page__lede" style={{ marginTop: 8 }}>
                Checkout cancelled. You can try again anytime.
              </p>
            ) : null}
            {error ? (
              <p className="signup-auth__error" style={{ marginTop: 10 }}>
                {error}
              </p>
            ) : null}
          </div>
          <Link to="/drive" className="signup-page__back">
            Back to drive
          </Link>
        </header>

        <div className="signup-page__tiers-wrap">
          <div className="signup-page__tiers">
            {TIERS.map((t) => (
              <BillingTierPanel
                key={t.id}
                tier={t}
                currentTier={tier}
                checkoutLoading={checkoutLoading}
                onUpgrade={startCheckout}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

