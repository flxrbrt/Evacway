import { useState, useMemo, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleNotch, faXmark, faTriangleExclamation, faTrash, faCheck } from '@fortawesome/free-solid-svg-icons';
import { stripDigits } from './utils';
import { centerNeedsMapping } from './utils';
import { formatRoomLabel } from '../../utils/formatRoomLabel';
import { displayEntityName } from '../../utils/displayEntityName';
import BarangaysServedPicker from '../BarangaysServedPicker/BarangaysServedPicker';
import './ModalShell.css';

export function ModalShell({ open = false, title = '', subtitle, onClose, formId, onPrimary, loading = false, primaryLabel = 'Save', primaryDisabled = false, cancelLabel = 'Cancel', children, footer, dialogClassName = '', headerExtra }) {
  if (!open) return null;
  const defaultFooter = (
    <>
      <button type="button" className="btn btn-secondary" disabled={loading} onClick={onClose}>{cancelLabel}</button>
      {onPrimary ? (
        <button type="button" onClick={onPrimary} className="btn btn-primary" disabled={loading || primaryDisabled}>
          {loading ? (<><FontAwesomeIcon icon={faCircleNotch} spin size="xs" /> {primaryLabel}</>) : primaryLabel}
        </button>
      ) : (
        <button type="submit" form={formId || undefined} className="btn btn-primary" disabled={loading || primaryDisabled}>
          {loading ? (<><FontAwesomeIcon icon={faCircleNotch} spin size="xs" /> {primaryLabel}</>) : primaryLabel}
        </button>
      )}
    </>
  );
  return (
    <div className="modal-shell-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-shell-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={`modal-shell-dialog ${dialogClassName}`.trim()} onClick={(e) => e.stopPropagation()}>
        <header className="modal-shell-header">
          <div className="modal-shell-header__text">
            {title && <h2 id="modal-shell-title" className="modal-shell-title">{title}</h2>}
            {subtitle && <p className="modal-shell-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="modal-shell-close-btn" onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faXmark} /></button>
        </header>
        {headerExtra}
        <div className="modal-shell-body">{children}</div>
        <footer className="modal-shell-footer">{footer ?? defaultFooter}</footer>
      </section>
    </div>
  );
}

export function ConfirmCenterDialog({ open = false, title = 'Confirm', message = '', confirmText = 'Confirm', danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) { if (onCancel) onCancel(); } }}>
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close-btn" onClick={() => { if (onCancel) onCancel(); }}><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        <div className="modal-body"><p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text)' }}>{message}</p></div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => { if (onCancel) onCancel(); }}>Cancel</button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={async () => { if (onConfirm) await onConfirm(); }}>{confirmText || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

// Center type constants
const CENTER_TYPES = [
  { value: 'campus', label: 'Campus', description: 'Multi-building campus with rooms organized by building' },
  { value: 'private_property', label: 'Private Property', description: 'Single property with rooms (no buildings required)' },
  { value: 'single_venue', label: 'Single Venue', description: 'One large venue, no rooms, direct family assignment' },
];

// Building material options in required order
export const BUILDING_MATERIAL_OPTIONS = [
  'Reinforced Concrete',
  'Concrete & Steel Frame',
  'Structural Steel',
  'Semi-Permanent (Masonry & Timber)',
  'Lightweight Wood / Timber',
];

// 12 standard amenities
export const AMENITIES_LIST = [
  'Wheelchair Ramps',
  'Ground Floor Access',
  'PWD Restrooms',
  'Backup Generator / Solar',
  'Wide Doorways (90cm+)',
  'Potable Drinking Water',
  'Tactile Paving & Braille Signage',
  'First Aid / Medical Station',
  'Handrails & Grab Bars',
  'Child-Friendly Space / Lactation',
  'Emergency Power / Solar Backup',
  'Emergency Comm / Wi-Fi',
];

export const AMENITY_OPTIONS = AMENITIES_LIST;

// Wizard step definitions
const WIZARD_STEPS = [
  { id: 1, title: 'Basic info' },
  { id: 2, title: 'Location' },
  { id: 3, title: 'Capacity & contact' },
  { id: 4, title: 'Amenities' },
];

