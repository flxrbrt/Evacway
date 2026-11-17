import { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCircleNotch, faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../services/api";
import "./ForgotPassword.css";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.requestPasswordReset(email);
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message || "We could not send the reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="forgot-password-page">
      <section className="forgot-password-card ds-card" aria-labelledby="forgot-password-title">
        <img src="/evacway-logo-text.png" alt="EvacWay" className="forgot-password-logo" />
        <h1 id="forgot-password-title">Forgot your password?</h1>
        {submitted ? (
          <p className="forgot-password-message" role="status">
            If an active account matches that email, a password reset link has been sent.
          </p>
        ) : (
          <>
            <p className="forgot-password-message">
              Enter your email and we’ll send you a secure password reset link.
            </p>
            <form onSubmit={handleSubmit} className="forgot-password-form">
              {error && <p className="forgot-password-error" role="alert">{error}</p>}
              <label className="login-label" htmlFor="forgot-password-email">Email</label>
              <div className="login-input-wrap">
                <FontAwesomeIcon icon={faEnvelope} className="login-input-icon" aria-hidden="true" />
                <input
                  id="forgot-password-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="login-input ds-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="ds-btn ds-btn--primary">
                {loading ? <><FontAwesomeIcon icon={faCircleNotch} spin /> Sending...</> : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <Link to="/login" className="forgot-password-back ds-btn ds-btn--ghost">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          Back to login
        </Link>
      </section>
    </main>
  );
}

export default ForgotPassword;
