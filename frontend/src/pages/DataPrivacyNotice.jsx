import { Link } from "react-router-dom";
import "./DataPrivacyNotice.css";

export default function DataPrivacyNotice() {
  return (
    <main className="privacy-notice-page">
      <article className="privacy-notice-card ds-card">
        <h1>Data Privacy Notice</h1>
        <p className="privacy-notice-todo">TODO: Add the approved Data Privacy Notice text here.</p>
        <Link to="/" className="ds-btn ds-btn--ghost">Back to EvacWay</Link>
      </article>
    </main>
  );
}