export function CenterFormModal({
  mode = 'add',
  centerForm,
  onChange,
  barangays = [],
  saving = false,
  error = '',
  onClearError,
  onSubmit,
  onClose,
  onBeforeDeselect,
  allowedCenterTypes = null,
  initialStep = 1,
}) {
  const title = mode === 'add' ? 'Add Evacuation Center' : 'Edit Evacuation Center';
  const subtitle = mode === 'add' ? 'Create a new evacuation center' : 'Edit evacuation center details';
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [submitBlocked, setSubmitBlocked] = useState(false);
  const step4UnlockTimeRef = useRef(0);
  const stepHeadingRef = useRef(null);
  const isFirstMount = useRef(true);

  const [selectedMaterialOption, setSelectedMaterialOption] = useState(() => {
    const current = (centerForm.building_material || '').trim();
    if (!current) return '';
    const matched = BUILDING_MATERIAL_OPTIONS.find(
      (opt) => opt.toLowerCase() === current.toLowerCase()
    );
    return matched || 'Other';
  });

  const [customMaterialText, setCustomMaterialText] = useState(() => {
    const current = (centerForm.building_material || '').trim();
    if (!current) return '';
    const matched = BUILDING_MATERIAL_OPTIONS.find(
      (opt) => opt.toLowerCase() === current.toLowerCase()
    );
    return matched ? '' : current;
  });

  const [refMetadata, setRefMetadata] = useState({
    center_type: [],
    building_material: [],
    amenities: [],
  });

  useEffect(() => {
    let active = true;
    async function loadMeta() {
      try {
        const [cts, mats, ams] = await Promise.all([
          api.getCenterTypes({ active_only: true }),
          api.getBuildingMaterials({ active_only: true }),
          api.getAmenities({ active_only: true }),
        ]);
        if (active) {
          setRefMetadata({
            center_type: Array.isArray(cts) ? cts : [],
            building_material: Array.isArray(mats) ? mats : [],
            amenities: Array.isArray(ams) ? ams : [],
          });
        }
      } catch (err) {
        console.warn('Could not load dynamic shelter tables', err);
      }
    }
    loadMeta();
    return () => {
      active = false;
    };
  }, []);

  // Reset to initialStep each time modal opens / mode changes
  useEffect(() => {
    setCurrentStep(initialStep);
    setFieldErrors({});
    setIsSubmitting(false);
    isSubmittingRef.current = false;
    setSubmitBlocked(false);
    step4UnlockTimeRef.current = 0;

    const current = (centerForm.building_material || '').trim();
    if (!current) {
      setSelectedMaterialOption('');
      setCustomMaterialText('');
    } else {
      const matched = BUILDING_MATERIAL_OPTIONS.find(
        (opt) => opt.toLowerCase() === current.toLowerCase()
      );
      if (matched) {
        setSelectedMaterialOption(matched);
        setCustomMaterialText('');
      } else {
        setSelectedMaterialOption('Other');
        setCustomMaterialText(current);
      }
    }
  }, [mode, initialStep]);

  useEffect(() => {
    const current = (centerForm.building_material || '').trim();
    if (!current) {
      setSelectedMaterialOption((prev) => (prev === 'Other' ? 'Other' : ''));
    } else {
      const matched = BUILDING_MATERIAL_OPTIONS.find(
        (opt) => opt.toLowerCase() === current.toLowerCase()
      );
      if (matched) {
        setSelectedMaterialOption(matched);
      } else {
        setSelectedMaterialOption('Other');
        setCustomMaterialText(current);
      }
    }
  }, [centerForm.building_material]);

  const selectedAmenities = useMemo(() => {
    if (!centerForm.amenities) return [];
    if (Array.isArray(centerForm.amenities)) {
      return centerForm.amenities
        .map((a) => (typeof a === 'object' && a !== null ? a.name || a.code : a))
        .filter(Boolean);
    }
    return [];
  }, [centerForm.amenities]);

  function toggleAmenity(name) {
    const isIncluded = selectedAmenities.some(
      (a) => a.toLowerCase() === name.toLowerCase()
    );
    const next = isIncluded
      ? selectedAmenities.filter((a) => a.toLowerCase() !== name.toLowerCase())
      : [...selectedAmenities, name];
    onChange({
      ...centerForm,
      amenities: next,
    });
  }

  function handleSelectAllAmenities() {
    onChange({
      ...centerForm,
      amenities: [...AMENITIES_LIST],
    });
  }

  function handleClearAmenities() {
    onChange({
      ...centerForm,
      amenities: [],
    });
  }

  // Keep isSubmitting synchronized with saving prop
  useEffect(() => {
    if (!saving) {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [saving]);

  // 300ms safety delay upon entering step 4 to prevent accidental double-clicks or lingering events
  useEffect(() => {
    if (currentStep === 4) {
      step4UnlockTimeRef.current = Date.now() + 300;
      setSubmitBlocked(true);
      const timer = setTimeout(() => {
        setSubmitBlocked(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSubmitBlocked(false);
      step4UnlockTimeRef.current = 0;
    }
  }, [currentStep]);

  // Focus step title on each step change (skip initial mount)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (stepHeadingRef.current) {
      stepHeadingRef.current.focus();
    }
  }, [currentStep]);

  const isPrivateProperty = centerForm.center_type === 'private_property';
  const isSingleVenue = centerForm.center_type === 'single_venue';
  const isCampus = centerForm.center_type === 'campus' || !centerForm.center_type;

  function clearFieldError(field) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function setFieldError(field, message) {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
  }

  function validateStep(step) {
    let valid = true;
    const newErrors = {};

    if (step === 1) {
      if (!centerForm.name || !centerForm.name.trim()) {
        newErrors.name = 'Evacuation center name is required.';
        valid = false;
      }
      if (!centerForm.center_type) {
        newErrors.center_type = 'Center type is required.';
        valid = false;
      }
    } else if (step === 2) {
      if (!centerForm.barangay_ids || centerForm.barangay_ids.length === 0) {
        newErrors.barangays = 'Select at least one barangay served by this center.';
        valid = false;
      }
    } else if (step === 3) {
      if (isPrivateProperty && (!centerForm.max_rooms || Number(centerForm.max_rooms) < 1)) {
        newErrors.max_rooms = 'Max rooms is required for Private Property centers (minimum 1).';
        valid = false;
      }
      if (isSingleVenue && (!centerForm.capacity || Number(centerForm.capacity) < 1)) {
        newErrors.capacity = 'Capacity is required for Single Venue centers (minimum 1).';
        valid = false;
      }
    }

    setFieldErrors((prev) => {
      const next = { ...prev };
      if (step === 1) {
        delete next.name;
        delete next.center_type;
      } else if (step === 2) {
        delete next.barangays;
      } else if (step === 3) {
        delete next.max_rooms;
        delete next.capacity;
      }
      return { ...next, ...newErrors };
    });

    if (!valid) {
      setTimeout(() => {
        if (step === 1) {
          if (newErrors.name) {
            document.getElementById('center-name')?.focus();
          } else if (newErrors.center_type) {
            document.getElementById('center-type')?.focus();
          }
        } else if (step === 2) {
          const searchInput = document.querySelector('.cfm-dialog .bsp-search-input');
          if (searchInput) {
            searchInput.focus();
          }
        } else if (step === 3) {
          if (newErrors.capacity) {
            document.getElementById('center-capacity')?.focus();
          } else if (newErrors.max_rooms) {
            document.getElementById('center-max-rooms')?.focus();
          }
        }
      }, 50);
    }

    return valid;
  }

  function handleNext() {
    if (validateStep(currentStep)) {
      if (currentStep === 3) {
        step4UnlockTimeRef.current = Date.now() + 300;
        setSubmitBlocked(true);
        setTimeout(() => {
          setSubmitBlocked(false);
        }, 300);
      }
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  }

  function handleBack() {
    setSubmitBlocked(false);
    step4UnlockTimeRef.current = 0;
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  }

  function handleGoToStep(targetStep) {
    if (targetStep < currentStep) {
      setSubmitBlocked(false);
      step4UnlockTimeRef.current = 0;
      setCurrentStep(targetStep);
    }
  }

  function handleSubmit(e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    // Guard: If not on step 4, never submit; advance to next step through validated Next logic
    if (currentStep < 4) {
      handleNext();
      return;
    }

    // Guard: Safety delay after entering step 4 (300ms)
    if (Date.now() < step4UnlockTimeRef.current || submitBlocked) {
      return;
    }

    // Guard: Prevent double-submits
    if (isSubmittingRef.current || saving) {
      return;
    }

    // Validate all steps
    if (!validateStep(1)) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep(2)) {
      setCurrentStep(2);
      return;
    }
    if (!validateStep(3)) {
      setCurrentStep(3);
      return;
    }
    if (!validateStep(4)) {
      setCurrentStep(4);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    onSubmit(e);
  }

  function handleFormKeyDown(e) {
    if (e.key === 'Enter') {
      // On step 4, Enter inside the notes textarea must insert a new line and must not submit
      if (e.target.tagName === 'TEXTAREA') {
        return;
      }
      // If user pressed Enter on a button, allow normal button activation
      if (e.target.tagName === 'BUTTON') {
        return;
      }

      e.preventDefault();

      if (currentStep < 4) {
        handleNext();
      } else {
        handleSubmit(e);
      }
    }
  }

  const dynamicCenterTypes = useMemo(() => {
    if (refMetadata.center_type && refMetadata.center_type.length > 0) {
      return refMetadata.center_type.map((t) => ({
        value: t.code,
        label: t.name,
        description: t.description || '',
      }));
    }
    return CENTER_TYPES;
  }, [refMetadata.center_type]);

  const availableCenterTypes = allowedCenterTypes
    ? dynamicCenterTypes.filter((t) => allowedCenterTypes[t.value]?.allowed)
    : dynamicCenterTypes;

  const currentTypeAllowed =
    centerForm.center_type &&
    allowedCenterTypes &&
    allowedCenterTypes[centerForm.center_type]?.allowed;

  const stepperElement = (
    <div className="cfm-stepper-container">
      {/* Live announcement region for accessibility */}
      <div className="cfm-sr-only" aria-live="polite" aria-atomic="true">
        {`Step ${currentStep} of 4 · ${WIZARD_STEPS[currentStep - 1].title}`}
      </div>

      {/* Desktop Stepper */}
      <div className="cfm-stepper-desktop" role="navigation" aria-label="Wizard Steps">
        <div className="cfm-stepper-track">
          {WIZARD_STEPS.map((s, idx) => {
            const isCompleted = s.id < currentStep;
            const isCurrent = s.id === currentStep;
            const isUpcoming = s.id > currentStep;

            return (
              <div key={s.id} className="cfm-stepper-item">
                {idx > 0 && (
                  <div
                    className={`cfm-stepper-line ${s.id <= currentStep ? 'is-active' : ''}`}
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  className={`cfm-stepper-dot ${isCompleted ? 'is-completed' : ''} ${isCurrent ? 'is-current' : ''} ${isUpcoming ? 'is-upcoming' : ''}`}
                  onClick={() => isCompleted && handleGoToStep(s.id)}
                  disabled={isUpcoming}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Step ${s.id}: ${s.title}${isCompleted ? ' (completed, click to return)' : isCurrent ? ' (current)' : ''}`}
                  title={isCompleted ? `Go back to Step ${s.id}: ${s.title}` : undefined}
                >
                  {isCompleted ? (
                    <FontAwesomeIcon icon={faCheck} size="xs" />
                  ) : (
                    <span>{s.id}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cfm-stepper-label">
          Step {currentStep} of 4 · {WIZARD_STEPS[currentStep - 1].title}
        </div>
      </div>

      {/* Mobile Stepper (768px and below) */}
      <div className="cfm-stepper-mobile">
        <div className="cfm-stepper-mobile-label">
          Step {currentStep} of 4 · {WIZARD_STEPS[currentStep - 1].title}
        </div>
        <div className="cfm-mobile-progress-track" aria-hidden="true">
          <div
            className="cfm-mobile-progress-fill"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );

  const customFooter = (
    <div className="cfm-footer-wrap">
      {currentStep === 1 ? (
        <button
          key="cancel-btn"
          type="button"
          className="cfm-btn-cancel"
          disabled={saving || isSubmitting}
          onClick={onClose}
        >
          Cancel
        </button>
      ) : (
        <button
          key="back-btn"
          type="button"
          className="cfm-btn-secondary"
          disabled={saving || isSubmitting}
          onClick={handleBack}
        >
          Back
        </button>
      )}

      {currentStep < 4 ? (
        <button
          key="next-btn"
          type="button"
          className="cfm-btn-primary"
          disabled={saving || isSubmitting}
          onClick={handleNext}
        >
          Next
        </button>
      ) : (
        <button
          key="submit-btn"
          type="submit"
          form="center-form"
          className="cfm-btn-primary"
          disabled={saving || isSubmitting || submitBlocked}
        >
          {saving || isSubmitting ? (
            <>
              <FontAwesomeIcon icon={faCircleNotch} spin size="xs" /> Saving...
            </>
          ) : mode === 'add' ? (
            'Create Center'
          ) : (
            'Save Changes'
          )}
        </button>
      )}
    </div>
  );

  return (
    <ModalShell
      open
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      formId="center-form"
      dialogClassName="cfm-dialog"
      headerExtra={stepperElement}
      footer={customFooter}
    >
      <form
        id="center-form"
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
        noValidate
        className="cfm-form"
      >
        {error && (
          <div className="cfm-error-banner" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span style={{ flex: 1 }}>{error}</span>
            {onClearError && (
              <button
                type="button"
                className="cfm-error-dismiss"
                onClick={onClearError}
                aria-label="Dismiss error"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>
        )}
        {/* Step 1: Basic info */}
        {currentStep === 1 && (
          <div key={1} className="cfm-step-panel">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="cfm-step-title">
              Basic info
            </h3>

            <div className="cfm-field">
              <label htmlFor="center-name" className="cfm-label">
                Center Name <span className="cfm-required">*</span>
              </label>
              <input
                id="center-name"
                type="text"
                className={`cfm-input ${fieldErrors.name ? 'is-invalid' : ''}`}
                placeholder="e.g. Sogod Central Gymnasium"
                value={centerForm.name || ''}
                onChange={(e) => {
                  clearFieldError('name');
                  onChange({ ...centerForm, name: stripDigits(e.target.value) });
                }}
              />
              {fieldErrors.name && <p className="cfm-field-error">{fieldErrors.name}</p>}
            </div>

            <div className="cfm-field">
              <label htmlFor="center-type" className="cfm-label">
                Center Type <span className="cfm-required">*</span>
              </label>
              <select
                id="center-type"
                className={`cfm-select ${fieldErrors.center_type ? 'is-invalid' : ''}`}
                value={centerForm.center_type || 'campus'}
                onChange={(e) => {
                  clearFieldError('center_type');
                  const newType = e.target.value;
                  onChange({ ...centerForm, center_type: newType });

                  // Reset type-specific fields when type changes
                  if (newType === 'private_property') {
                    onChange({ ...centerForm, center_type: newType, capacity: null });
                  } else if (newType === 'single_venue') {
                    onChange({ ...centerForm, center_type: newType, max_rooms: null });
                  } else {
                    onChange({ ...centerForm, center_type: newType, max_rooms: null });
                  }
                }}
                disabled={mode === 'edit' && allowedCenterTypes && !currentTypeAllowed}
              >
                {availableCenterTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {allowedCenterTypes && mode === 'edit' && !currentTypeAllowed && (
                <p className="cfm-field-error">
                  Current center type cannot be changed. {allowedCenterTypes[centerForm.center_type]?.reason}
                </p>
              )}
              {fieldErrors.center_type && <p className="cfm-field-error">{fieldErrors.center_type}</p>}
              <p className="cfm-helper-text">
                {availableCenterTypes.find((t) => t.value === centerForm.center_type)?.description || 'Select a center type to see description.'}
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {currentStep === 2 && (
          <div key={2} className="cfm-step-panel">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="cfm-step-title">
              Location
            </h3>

            <div className="cfm-field">
              <BarangaysServedPicker
                barangays={barangays}
                selectedIds={centerForm.barangay_ids}
                onChange={(selectedIds) => {
                  clearFieldError('barangays');
                  onChange((prev) => ({ ...prev, barangay_ids: selectedIds }));
                }}
                onBeforeDeselect={onBeforeDeselect}
                required
                disabled={saving}
              />
              {fieldErrors.barangays && <p className="cfm-field-error">{fieldErrors.barangays}</p>}
            </div>
          </div>
        )}

        {/* Step 3: Capacity & contact */}
        {currentStep === 3 && (
          <div key={3} className="cfm-step-panel">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="cfm-step-title">
              Capacity & contact
            </h3>

            <div className="cfm-field">
              <label htmlFor="center-capacity" className="cfm-label">
                Total Capacity {isSingleVenue && <span className="cfm-required">*</span>}
              </label>
              <input
                id="center-capacity"
                type="number"
                min="0"
                className={`cfm-input ${fieldErrors.capacity ? 'is-invalid' : ''}`}
                placeholder={isSingleVenue ? 'e.g. 250 (required for Single Venue)' : 'e.g. 250'}
                value={centerForm.capacity ?? ''}
                onChange={(e) => {
                  clearFieldError('capacity');
                  onChange({ ...centerForm, capacity: e.target.value || null });
                }}
                required={isSingleVenue}
              />
              <p className="cfm-helper-text">
                Max evacuees. {isSingleVenue
                  ? 'Required for Single Venue centers. This is the total capacity of the venue.'
                  : isPrivateProperty
                  ? 'Optional for Private Property. Total capacity is derived from rooms.'
                  : 'Optional for Campus. Total capacity is derived from rooms.'}
              </p>
              {fieldErrors.capacity && <p className="cfm-field-error">{fieldErrors.capacity}</p>}
            </div>

            {isPrivateProperty && (
              <div className="cfm-field">
                <label htmlFor="center-max-rooms" className="cfm-label">
                  Max Rooms <span className="cfm-required">*</span>
                </label>
                <input
                  id="center-max-rooms"
                  type="number"
                  min="1"
                  className={`cfm-input ${fieldErrors.max_rooms ? 'is-invalid' : ''}`}
                  placeholder="e.g. 20"
                  value={centerForm.max_rooms ?? ''}
                  onChange={(e) => {
                    clearFieldError('max_rooms');
                    onChange({ ...centerForm, max_rooms: e.target.value || null });
                  }}
                  required
                />
                <p className="cfm-helper-text">Maximum number of rooms this private property can have.</p>
                {fieldErrors.max_rooms && <p className="cfm-field-error">{fieldErrors.max_rooms}</p>}
              </div>
            )}

            <div className="cfm-field">
              <label htmlFor="center-building-material" className="cfm-label">
                Building Material
              </label>
              <select
                id="center-building-material"
                className={`cfm-select ${fieldErrors.building_material ? 'is-invalid' : ''}`}
                value={selectedMaterialOption}
                onChange={(e) => {
                  clearFieldError('building_material');
                  const val = e.target.value;
                  setSelectedMaterialOption(val);
                  if (val === 'Other') {
                    const nextVal = customMaterialText.trim();
                    onChange({
                      ...centerForm,
                      building_material: nextVal,
                      building_material_id: null,
                    });
                  } else if (val === '') {
                    setCustomMaterialText('');
                    onChange({
                      ...centerForm,
                      building_material: '',
                      building_material_id: null,
                    });
                  } else {
                    setCustomMaterialText('');
                    const matchedMeta = (refMetadata.building_material || []).find(
                      (m) => m.name.toLowerCase() === val.toLowerCase()
                    );
                    onChange({
                      ...centerForm,
                      building_material: val,
                      building_material_id: matchedMeta ? matchedMeta.id : null,
                    });
                  }
                }}
              >
                <option value="">Select building material</option>
                {BUILDING_MATERIAL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
              {fieldErrors.building_material && (
                <p className="cfm-field-error">{fieldErrors.building_material}</p>
              )}

              {selectedMaterialOption === 'Other' && (
                <div className="cfm-field" style={{ marginTop: '10px' }}>
                  <label htmlFor="center-building-material-custom" className="cfm-label">
                    Specify material
                  </label>
                  <input
                    id="center-building-material-custom"
                    type="text"
                    className="cfm-input"
                    placeholder="e.g. Reinforced Concrete, Structural Steel"
                    value={customMaterialText}
                    onChange={(e) => {
                      clearFieldError('building_material');
                      const val = e.target.value;
                      setCustomMaterialText(val);
                      onChange({
                        ...centerForm,
                        building_material: val,
                        building_material_id: null,
                      });
                    }}
                  />
                </div>
              )}
            </div>

            <div className="cfm-field">
              <label htmlFor="center-contact" className="cfm-label">
                Contact Number
              </label>
              <input
                id="center-contact"
                type="text"
                maxLength={20}
                className={`cfm-input ${fieldErrors.contact_number ? 'is-invalid' : ''}`}
                placeholder="e.g. 0917-123-4567"
                value={centerForm.contact_number || ''}
                onChange={(e) => {
                  clearFieldError('contact_number');
                  onChange({ ...centerForm, contact_number: e.target.value });
                }}
              />
              {fieldErrors.contact_number && <p className="cfm-field-error">{fieldErrors.contact_number}</p>}
            </div>

            <div className="cfm-field">
              <label htmlFor="center-owner" className="cfm-label">
                Property Owner / Operator
              </label>
              <input
                id="center-owner"
                type="text"
                className={`cfm-input ${fieldErrors.owner_name ? 'is-invalid' : ''}`}
                placeholder="e.g. LGU Sogod, Private Owner Name"
                value={centerForm.owner_name || ''}
                onChange={(e) => {
                  clearFieldError('owner_name');
                  onChange({ ...centerForm, owner_name: e.target.value });
                }}
              />
              {fieldErrors.owner_name && <p className="cfm-field-error">{fieldErrors.owner_name}</p>}
            </div>
          </div>
        )}

        {/* Step 4: Amenities */}
        {currentStep === 4 && (
          <div key={4} className="cfm-step-panel">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="cfm-step-title">
              Amenities
            </h3>

            <fieldset className="cfm-amenities-fieldset">
              <div className="cfm-amenities-header">
                <legend className="cfm-amenities-legend">
                  <span className="cfm-amenities-legend-title">Amenities &amp; Facilities</span>
                  <span className="cfm-amenities-legend-count">
                    · {selectedAmenities.length} selected
                  </span>
                </legend>
                <div className="cfm-amenities-actions">
                  <button
                    type="button"
                    className="cfm-link-btn"
                    onClick={handleSelectAllAmenities}
                  >
                    Select all
                  </button>
                  <span className="cfm-amenities-sep" aria-hidden="true">·</span>
                  <button
                    type="button"
                    className="cfm-link-btn"
                    onClick={handleClearAmenities}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="cfm-amenities-grid">
                {AMENITIES_LIST.map((name, idx) => {
                  const isChecked = selectedAmenities.some(
                    (a) => a.toLowerCase() === name.toLowerCase()
                  );
                  const checkboxId = `amenity-check-${idx}`;

                  return (
                    <label
                      key={name}
                      htmlFor={checkboxId}
                      className={`cfm-amenity-card ${isChecked ? 'is-checked' : ''}`}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="cfm-amenity-checkbox"
                        checked={isChecked}
                        onChange={() => toggleAmenity(name)}
                      />
                      <span className="cfm-amenity-label">{name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}
      </form>
    </ModalShell>
  );
}

export function CenterRoomModal({
  mode = 'add',
  selectedCenter,
  selectedRoom,
  roomForm,
  onChange,
  saving = false,
  onSubmit,
  onClose,
  buildings = [],
  defaultBuildingId = '',
  onDeleteRoom,
}) {
  const isEdit = mode === 'edit';
  const title = !isEdit
    ? 'Add Room to ' + (selectedCenter?.name || 'the center')
    : 'Edit ' + formatRoomLabel(selectedRoom?.room_number);
  const subtitle = !isEdit ? 'Add a new room to this evacuation center' : 'Edit room details';
  const [fieldErrors, setFieldErrors] = useState({});

  function clearFieldError(field) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }
  function setFieldError(field, message) {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    let valid = true;
    if (!roomForm.room_number || !roomForm.room_number.trim()) {
      setFieldError('room_number', 'Room number is required.');
      valid = false;
    } else {
      clearFieldError('room_number');
    }
    if (!roomForm.capacity || Number(roomForm.capacity) <= 0) {
      setFieldError('capacity', 'Valid room capacity greater than 0 is required.');
      valid = false;
    } else {
      clearFieldError('capacity');
    }
    if (!valid) return;
    onSubmit(e);
  }

  const centerNotMapped = selectedCenter && centerNeedsMapping(selectedCenter);

  // Normalize buildings to {id, name} options (same logic as backup RoomModal)
  const buildingOptions = useMemo(() => {
    return buildings.map((item) => {
      const props = item?.properties || item || {};
      const id = props.id ?? item?.id;
      const name = props.name || props.display_label || `Building #${id}`;
      return { id, name };
    });
  }, [buildings]);

  const hasBuildings =
    selectedCenter?.center_type !== 'single_venue' && buildingOptions.length > 0;

  const modalFooter = (
    <div className="crm-footer">
      {isEdit && onDeleteRoom ? (
        <button
          type="button"
          className="crm-btn-delete"
          onClick={() => {
            onClose();
            onDeleteRoom(selectedRoom);
          }}
        >
          <FontAwesomeIcon icon={faTrash} />
          <span>Delete room</span>
        </button>
      ) : (
        <span className="crm-footer-spacer" />
      )}
      <div className="crm-footer-actions">
        <button
          type="button"
          className="crm-btn-cancel"
          disabled={saving}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="room-form"
          className="crm-btn-primary"
          disabled={saving}
        >
          {saving ? (
            <>
              <FontAwesomeIcon icon={faCircleNotch} spin size="xs" /> Saving...
            </>
          ) : isEdit ? (
            'Save'
          ) : (
            'Add Room'
          )}
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      open
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      formId="room-form"
      loading={saving}
      footer={modalFooter}
      dialogClassName="crm-dialog"
    >
      <form id="room-form" onSubmit={handleSubmit} noValidate>
        {centerNotMapped && (
          <p className="info-note">
            <span role="img" aria-label="info">\\u2139</span>{' '}
            This center isn\\u2019t on the map yet. You can still add a room; place the center on the map so staff can route families here.
          </p>
        )}
        <div className="form-group">
          <label htmlFor="room-number">
            Room Number / Name <span>*</span>
          </label>
          <input
            id="room-number"
            type="text"
            className={fieldErrors.room_number ? 'form-input is-invalid' : 'form-input'}
            placeholder="e.g. Room 101, Ground Floor"
            value={roomForm.room_number}
            onChange={(e) => {
              clearFieldError('room_number');
              onChange({ ...roomForm, room_number: e.target.value });
            }}
          />
          {fieldErrors.room_number && <p className="field-error">{fieldErrors.room_number}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="room-capacity">
            Room Capacity <span>*</span> <span className="hint">(Max people)</span>
          </label>
          <input
            id="room-capacity"
            type="number"
            min="1"
            className={fieldErrors.capacity ? 'form-input is-invalid' : 'form-input'}
            placeholder="e.g. 30"
            value={roomForm.capacity}
            onChange={(e) => {
              clearFieldError('capacity');
              onChange({ ...roomForm, capacity: e.target.value });
            }}
          />
          {isEdit && selectedRoom?.occupied > 0 && (
            <p className="field-error">
              Currently assigned: {selectedRoom.occupied}. Capacity cannot be less than this.
            </p>
          )}
          {fieldErrors.capacity && <p className="field-error">{fieldErrors.capacity}</p>}
        </div>
        {hasBuildings && (
          <div className="form-group">
            <label htmlFor="room-building">Building</label>
            <select
              id="room-building"
              className={fieldErrors.building_id ? 'form-input is-invalid' : 'form-input'}
              value={roomForm.building_id ?? ''}
              onChange={(e) => {
                clearFieldError('building_id');
                onChange({ ...roomForm, building_id: e.target.value });
              }}
            >
              <option value="">No building (unassigned)</option>
              {buildingOptions.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
            {fieldErrors.building_id && <p className="field-error">{fieldErrors.building_id}</p>}
          </div>
        )}
      </form>
    </ModalShell>
  );
}

export function BuildingFormModal({
  open = false,
  mode = 'add',
  buildingForm,
  onChange,
  activeRoomCount = 0,
  saving = false,
  onSubmit,
  onClose,
}) {
  const [fieldErrors, setFieldErrors] = useState({});
  function clearFieldError(field) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }
  function setFieldError(field, message) {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    let valid = true;
    if (!buildingForm.name || !buildingForm.name.trim()) {
      setFieldError('name', 'Building name is required.');
      valid = false;
    } else {
      clearFieldError('name');
    }

    if (
      buildingForm.max_rooms !== null &&
      buildingForm.max_rooms !== '' &&
      Number(buildingForm.max_rooms) < 1
    ) {
      setFieldError('max_rooms', 'Max rooms must be at least 1.');
      valid = false;
    } else if (
      mode === 'edit' &&
      buildingForm.max_rooms !== null &&
      buildingForm.max_rooms !== '' &&
      Number(buildingForm.max_rooms) < activeRoomCount
    ) {
      setFieldError(
        'max_rooms',
        `Max rooms cannot be less than currently linked rooms (${activeRoomCount}). Remove or unlink rooms first.`
      );
      valid = false;
    } else {
      clearFieldError('max_rooms');
    }

    if (
      buildingForm.floors !== null &&
      buildingForm.floors !== '' &&
      Number(buildingForm.floors) < 1
    ) {
      setFieldError('floors', 'Floors must be at least 1.');
      valid = false;
    } else {
      clearFieldError('floors');
    }

    if (!valid) return;
    onSubmit(e);
  }

  const isEdit = mode === 'edit';
  const title = isEdit ? `Edit Building` : 'Add Building';
  const subtitle = isEdit
    ? `Update ${buildingForm.name || 'building'} details and room capacity`
    : 'Add a new building to this evacuation center';

  const customFooter = (
    <>
      <button type="button" className="bfm-btn-cancel" disabled={saving} onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form="building-form" className="bfm-btn-primary" disabled={saving}>
        {saving ? (
          <>
            <FontAwesomeIcon icon={faCircleNotch} spin size="xs" /> Saving...
          </>
        ) : isEdit ? (
          'Save Changes'
        ) : (
          'Add Building'
        )}
      </button>
    </>
  );

  return (
    <ModalShell
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      formId="building-form"
      dialogClassName="bfm-dialog"
      footer={customFooter}
    >
      <form id="building-form" onSubmit={handleSubmit} noValidate className="bfm-form">
        <div className="bfm-field">
          <label htmlFor="building-name" className="bfm-label">
            Building Name <span className="bfm-required">*</span>
          </label>
          <input
            id="building-name"
            type="text"
            className={`bfm-input ${fieldErrors.name ? 'is-invalid' : ''}`}
            placeholder="e.g. Main Building, Science Wing"
            value={buildingForm.name || ''}
            onChange={(e) => {
              clearFieldError('name');
              onChange({ ...buildingForm, name: e.target.value });
            }}
          />
          {fieldErrors.name && <p className="bfm-field-error">{fieldErrors.name}</p>}
        </div>

        <div className="bfm-grid-2">
          <div className="bfm-field">
            <label htmlFor="building-max-rooms" className="bfm-label">
              Max Rooms
            </label>
            <input
              id="building-max-rooms"
              type="number"
              min="1"
              className={`bfm-input ${fieldErrors.max_rooms ? 'is-invalid' : ''}`}
              placeholder="e.g. 10 (leave empty for unlimited)"
              value={buildingForm.max_rooms ?? ''}
              onChange={(e) => {
                clearFieldError('max_rooms');
                onChange({
                  ...buildingForm,
                  max_rooms: e.target.value !== '' ? Number(e.target.value) : null,
                });
              }}
            />
            {fieldErrors.max_rooms && <p className="bfm-field-error">{fieldErrors.max_rooms}</p>}
            <p className="bfm-helper-text">
              {isEdit && activeRoomCount > 0
                ? `Currently linked rooms: ${activeRoomCount}. Limits total rooms this building can have.`
                : 'Maximum number of rooms this building can contain (optional). (Room Capacity Limit)'}
            </p>
          </div>

          <div className="bfm-field">
            <label htmlFor="building-floors" className="bfm-label">
              Floors
            </label>
            <input
              id="building-floors"
              type="number"
              min="1"
              className={`bfm-input ${fieldErrors.floors ? 'is-invalid' : ''}`}
              placeholder="e.g. 2 (optional)"
              value={buildingForm.floors ?? ''}
              onChange={(e) => {
                clearFieldError('floors');
                onChange({
                  ...buildingForm,
                  floors: e.target.value !== '' ? Number(e.target.value) : null,
                });
              }}
            />
            {fieldErrors.floors && <p className="bfm-field-error">{fieldErrors.floors}</p>}
            <p className="bfm-helper-text">Number of floors or levels in this building (optional)</p>
          </div>
        </div>

        <div className="bfm-field">
          <label htmlFor="building-status" className="bfm-label">
            Status
          </label>
          <select
            id="building-status"
            className={`bfm-select ${fieldErrors.status ? 'is-invalid' : ''}`}
            value={buildingForm.status || 'open'}
            onChange={(e) => {
              clearFieldError('status');
              onChange({ ...buildingForm, status: e.target.value });
            }}
          >
            <option value="open">Open (Operational)</option>
            <option value="closed">Closed</option>
            <option value="under_repair">Under Repair</option>
          </select>
          {fieldErrors.status && <p className="bfm-field-error">{fieldErrors.status}</p>}
          <p className="bfm-helper-text">Operational readiness of this facility building</p>
        </div>

        <div className="bfm-field">
          <label htmlFor="building-notes" className="bfm-label">
            Notes
          </label>
          <textarea
            id="building-notes"
            className={`bfm-textarea ${fieldErrors.notes ? 'is-invalid' : ''}`}
            placeholder="Optional notes or instructions for this building..."
            value={buildingForm.notes || ''}
            onChange={(e) => {
              clearFieldError('notes');
              onChange({ ...buildingForm, notes: e.target.value });
            }}
          />
          {fieldErrors.notes && <p className="bfm-field-error">{fieldErrors.notes}</p>}
        </div>
      </form>
    </ModalShell>
  );
}

export function AddBuildingModal(props) {
  return <BuildingFormModal {...props} mode="add" />;
}

export function EditBuildingModal(props) {
  return <BuildingFormModal {...props} mode="edit" />;
}

export function AssignFamilyModal({ open = false, selectedCenter, selectedRoom, availableFamilies = [], loadingAvailableFamilies = false, selectedFamilyIdToAssign = '', assigningFamily = false, onClose, onFamilyChange, onConfirm }) {
  const isSingleVenue = selectedCenter?.center_type === 'single_venue' || (!selectedRoom && (!selectedCenter?.rooms || selectedCenter.rooms.length === 0));

  // For single_venue or centers without rooms, we don't need a room - just the center
  if (!open || (!selectedRoom && !isSingleVenue)) return null;

  const selectedFamily = availableFamilies.find((f) => String(f.id) === String(selectedFamilyIdToAssign)) || null;
  const memCount = selectedFamily ? selectedFamily.member_count || selectedFamily.family_members || 1 : 0;

  const centerAssigned = Number(selectedCenter?.assigned ?? selectedCenter?.total_assigned ?? selectedCenter?.occupied ?? selectedCenter?.current_occupancy ?? 0);
  const remaining = isSingleVenue || !selectedRoom
    ? Math.max((selectedCenter?.capacity || 0) - centerAssigned, 0)
    : (selectedRoom?.available ?? ((selectedRoom?.capacity || 0) - (selectedRoom?.occupied || 0)));

  const isOverCapacity = selectedFamily && (selectedCenter?.capacity || selectedRoom?.capacity) && memCount > remaining;

  const title = isSingleVenue || !selectedRoom
    ? 'Assign Household to ' + (selectedCenter?.name || 'the venue')
    : 'Assign Household to ' + formatRoomLabel(selectedRoom?.room_number);
  const subtitle = selectedCenter?.name || '';

  return (
    <ModalShell open={open} title={title} subtitle={subtitle} onClose={onClose} onPrimary={onConfirm} loading={assigningFamily} primaryLabel={assigningFamily ? 'Assigning...' : 'Confirm Assignment'} primaryDisabled={!selectedFamilyIdToAssign || assigningFamily}>
      <p className="intro">Select an unassigned registered household. EvacWay verifies capacity before allocating.</p>
      <div className="form-group"><label htmlFor="assign-household">Select Unassigned Household</label><select id="assign-household" className="form-select" value={selectedFamilyIdToAssign} onChange={(e) => onFamilyChange(e.target.value)} disabled={loadingAvailableFamilies}><option value="">{loadingAvailableFamilies ? 'Loading unassigned households...' : availableFamilies.length === 0 ? 'No unassigned households available' : 'Choose household...'}</option>{availableFamilies.map((f) => (<option key={f.id} value={f.id}>{displayEntityName(f.household_head_name || f.head_name)} ({f.family_code}) · {f.member_count || f.family_members || 1} members · {f.barangay || 'No barangay'}</option>))}</select></div>
      {isSingleVenue || !selectedRoom ? (
        <div className="form-group"><label>Venue</label><p className="room-value">{selectedCenter?.name}</p></div>
      ) : (
        <div className="form-group"><label>Room</label><p className="room-value">{formatRoomLabel(selectedRoom?.room_number)}</p></div>
      )}
      <div className="capacity-summary">
        {isSingleVenue || !selectedRoom ? (
          <>
            <div className="capacity-row"><span className="capacity-label">Venue capacity</span><span className="capacity-value">{selectedCenter?.capacity || 0} people</span></div>
            <div className="capacity-row"><span className="capacity-label">Currently assigned</span><span className="capacity-value">{centerAssigned} people</span></div>
            <div className="capacity-row"><span className="capacity-label">Remaining capacity</span><span className="capacity-value" style={{ color: isOverCapacity ? 'var(--ew-danger-text)' : 'var(--ew-safe-text)' }}>{remaining} spaces left</span></div>
          </>
        ) : (
          <>
            <div className="capacity-row"><span className="capacity-label">Room capacity</span><span className="capacity-value">{selectedRoom?.capacity} people</span></div>
            <div className="capacity-row"><span className="capacity-label">Currently assigned</span><span className="capacity-value">{selectedRoom?.occupied || 0} people</span></div>
            <div className="capacity-row"><span className="capacity-label">Remaining capacity</span><span className="capacity-value" style={{ color: isOverCapacity ? 'var(--ew-danger-text)' : 'var(--ew-safe-text)' }}>{remaining} spaces left</span></div>
          </>
        )}
        {selectedFamily && (<div className="capacity-row"><span className="capacity-label">Household to assign</span><span className="capacity-value">{memCount} members</span></div>)}
        {isOverCapacity && selectedFamily && (<p className="capacity-warning"><FontAwesomeIcon icon={faTriangleExclamation} /> Warning: this household has {memCount} members but only {remaining} space left. Assigning would exceed capacity.</p>)}
      </div>
    </ModalShell>
  );
}

export function MoveFamilyModal({ open = false, movingFamily, selectedRoom, centers = [], targetCenterRooms = [], targetCenterId = '', targetRoomId = '', loadingTargetRooms = false, moving = false, onClose, onTargetCenterChange, onTargetRoomChange, onConfirmMove }) {
  if (!open || !movingFamily) return null;
  const needed = movingFamily.assigned_members || movingFamily.family_members || movingFamily.member_count || 1;
  const dest = targetRoomId ? targetCenterRooms.find((r) => String(r.id) === String(targetRoomId)) : null;
  const destRemaining = dest ? (dest.available ?? (dest.capacity - (dest.occupied || 0))) : null;
  const isOver = dest != null && destRemaining != null && needed > destRemaining;
  const title = 'Move Household to Another Room / Center';
  const subtitle = selectedRoom ? formatRoomLabel(selectedRoom.room_number) : 'Current room';
  return (
    <ModalShell open={open} title={title} subtitle={subtitle} onClose={onClose} onPrimary={onConfirmMove} loading={moving} primaryLabel={moving ? 'Moving...' : 'Confirm Move'} primaryDisabled={!targetRoomId || moving || isOver}>
      <div className="form-group"><label>Household</label><p className="room-value">{movingFamily.household_head_name || movingFamily.head_name || 'Unnamed'}</p></div>
      <div className="form-group"><label>Members to move</label><p className="room-value">{needed} people</p></div>
      <div className="form-group"><label>Current room</label><p className="room-value">{selectedRoom ? formatRoomLabel(selectedRoom.room_number) : 'Assigned'}</p></div>
      <div className="form-group"><label htmlFor="move-target-center">Target Evacuation Center</label><select id="move-target-center" className="form-select" value={targetCenterId} onChange={(e) => onTargetCenterChange(e.target.value)} disabled={loadingTargetRooms || moving}><option value="">Select destination center...</option>{(centers?.features || []).filter((c) => (c.properties || c).is_active).map((feature) => { const c = feature.properties || feature; const barangayNames = (c.barangays || []).map((barangay) => barangay.name).join(', '); return (<option key={c.id} value={c.id}>{c.name} (' + barangayNames + 'No barangay')</option>); }) }</select></div>
      <div className="form-group"><label htmlFor="move-target-room">Target Room</label><select id="move-target-room" className="form-select" value={targetRoomId} onChange={(e) => onTargetRoomChange(e.target.value)} disabled={!targetCenterId || loadingTargetRooms || moving}><option value="">Select target room...</option>{targetCenterRooms.map((r) => { const isCurrent = selectedRoom && String(r.id) === String(selectedRoom.id); return (<option key={r.id} value={r.id}>{formatRoomLabel(r.room_number)} &middot; Capacity: {r.capacity} &middot; Assigned: {r.occupied || 0} &middot; Remaining: {r.available ?? (r.capacity - (r.occupied || 0))}{isCurrent ? ' (Current)' : ''}</option>); }) }</select></div>
      {dest && (<div className="capacity-summary"><div className="capacity-row"><span className="capacity-label">Target room capacity</span><span className="capacity-value">{dest.capacity} people</span></div><div className="capacity-row"><span className="capacity-label">Target available spaces</span><span className="capacity-value" style={{ color: isOver ? 'var(--ew-danger-text)' : 'var(--ew-safe-text)' }}>{destRemaining} spaces</span></div><div className="capacity-row"><span className="capacity-label">Remaining after transfer</span><span className="capacity-value" style={{ color: isOver ? 'var(--ew-danger-text)' : 'var(--ew-safe-text)' }}>{destRemaining - needed} {isOver ? '(exceeds capacity)' : 'spaces'}</span></div></div>)}
      {isOver && dest && (<p className="capacity-warning"><FontAwesomeIcon icon={faXmark} /> Warning: this household needs {needed} spaces but the target room only has {destRemaining} available. The move would exceed capacity.</p>)}
    </ModalShell>
  );
}