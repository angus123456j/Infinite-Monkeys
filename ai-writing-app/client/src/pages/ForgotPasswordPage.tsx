import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isRegisteredSession } from "../lib/auth";

/** Supabase returns 429 when auth email rate limits are hit (reset, signup, magic link, etc.). */
function formatPasswordResetError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const status = typeof err === "object" && err !== null && "status" in err ? (err as { status?: number }).status : undefined;
  if (status === 429 || /rate limit|429|too many|exceeded/i.test(msg)) {
    return "Too many reset emails were sent recently. Wait a few minutes, then try again. If you were testing, check spam for an email we already sent.";
  }
  return msg;
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  const resetUrl = useMemo(() => `${window.location.origin}/reset-password`, []);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setInterval(() => {
      setCooldownSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownSec]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (isRegisteredSession(data.session)) navigate("/drive", { replace: true });
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || cooldownSec > 0) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: resetUrl,
      });
      if (resetErr) throw resetErr;
      setSent(true);
    } catch (err) {
      setError(formatPasswordResetError(err));
      const raw = err instanceof Error ? err.message : String(err);
      const status = typeof err === "object" && err !== null && "status" in err ? (err as { status?: number }).status : undefined;
      if (status === 429 || /rate limit|429|exceeded/i.test(raw)) {
        setCooldownSec(90);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="signup-auth">
      <div className="signup-auth__inner">
        <div className="signup-auth__center">
          <div className="signup-auth__logo-wrap" aria-hidden>
            <img className="signup-auth__logo" src="/images/monkey.png" alt="" />
          </div>

          <h1 className="signup-auth__headline">Reset your password</h1>

          <main className="signup-auth__card" aria-label="Password reset request">
            {sent ? (
              <>
                <p className="signup-auth__fine" style={{ margin: 0, fontSize: "1.05rem" }}>
                  If an account exists for that email, we sent a link. Open the message and follow
                  the steps to set a new password, then you can sign in.
                </p>
                <p className="signup-auth__fine" style={{ margin: "0.9rem 0 0" }}>
                  Check your spam folder if you don’t see it. The link expires after a while.
                </p>
                <div className="signup-auth__footer-row" style={{ marginTop: "1.25rem" }}>
                  <Link to="/login" className="signup-auth__footer-link">
                    ← Back to sign in
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="signup-auth__fine" style={{ margin: "0 0 1rem" }}>
                  Enter the email you use for Infinite Monkeys. We’ll send a link to choose a new
                  password.
                </p>
                <form onSubmit={onSubmit}>
                  <label className="signup-auth__label">
                    Email
                    <input
                      className="signup-auth__input"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@email.com"
                    />
                  </label>

                  <button
                    type="submit"
                    className="signup-auth__primary"
                    disabled={loading || cooldownSec > 0}
                  >
                    {loading
                      ? "Sending…"
                      : cooldownSec > 0
                        ? `Wait ${cooldownSec}s to try again`
                        : "Send reset link"}
                  </button>
                </form>
                {error ? <p className="signup-auth__error">{error}</p> : null}
                <div className="signup-auth__footer-row">
                  <Link to="/login" className="signup-auth__footer-link">
                    ← Back to sign in
                  </Link>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
