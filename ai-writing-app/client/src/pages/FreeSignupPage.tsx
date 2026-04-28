import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function FreeSignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = useMemo(() => `${window.location.origin}/drive`, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) navigate("/drive", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session) navigate("/drive", { replace: true });
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
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }
    try {
      const emailTrimmed = email.trim();
      const { data, error: authError } = await supabase.auth.signUp({
        email: emailTrimmed,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/drive`,
        },
      });
      if (authError) throw authError;
      const user = data.user;
      if (!user?.id || !user.email) throw new Error("Signup succeeded but no user was returned.");

      // Profiles + subscriptions: DB trigger on auth.users. No client insert (RLS / no session).

      if (data.session) {
        // Email confirmation disabled in Supabase — user is already signed in.
        navigate("/drive", { replace: true });
      } else {
        navigate(`/confirm-email?email=${encodeURIComponent(user.email)}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
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
          // Let users pick a different Google account instead of reusing the browser’s last session.
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError) throw oauthError;
      // SPA: the client returns the provider URL; we must navigate so the Google account page appears.
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

          <h1 className="signup-auth__headline">Create your account</h1>

          <main className="signup-auth__card" aria-label="Sign up">
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

              <label className="signup-auth__label">
                Password
                <input
                  className="signup-auth__input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>

              <label className="signup-auth__label">
                Confirm password
                <input
                  className="signup-auth__input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>

              <button type="submit" className="signup-auth__primary" disabled={loading}>
                {loading ? "Creating…" : "Create account"}
              </button>
            </form>

            <div className="signup-auth__or">
              <span className="signup-auth__or-line" aria-hidden />
              <span className="signup-auth__or-text">OR</span>
              <span className="signup-auth__or-line" aria-hidden />
            </div>

            <button type="button" className="signup-auth__google" onClick={onGoogle} disabled={loading}>
              <span className="signup-auth__google-mark" aria-hidden>
                G
              </span>
              Continue with Google
            </button>

            {error ? <p className="signup-auth__error">{error}</p> : null}

            <div className="signup-auth__footer-row">
              <Link to="/signup" className="signup-auth__footer-link">
                ← Back
              </Link>
              <span className="signup-auth__footer-muted">
                Already have an account?{" "}
                <Link to="/login" className="signup-auth__footer-link signup-auth__footer-link--inline">
                  Sign In →
                </Link>
              </span>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

