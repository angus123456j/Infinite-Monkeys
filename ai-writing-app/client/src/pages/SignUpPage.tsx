import { Link, useNavigate } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

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

type Tier = (typeof TIERS)[number];

function SignupTierPanel({ tier }: { tier: Tier }) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const finePointer = useFinePointerHover();
  const allowTilt = finePointer && !reducedMotion;
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const rafRef = useRef<number | null>(null);

  const applyTilt = useCallback(
    (clientX: number, clientY: number) => {
      const el = wrapRef.current;
      if (!el || !allowTilt) return;
      const r = el.getBoundingClientRect();
      const x = (clientX - r.left) / r.width;
      const y = (clientY - r.top) / r.height;
      const nx = Math.min(1, Math.max(0, x));
      const ny = Math.min(1, Math.max(0, y));
      const xc = nx - 0.5;
      const yc = ny - 0.5;
      const ry = xc * 2 * TILT_MAX_DEG;
      const rx = -yc * 2 * TILT_MAX_DEG;
      setTilt({ rx, ry });
    },
    [allowTilt]
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
    [applyTilt, allowTilt]
  );

  const onMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setTilt({ rx: 0, ry: 0 });
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
          Math.round(100 - (tier.annualPrice / Math.max(1, tier.monthlyPrice * 12)) * 100)
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

        <button
          type="button"
          className="signup-glass__cta"
          disabled={tier.id !== "free"}
          onClick={() => {
            if (tier.id === "free") navigate("/signup/free");
          }}
        >
          Choose plan
        </button>

        <p className="signup-glass__fine">{tier.footer}</p>
      </article>
    </div>
  );
}

/** Tier cards — one gold frame per column, navy type, tilt preserved. */
export default function SignUpPage() {
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
            <p className="signup-page__eyebrow">Sign up</p>
            <h1 className="signup-page__title">Choose a tier</h1>
            <p className="signup-page__lede">
              One gold frame per plan—everything inside it, left-aligned navy type.
            </p>
          </div>
          <Link to="/?skipIntro=1" className="signup-page__back">
            Back to home
          </Link>
        </header>

        <div className="signup-page__tiers-wrap">
          <div className="signup-page__tiers">
            {TIERS.map((tier) => (
              <SignupTierPanel key={tier.id} tier={tier} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
