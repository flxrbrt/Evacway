import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuildingColumns,
  faBuilding,
  faTriangleExclamation,
  faBan,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

export default function IconLegendModal({ isOpen, onClose, isMobile = false }) {
  if (!isOpen) return null;

  return (
    <>
      {isMobile && (
        <div
          className="popover-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={isMobile ? "rh-sheet" : "help-popover"}
        role="dialog"
        aria-modal={isMobile ? "true" : undefined}
        aria-label="What do the icons mean?"
      >
        {isMobile && <div className="sheet-handle" aria-hidden="true" />}

        <div className="popover-header">
          <h4>What do the icons mean?</h4>
          <button
            type="button"
            className="popover-close-btn"
            onClick={onClose}
            aria-label="Close help"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className={isMobile ? "sheet-body" : ""}>
          <div className="help-icon-list">
            <div className="legend-item">
              <div className="legend-icon-wrapper place-center">
                <FontAwesomeIcon icon={faBuildingColumns} />
              </div>
              <span>Safe evacuation center where your family can stay.</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon-wrapper place-building">
                <FontAwesomeIcon icon={faBuilding} />
              </div>
              <span>Building inside an evacuation center when you zoom in.</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon-wrapper hazard-report">
                <FontAwesomeIcon icon={faTriangleExclamation} />
              </div>
              <span>Danger reported nearby by a resident or staff.</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon-wrapper road-blocked">
                <FontAwesomeIcon icon={faBan} />
              </div>
              <span>Road that is blocked or closed and cannot be passed.</span>
            </div>

            <div className="help-section-divider" role="separator" />

            <div className="help-section-heading">How full is the building?</div>

            <div className="legend-item">
              <div className="legend-icon-wrapper">
                <span className="legend-status-dot dot-green" aria-hidden="true" />
              </div>
              <span>
                <strong>Plenty of space.</strong>{" "}
                <span className="legend-desc-muted">You can go here.</span>
              </span>
            </div>
            <div className="legend-item">
              <div className="legend-icon-wrapper">
                <span className="legend-status-dot dot-orange" aria-hidden="true" />
              </div>
              <span>
                <strong>Getting crowded.</strong>{" "}
                <span className="legend-desc-muted">Space is running low, so go soon.</span>
              </span>
            </div>
            <div className="legend-item">
              <div className="legend-icon-wrapper">
                <span className="legend-status-dot dot-red" aria-hidden="true" />
              </div>
              <span>
                <strong>Full.</strong>{" "}
                <span className="legend-desc-muted">No space left. Choose another center.</span>
              </span>
            </div>
            <div className="legend-item">
              <div className="legend-icon-wrapper">
                <span className="legend-status-dot dot-gray" aria-hidden="true" />
              </div>
              <span>
                <strong>No information yet.</strong>{" "}
                <span className="legend-desc-muted">Check with your barangay or the center.</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            className="help-got-it-btn"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
