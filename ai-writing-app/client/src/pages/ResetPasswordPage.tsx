import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Phase = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decidedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const go = (next: Phase) => {
      if (cancelled) return;
      if (next !== "checking" && (next === "ready" || next === "invalid")) {
        decidedRef.current = true;
      }
      setPhase((prev) => (prev === "done" ? prev : next));
    };

    const trySession = (hasSession: boolean) => {
      if (hasSession) go("ready");
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) trySession(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        trySession(true);
        return;
      }
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        trySession(true);
      }
    });

    const t = window.setTimeout(() => {
      if (cancelled || decidedRef.current) return;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (decidedRef.current) return;
        if (session) {
          go("ready");
        } else {
          go("invalid");
        }
      });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setPhase("done");
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate("/login", { replace: true, state: { passwordReset: true } });
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  if (phase === "checking") {
    return (
      <div className="signup-auth">
        <div className="signup-auth__inner">
          <div className="signup-auth__center">
            <p className="signup-auth__headline" style={{ fontSize: "1.2rem" }}>
              Verifying link…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="signup-auth">
        <div className="signup-auth__inner">
          <div className="signup-auth__center">
            <div className="signup-auth__logo-wrap" aria-hidden>
              <img className="signup-auth__logo" src="/images/monkey.png" alt="" />
            </div>
            <h1 className="signup-auth__headline">Link invalid or expired</h1>
            <main className="signup-auth__card" aria-label="Invalid reset link">
              <p className="signup-auth__fine" style={{ margin: 0 }}>
                Request a new link from the forgot password page, or sign in if you’re already set
                up.
              </p>
              <div className="signup-auth__footer-row" style={{ marginTop: "1.25rem" }}>
                <Link to="/forgot-password" className="signup-auth__footer-link">
                  Request new link
                </Link>
                <Link to="/login" className="signup-auth__footer-link signup-auth__footer-link--inline">
                  Sign in →
                </Link>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="signup-auth">
        <div className="signup-auth__inner">
          <div className="signup-auth__center">
            <p className="signup-auth__headline" style={{ fontSize: "1.35rem" }}>
              Password updated. Redirecting to sign in…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="signup-auth">
      <div className="signup-auth__inner">
        <div className="signup-auth__center">
          <div className="signup-auth__logo-wrap" aria-hidden>
            <img className="signup-auth__logo" src="/images/monkey.png" alt="" />
          </div>

          <h1 className="signup-auth__headline">Choose a new password</h1>

          <main className="signup-auth__card" aria-label="Set new password">
            <form onSubmit={onSubmit}>
              <label className="signup-auth__label">
                New password
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
                Confirm new password
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
                {loading ? "Saving…" : "Update password and continue"}
              </button>
            </form>
            {error ? <p className="signup-auth__error">{error}</p> : null}
            <div className="signup-auth__footer-row">
              <Link to="/login" className="signup-auth__footer-link">
                ← Cancel, back to sign in
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
