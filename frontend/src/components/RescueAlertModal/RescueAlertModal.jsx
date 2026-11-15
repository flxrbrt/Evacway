import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLocationCrosshairs,
  faTriangleExclamation,
  faXmark,
  faMapPin,
  faCamera,
  faUser,
  faPhone,
} from "@fortawesome/free-solid-svg-icons";
import { api } from "../../services/api";
import { queryKeys } from "../../hooks/useEvacuationQueries";
import { createSelectedLocationElement } from "../../utils/mapLocationIndicators";
import { useAuth } from "../../context/AuthContext";
import "./RescueAlertModal.css";

const MAX_PHOTOS = 5;

// Hotline numbers reused from existing app data (backend/seed.py and evacuation centers)
const EMERGENCY_HOTLINES = [
  {
    label: "Municipal DRRMO",
    number: "0917 123 4567",
    tel: "09171234567",
  },
  {
    label: "Sogod Emergency Operations",
    number: "0917 987 6543",
    tel: "09179876543",
  },
];

export default function RescueAlertModal({
  onClose,
  onSubmitted,
  initialCoordinates = null,
  onPinOnMap,
  onLocationCaptured,
  onOpenLogin,
  onOpenSignUp,
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const loggedInName =
    user?.name ||
    user?.full_name ||
    (user?.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : "") ||
    user?.email ||
    "";
  const savedContactNumber = user?.contact_number || user?.phone || "";

  const [description, setDescription] = useState("");
  const [requesterName, setRequesterName] = useState(loggedInName);
  const [requesterContact, setRequesterContact] = useState(savedContactNumber);
  const [proofImages, setProofImages] = useState([]);
  const [locationDescription, setLocationDescription] = useState("");
  const [coordinates, setCoordinates] = useState(initialCoordinates);
  const [addressText, setAddressText] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const previewContainerRef = useRef(null);
  const previewMapRef = useRef(null);
  const previewMarkerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Create & cleanup object URLs for image previews
  const previewUrls = useMemo(
    () => proofImages.map((file) => URL.createObjectURL(file)),
    [proofImages]
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // Sync user details if logged in
  useEffect(() => {
    if (user) {
      if (loggedInName && !requesterName) setRequesterName(loggedInName);
      const userPhone = user.contact_number || user.phone || "";
      if (userPhone && !requesterContact) {
        setRequesterContact(userPhone);
      }
    }
  }, [user, loggedInName, requesterName, requesterContact]);

  // Sync initialCoordinates if provided
  useEffect(() => {
    if (initialCoordinates) {
      setCoordinates(initialCoordinates);
    }
  }, [initialCoordinates]);

  // Reverse geocode to resolve address / barangay text
  useEffect(() => {
    if (!user) return undefined;
    const lat = coordinates?.latitude ?? coordinates?.lat;
    const lng = coordinates?.longitude ?? coordinates?.lng;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      setAddressText("");
      return undefined;
    }

    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) return undefined;

    let cancelled = false;
    const url =
      `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}` +
      `&latitude=${lat}&types=locality,neighborhood,place,address&access_token=${encodeURIComponent(token)}`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        const feature = data.features?.[0];
        const name = feature?.properties?.name || feature?.properties?.place_formatted || "";
        setAddressText(name);
      })
      .catch(() => {
        if (!cancelled) setAddressText("");
      });

    return () => {
      cancelled = true;
    };
  }, [user, coordinates?.latitude, coordinates?.longitude, coordinates?.lat, coordinates?.lng]);

  // Non-interactive small Mapbox preview on the form
  useEffect(() => {
    if (!user) return undefined;
    const lat = Number(coordinates?.latitude ?? coordinates?.lat);
    const lng = Number(coordinates?.longitude ?? coordinates?.lng);
    if (!previewContainerRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }

    let map = previewMapRef.current;

    if (!map) {
      map = new mapboxgl.Map({
        container: previewContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [lng, lat],
        zoom: 15,
        interactive: false,
        attributionControl: false,
      });

      previewMapRef.current = map;

      map.on("load", () => {
        map.resize();
      });
    } else {
      map.setCenter([lng, lat]);
      setTimeout(() => map?.resize(), 50);
    }

    if (previewMarkerRef.current) {
      previewMarkerRef.current.remove();
    }

    const markerEl = createSelectedLocationElement();
    const marker = new mapboxgl.Marker({
      element: markerEl,
      anchor: "center",
    })
      .setLngLat([lng, lat])
      .addTo(map);

    previewMarkerRef.current = marker;

    return () => {
      // keep map cached during dialog life
    };
  }, [user, coordinates]);

  // Cleanup preview map on unmount
  useEffect(() => {
    return () => {
      if (previewMarkerRef.current) {
        previewMarkerRef.current.remove();
        previewMarkerRef.current = null;
      }
      if (previewMapRef.current) {
        previewMapRef.current.remove();
        previewMapRef.current = null;
      }
    };
  }, []);

  function handleLoginClick() {
    onClose?.();
    if (onOpenLogin) {
      onOpenLogin("Log in to send a rescue request to EvacWay response staff.");
    }
  }

  function handleSignUpClick() {
    onClose?.();
    if (onOpenSignUp) {
      onOpenSignUp();
    }
  }

  function captureLocation() {
    setLocationMessage("");
    setError("");
    if (!navigator.geolocation) {
      setLocationMessage("GPS is unavailable. Describe your location below.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const captured = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setCoordinates(captured);
        setLocationMessage("Current GPS coordinates captured.");
        setLocating(false);

        if (onLocationCaptured) {
          onLocationCaptured({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        }
      },
      () => {
        setCoordinates(null);
        setLocationMessage("GPS was not shared. Describe your location below.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function handleFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const remainingSlots = MAX_PHOTOS - proofImages.length;
    if (files.length > remainingSlots) {
      setError(`You can attach up to ${MAX_PHOTOS} photos total.`);
      const allowed = files.slice(0, Math.max(0, remainingSlots));
      if (allowed.length > 0) {
        setProofImages((prev) => [...prev, ...allowed]);
      }
      return;
    }

    setProofImages((prev) => [...prev, ...files]);
    setError("");
  }

  function handleRemovePhoto(indexToRemove) {
    setProofImages((prev) => prev.filter((_, index) => index !== indexToRemove));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const finalName = (loggedInName || user?.email || "Resident").trim();
    if (!finalName) {
      setError("Please provide your name.");
      return;
    }

    // Optional contact number: fallback to saved number if left empty, or empty string
    const savedContact = (user?.contact_number || user?.phone || "").trim();
    const finalContact = requesterContact.trim() || savedContact || "";

    if (!coordinates && !locationDescription.trim()) {
      setError("Share your GPS location or describe where help is needed.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("description", description.trim());
      formData.append("requester_name", finalName);
      formData.append("requester_contact", finalContact);
      formData.append("location_description", locationDescription.trim() || "");
      formData.append("latitude", coordinates?.latitude ?? coordinates?.lat ?? "");
      formData.append("longitude", coordinates?.longitude ?? coordinates?.lng ?? "");
      proofImages.forEach((file) => formData.append("proof_images", file));

      await api.submitRescueRequest(formData);
      await queryClient.invalidateQueries({ queryKey: queryKeys.rescueRequests });
      onSubmitted();
    } catch (requestError) {
      setError(requestError.message || "Rescue request could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasCoords = coordinates && Number.isFinite(Number(coordinates.latitude ?? coordinates.lat));

  return (
    <div
      className="rescue-overlay"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      {!user ? (
        /* Not logged in: simple message screen with hotline card */
        <div
          className="rescue-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rescue-title"
        >
          <header className="rescue-header">
            <div className="rescue-header-text">
              <span className="rescue-eyebrow">
                <FontAwesomeIcon icon={faTriangleExclamation} /> Emergency Dispatch
              </span>
              <h2 id="rescue-title">Request Rescue</h2>
              <p className="rescue-intro">
                Send your situation directly to EvacWay response staff.
              </p>
            </div>
            <button
              type="button"
              className="rescue-close"
              onClick={onClose}
              aria-label="Close rescue request"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </header>

          <div className="rescue-body rescue-unauth-body">
            <p className="rescue-unauth-notice">
              Log in to send a rescue request to EvacWay response staff.
            </p>

            <div className="rescue-hotline-card">
              <div className="rescue-hotline-header">
                <span className="rescue-hotline-title">Emergency Hotlines</span>
                <span className="rescue-hotline-badge">24/7 Response</span>
              </div>

              <div className="rescue-hotline-list">
                {EMERGENCY_HOTLINES.map((item) => (
                  <a
                    key={item.tel}
                    href={`tel:${item.tel}`}
                    className="rescue-hotline-link"
                    title={`Call ${item.label} (${item.number})`}
                  >
                    <div className="rescue-hotline-icon">
                      <FontAwesomeIcon icon={faPhone} />
                    </div>
                    <div className="rescue-hotline-details">
                      <strong className="rescue-hotline-number">{item.number}</strong>
                      <span className="rescue-hotline-label">{item.label}</span>
                    </div>
                  </a>
                ))}
              </div>

              <p className="rescue-hotline-note">
                If someone’s life is in danger, call now.
              </p>
            </div>
          </div>

          <footer className="rescue-unauth-footer">
            <div className="rescue-unauth-btn-row">
              <button
                type="button"
                className="rescue-btn-login"
                onClick={handleLoginClick}
              >
                Log in
              </button>
              <button
                type="button"
                className="rescue-btn-close-action"
                onClick={onClose}
              >
                Close
              </button>
            </div>
            <div className="rescue-unauth-signup-row">
              <span className="rescue-unauth-signup-text">
                Don’t have an account?{" "}
                <button
                  type="button"
                  className="rescue-unauth-signup-link"
                  onClick={handleSignUpClick}
                >
                  Sign up.
                </button>
              </span>
            </div>
          </footer>
        </div>
      ) : (
        /* Logged in: full rescue request form */
        <form
          className="rescue-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rescue-title"
          onSubmit={handleSubmit}
        >
          <header className="rescue-header">
            <div className="rescue-header-text">
              <span className="rescue-eyebrow">
                <FontAwesomeIcon icon={faTriangleExclamation} /> Emergency Dispatch
              </span>
              <h2 id="rescue-title">Request Rescue</h2>
              <p className="rescue-intro">
                Send your situation directly to EvacWay response staff.
              </p>
            </div>
            <button
              type="button"
              className="rescue-close"
              onClick={onClose}
              aria-label="Close rescue request"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </header>

          <div className="rescue-body">
            {error && (
              <p className="rescue-error" role="alert">
                {error}
              </p>
            )}

            {/* Requesting as verified account info */}
            <div className="rescue-logged-in-box">
              <div className="rescue-logged-in-profile">
                <div className="rescue-logged-in-avatar">
                  <FontAwesomeIcon icon={faUser} />
                </div>
                <div className="rescue-logged-in-details">
                  <span className="rescue-logged-in-label">Requesting as:</span>
                  <strong className="rescue-logged-in-name">{loggedInName}</strong>
                  {user.email && <span className="rescue-logged-in-email">{user.email}</span>}
                </div>
              </div>
              <label className="rescue-field" style={{ margin: 0 }}>
                <span className="rescue-field-label">
                  <FontAwesomeIcon icon={faPhone} className="rescue-label-icon" />
                  Contact number for rescuers (optional)
                </span>
                <input
                  type="tel"
                  className="rescue-text-input"
                  value={requesterContact}
                  onChange={(event) => setRequesterContact(event.target.value)}
                  maxLength={20}
                  placeholder="e.g. 0917 123 4567"
                />
                <small className="rescue-field-hint">
                  We’ll use your saved number if you leave this as is. Update it if it has changed.
                </small>
              </label>
            </div>

            <label className="rescue-field">
              <span className="rescue-field-label">
                What help do you need? <em className="rescue-req">*</em>
              </span>
              <textarea
                className="rescue-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                required
                rows={3}
                placeholder="Describe the emergency, water level, injuries, or anyone who needs immediate assistance."
              />
            </label>

            {/* Photo Upload */}
            <div className="rescue-field">
              <div className="rescue-field-label-row">
                <span className="rescue-field-label">Situation photos</span>
                <span className="rescue-field-optional">
                  Optional ({proofImages.length}/{MAX_PHOTOS})
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="rescue-file-input-hidden"
                onChange={handleFilesSelected}
              />

              <div className="rescue-photo-upload">
                {proofImages.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    className="rescue-upload-trigger"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="rescue-upload-icon-badge">
                      <FontAwesomeIcon icon={faCamera} />
                    </span>
                    <span className="rescue-upload-copy">
                      <strong>Add photo proof</strong>
                      <small>JPG, PNG, or WebP · Up to 5 photos</small>
                    </span>
                    <span className="rescue-upload-cta">Browse</span>
                  </button>
                )}

                {proofImages.length > 0 && (
                  <div className="rescue-image-preview">
                    {proofImages.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="rescue-image-preview-item">
                        <img
                          src={previewUrls[index]}
                          alt={`Selected proof ${index + 1}`}
                          className="rescue-image-preview-img"
                        />
                        <button
                          type="button"
                          className="rescue-image-remove"
                          onClick={() => handleRemovePhoto(index)}
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            <div className="rescue-field">
              <div className="rescue-field-label-row">
                <span className="rescue-field-label">
                  Location <em className="rescue-req">*</em>
                </span>
                {hasCoords && <span className="rescue-gps-pill">GPS Locked</span>}
              </div>

              <div className="rescue-location-btn-row">
                <button
                  type="button"
                  className="rescue-location-button"
                  onClick={captureLocation}
                  disabled={locating}
                >
                  <FontAwesomeIcon icon={faLocationCrosshairs} />
                  <span>
                    {locating
                      ? "Getting GPS…"
                      : hasCoords
                        ? "Update GPS"
                        : "Use my current GPS"}
                  </span>
                </button>
                {onPinOnMap && (
                  <button
                    type="button"
                    className="rescue-location-button rescue-pin-button"
                    onClick={onPinOnMap}
                  >
                    <FontAwesomeIcon icon={faMapPin} />
                    <span>Pin on map</span>
                  </button>
                )}
              </div>

              {hasCoords && (
                <div className="rescue-preview-card">
                  <div ref={previewContainerRef} className="rescue-preview-map" />
                  <div className="rescue-preview-meta">
                    <div className="rescue-preview-coords">
                      {Number(coordinates.latitude ?? coordinates.lat).toFixed(5)}° N,{" "}
                      {Number(coordinates.longitude ?? coordinates.lng).toFixed(5)}° E
                    </div>
                    <div
                      className={`rescue-preview-address ${!addressText ? "rescue-preview-address-muted" : ""}`}
                    >
                      {addressText || "Sogod, Southern Leyte"}
                    </div>
                  </div>
                </div>
              )}

              {locationMessage && (
                <small className="rescue-location-message" role="status">
                  {locationMessage}
                </small>
              )}

              <input
                type="text"
                className="rescue-text-input"
                value={locationDescription}
                onChange={(event) => setLocationDescription(event.target.value)}
                maxLength={255}
                required={!hasCoords}
                placeholder={
                  hasCoords
                    ? "Optional landmark, house color, or floor level"
                    : "Landmark, street, or barangay (required if no GPS)"
                }
              />
            </div>
          </div>

          <footer className="rescue-actions">
            <button type="button" className="rescue-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="rescue-submit"
              disabled={submitting || locating}
            >
              {submitting ? "Sending request…" : "Send rescue alert"}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}
