import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faLock,
  faCircleNotch,
  faTriangleExclamation,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { QRCodeSVG } from "qrcode.react";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("credentials");
  const [flowToken, setFlowToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [enrollment, setEnrollment] = useState(null);
  const [backupCodes, setBackupCodes] = useState([]);
  const [pendingSession, setPendingSession] = useState(null);
  const [recoveryRequested, setRecoveryRequested] = useState(false);

  const { user, loginStaff, completeStaffLogin } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect straight to the appropriate page
  useEffect(() => {
    if (user) {
      if (user.role === "admin" || user.role === "lgu_personnel") {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/map", { replace: true });
      }
    }
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (phase === "credentials") {
        const result = await loginStaff(email, password);
        if (result.access_token) {
          navigate("/dashboard");
        } else if (result.totp_enrollment_required) {
          setEnrollment(result);
          setFlowToken(result.setup_token);
          setPhase("enroll");
        } else if (result.totp_required) {
          setFlowToken(result.challenge_token);
          setPhase("verify");
        }
      } else if (phase === "enroll") {
        const result = await api.confirmStaffTotpEnrollment(flowToken, totpCode);
        setPendingSession(result);
        setBackupCodes(result.backup_codes || []);
        setPhase("backup");
        setTotpCode("");
      } else if (phase === "verify") {
        const result = await api.verifyStaffTotp(flowToken, totpCode);
        completeStaffLogin(result);
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecovery() {
    setError("");
    setLoading(true);
    try {
      await api.requestStaffTotpRecovery(flowToken);
      setRecoveryRequested(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function finishEnrollment() {
    if (!pendingSession) return;
    completeStaffLogin(pendingSession);
    navigate("/dashboard");
  }

  return (
    <div className="login-wrapper">
      <form onSubmit={handleSubmit} className="login-card ds-card">
        <div className="login-icon">
          <img src="/evacway-logo-text.png" alt="EvacWay" className="login-logo" />
        </div>
        <h2 className="login-title">
          {phase === "enroll" ? "Set up two-factor sign in" : phase === "verify" ? "Verify your sign in" : phase === "backup" ? "Save your backup codes" : "Staff sign in"}
        </h2>
        <p className="login-subtitle">
          {phase === "enroll" ? "Scan the QR code with an authenticator app, or enter the key manually." : phase === "verify" ? "Enter the 6-digit code from your authenticator app or a backup code." : phase === "backup" ? "These codes are shown once. Store them somewhere safe." : "Sign in with your LGU Personnel or admin account."}
        </p>

        {error && (
          <div className="login-error ds-banner ds-banner--danger" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} className="login-error-icon" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {phase === "credentials" && <>
        <label className="login-label" htmlFor="login-email">Email</label>
        <div className="login-input-wrap">
          <FontAwesomeIcon icon={faEnvelope} className="login-input-icon" aria-hidden="true" />
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input ds-input"
            placeholder="you@example.com"
            required
          />
        </div>

        <label className="login-label" htmlFor="login-password">Password</label>
        <div className="login-input-wrap">
          <FontAwesomeIcon icon={faLock} className="login-input-icon" aria-hidden="true" />
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input ds-input"
            placeholder="Enter password"
            required
          />
        </div>

        <Link to="/forgot-password" className="login-forgot-link">
          Forgot your password?
        </Link>
        </>}

        {phase === "enroll" && enrollment && <div className="login-mfa-enrollment">
          <div className="login-mfa-qr"><QRCodeSVG value={enrollment.otpauth_uri} size={196} includeMargin /></div>
          <label className="login-label" htmlFor="totp-manual-key">Manual key</label>
          <code id="totp-manual-key" className="login-mfa-key">{enrollment.totp_secret}</code>
        </div>}

        {phase === "enroll" || phase === "verify" ? <>
          <label className="login-label" htmlFor="totp-code">{phase === "enroll" ? "Authenticator code" : "Authenticator or backup code"}</label>
          <input id="totp-code" autoComplete="one-time-code" inputMode="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} className="login-input ds-input" required />
        </> : null}

        {phase === "backup" && <>
          <ul className="login-mfa-backup-codes">{backupCodes.map((code) => <li key={code}><code>{code}</code></li>)}</ul>
          <button type="button" onClick={finishEnrollment} className="login-button ds-btn ds-btn--primary">I saved these codes</button>
        </>}

        {phase === "verify" && <>
          <button type="button" onClick={handleRecovery} disabled={loading || recoveryRequested} className="login-forgot-link login-mfa-recovery">
            {recoveryRequested ? "Recovery request sent for admin approval." : "Request account recovery"}
          </button>
        </>}

        {phase !== "backup" && <button type="submit" disabled={loading} className="login-button ds-btn ds-btn--primary">
          {loading ? (
            <>
              <FontAwesomeIcon icon={faCircleNotch} spin className="login-loading-icon" />
              Logging in…
            </>
          ) : (
            phase === "credentials" ? "Log In" : phase === "enroll" ? "Verify and finish setup" : "Verify code"
          )}
        </button>}

        <Link to="/" className="login-back-link ds-btn ds-btn--ghost">
          <FontAwesomeIcon icon={faArrowLeft} className="login-back-icon" aria-hidden="true" />
          Back to public map
        </Link>
      </form>
    </div>
  );
}

export default Login;
