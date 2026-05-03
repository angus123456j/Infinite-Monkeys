import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isRegisteredSession } from "../lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const passwordReset = Boolean(
    (location.state as { passwordReset?: boolean } | null)?.passwordReset,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For OAuth, land on our confirm screen first (even though Google emails are already verified),
  // so the user sees a consistent "check your email / you're in" step.
  const redirectTo = useMemo(() => `${window.location.origin}/confirm-email?mode=oauth`, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (isRegisteredSession(data.session)) navigate("/drive", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (isRegisteredSession(session)) navigate("/drive", { replace: true });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      if (!data.session) throw new Error("Login succeeded but no session was created.");
      navigate("/drive", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError) throw oauthError;
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError("Could not start Google sign-in (no redirect URL). Check Supabase Google provider and redirect allow list.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Google sign-in.");
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

          <h1 className="signup-auth__headline">Welcome back</h1>

          <main className="signup-auth__card" aria-label="Sign in">
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

              <div className="signup-auth__password-row">
                <label className="signup-auth__label">
                  Password
                  <input
                    className="signup-auth__input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </label>
                <div className="signup-auth__forgot-wrap">
                  <Link to="/forgot-password" className="signup-auth__forgot">
                    Forgot password?
                  </Link>
                </div>
              </div>

              {passwordReset ? (
                <p className="signup-auth__fine" style={{ margin: "0.35rem 0 0" }}>
                  Password updated. Sign in with your new password.
                </p>
              ) : null}

              <button type="submit" className="signup-auth__primary" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="signup-auth__or" aria-hidden>
              <span className="signup-auth__or-line" />
              <span className="signup-auth__or-text">OR</span>
              <span className="signup-auth__or-line" />
            </div>

            <button type="button" className="signup-auth__google" onClick={onGoogle} disabled={loading}>
              <span className="signup-auth__google-mark" aria-hidden>
                G
              </span>
              Continue with Google
            </button>

            {error ? <p className="signup-auth__error">{error}</p> : null}

            <div className="signup-auth__footer-row">
              <Link to="/?skipIntro=1" className="signup-auth__footer-link">
                ← Back
              </Link>
              <span className="signup-auth__footer-muted">
                No account?{" "}
                <Link to="/signup" className="signup-auth__footer-link signup-auth__footer-link--inline">
                  Sign Up →
                </Link>
              </span>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

