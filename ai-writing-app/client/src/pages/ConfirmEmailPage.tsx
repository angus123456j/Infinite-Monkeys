import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const driveUrl = () => `${window.location.origin}/drive`;

export default function ConfirmEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email")?.trim() || "";

  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) navigate("/drive", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate("/drive", { replace: true });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const onResend = useCallback(async () => {
    if (!email) {
      setResendMessage("We don’t have your email on this page. Go back to sign up and try again.");
      return;
    }
    setResendLoading(true);
    setResendMessage(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: driveUrl() },
    });
    setResendLoading(false);
    if (error) {
      setResendMessage(error.message);
      return;
    }
    setResendMessage("We sent another email. Check your inbox and spam folder.");
  }, [email]);

  return (
    <div className="signup-auth">
      <div className="signup-auth__inner">
        <div className="signup-auth__center">
          <div className="signup-auth__logo-wrap" aria-hidden>
            <img className="signup-auth__logo" src="/images/monkey.png" alt="" />
          </div>

          <h1 className="signup-auth__headline">Confirm your email</h1>

          <main className="signup-auth__card" aria-label="Email confirmation">
            <p style={{ margin: "0 0 1rem", lineHeight: 1.5 }}>
              We’ve sent a confirmation link
              {email ? (
                <>
                  {" "}
                  to <strong style={{ fontWeight: 600 }}>{email}</strong>
                </>
              ) : null}
              . Open the email and use the confirmation link—you’ll be signed in and taken straight to
              the Drive. You can close this tab until then.
            </p>
            {email ? (
              <p className="signup-auth__fine" style={{ margin: "0 0 1rem" }}>
                The link can take a few minutes. Check spam if you don’t see it.
              </p>
            ) : null}
            {email ? (
              <button
                type="button"
                className="signup-auth__primary"
                style={{ width: "100%" }}
                disabled={resendLoading}
                onClick={() => void onResend()}
              >
                {resendLoading ? "Sending…" : "Resend confirmation email"}
              </button>
            ) : null}
            {resendMessage ? (
              <p className={resendMessage.startsWith("We sent") ? "signup-auth__fine" : "signup-auth__error"}>
                {resendMessage}
              </p>
            ) : null}

            <div className="signup-auth__footer-row" style={{ marginTop: "1.5rem" }}>
              <Link to="/login" className="signup-auth__footer-link">
                ← Back to sign in
              </Link>
              <span className="signup-auth__footer-muted">
                Wrong email?{" "}
                <Link to="/signup/free" className="signup-auth__footer-link signup-auth__footer-link--inline">
                  Sign up again →
                </Link>
              </span>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
