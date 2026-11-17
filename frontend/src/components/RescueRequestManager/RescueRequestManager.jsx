import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLocationDot,
  faTriangleExclamation,
  faSearch,
  faXmark,
  faPhone,
  faClock,
  faUser,
  faCompass,
  faImages,
  faImage,
  faCheck,
  faExpand,
  faRotateRight,
  faCircleCheck,
  faBell,
  faTruckFast,
  faInbox,
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { api, BASE_URL } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { queryKeys, useRescueRequests } from "../../hooks/useEvacuationQueries";
import "./RescueRequestManager.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const STATUS_OPTIONS = ["pending", "acknowledged", "responding", "resolved"];

const STATUS_LABELS = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  responding: "Responding",
  resolved: "Resolved",
};

function isOpenStatus(status) {
  return status === "pending" || status === "open";
}

function isInProgressStatus(status) {
  return (
    status === "acknowledged" ||
    status === "responding" ||
    status === "in_progress"
  );
}

function isResolvedStatus(status) {
  return status === "resolved";
}

/**
 * Maps rescue request status to standardized pill variant classes
 * matching CenterList ec-status-pill pattern:
 * - pending → --pending (info/blue)
 * - acknowledged → --near-full (warning/amber)
 * - responding/in_progress → --in-progress (info/blue)
 * - resolved → --available (success/green)
 */
function getRescueStatusPillClass(status) {
  switch (status) {
    case "pending":
      return "rescue-status-badge--pending";
    case "acknowledged":
      return "rescue-status-badge--near-full";
    case "responding":
    case "in_progress":
      return "rescue-status-badge--in-progress";
    case "resolved":
      return "rescue-status-badge--available";
    default:
      return "rescue-status-badge--pending";
  }
}

function getLocationSourceInfo(item) {
  if (!item) return null;
  const isManual = Boolean(item.is_manual_pin || item.location_source === "manual");
  const acc =
    item.accuracy != null && Number.isFinite(Number(item.accuracy))
      ? Number(item.accuracy)
      : null;
  const isApprox =
    !isManual &&
    (item.location_source === "approximate" || (acc != null && acc > 100));

  if (isManual) {
    return {
      type: "manual",
      label: "Manually pinned",
      className: "rescue-loc-source-pill--manual",
      accuracyText: null,
      fullAccuracyText: null,
    };
  }
  if (isApprox) {
    return {
      type: "approximate",
      label: "Approximate",
      className: "rescue-loc-source-pill--approximate",
      accuracyText: acc != null ? `±${Math.round(acc)}m` : null,
      fullAccuracyText: acc != null ? `Accuracy: about ${Math.round(acc)} m` : "Approximate location",
    };
  }
  if (item.latitude != null && Number.isFinite(Number(item.latitude))) {
    return {
      type: "gps",
      label: "GPS",
      className: "rescue-loc-source-pill--gps",
      accuracyText: acc != null ? `±${Math.round(acc)}m` : null,
      fullAccuracyText: acc != null ? `Accuracy: about ${Math.round(acc)} m` : "GPS fix",
    };
  }
  return null;
}

function resolveProofImageUrl(img) {
  if (!img || typeof img !== "string") return "";
  if (img.startsWith("http://") || img.startsWith("https://") || img.startsWith("data:")) {
    return img;
  }
  return `${BASE_URL}${img.startsWith("/") ? "" : "/"}${img}`;
}

/**
 * Context-aware time status formatting.
 * For resolved alerts: shows "Resolved · 4d ago" instead of "waiting 4d".
 * For in-progress alerts: shows "Responding · 45m".
 * For open alerts: shows "Waiting 15m" (with urgency flags if >30m).
 */
function getAlertTimeStatus(item, now = Date.now()) {
  const status = item?.status;
  const createdAt = item?.created_at;
  const updatedAt = item?.updated_at || item?.resolved_at || item?.created_at;

  if (isResolvedStatus(status)) {
    if (!updatedAt) {
      return { text: "Resolved", icon: faCircleCheck, statusClass: "is-resolved", isUrgent: false };
    }
    const date = new Date(updatedAt);
    const diffMs = Math.max(0, now - (Number.isNaN(date.getTime()) ? now : date.getTime()));
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let text = "Resolved";
    if (days >= 1) text = `Resolved · ${days}d ago`;
    else if (hours >= 1) text = `Resolved · ${hours}h ago`;
    else text = `Resolved · ${Math.max(1, minutes)}m ago`;

    return { text, icon: faCircleCheck, statusClass: "is-resolved", isUrgent: false };
  }

  if (isInProgressStatus(status)) {
    if (!createdAt) {
      return { text: "Responding", icon: faTruckFast, statusClass: "is-in-progress", isUrgent: false };
    }
    const date = new Date(createdAt);
    const diffMs = Math.max(0, now - (Number.isNaN(date.getTime()) ? now : date.getTime()));
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;

    let text = "Responding";
    if (hours >= 1) {
      text = remMinutes > 0 ? `Responding · ${hours}h ${remMinutes}m` : `Responding · ${hours}h`;
    } else {
      text = `Responding · ${Math.max(1, minutes)}m`;
    }

    return { text, icon: faTruckFast, statusClass: "is-in-progress", isUrgent: false };
  }

  // Open / Pending
  if (!createdAt) {
    return { text: "Waiting for response", icon: faClock, statusClass: "is-waiting", isUrgent: false };
  }
  const date = new Date(createdAt);
  const diffMs = Math.max(0, now - (Number.isNaN(date.getTime()) ? now : date.getTime()));
  const minutes = Math.floor(diffMs / (1000 * 60));
  const isUrgent = minutes >= 30;

  if (minutes < 1) {
    return { text: "Waiting < 1 min", icon: faClock, statusClass: "is-waiting", isUrgent: false };
  }
  if (minutes < 60) {
    return { text: `Waiting ${minutes} min`, icon: faClock, statusClass: "is-waiting", isUrgent };
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) {
    return {
      text: remMinutes > 0 ? `Waiting ${hours}h ${remMinutes}m` : `Waiting ${hours}h`,
      icon: faClock,
      statusClass: "is-waiting",
      isUrgent: true,
    };
  }
  const days = Math.floor(hours / 24);
  return { text: `Waiting ${days}d`, icon: faClock, statusClass: "is-waiting", isUrgent: true };
}

export default function RescueRequestManager({ initialRequestId, onOpenMap }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const requestsQuery = useRescueRequests();
  const refetchRequests = requestsQuery.refetch;
  const requests = requestsQuery.data || [];
  const loading = requestsQuery.isLoading;

  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedId, setSelectedId] = useState(initialRequestId || null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [activeProofIdx, setActiveProofIdx] = useState(0);
  const [failedProofImages, setFailedProofImages] = useState({});
  const [mapImgFailed, setMapImgFailed] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [now, setNow] = useState(Date.now());
  const listScrollRef = useRef(null);
  const proofTouchStartXRef = useRef(null);

  useEffect(() => {
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }
  }, [page, pageSize]);

  // Periodically refresh waiting timer calculations
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Sync initialRequestId from props if changed
  useEffect(() => {
    if (initialRequestId) {
      setSelectedId(initialRequestId);
    }
  }, [initialRequestId]);

  // Reset map image fallback state and clear any notification when selected request changes
  useEffect(() => {
    setMapImgFailed(false);
    setLightboxImage(null);
    if (selectedId != null) {
      api.clearNotificationsByResource("rescue_request", selectedId)
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }))
        .catch(() => { });
    }
  }, [selectedId, queryClient]);

  // Refresh data when window becomes visible
  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") refetchRequests();
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [refetchRequests]);

  // Close lightbox or drawer on Escape key press
  useEffect(() => {
    if (!selectedId && !lightboxImage) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (lightboxImage) {
          setLightboxImage(null);
        } else {
          setSelectedId(null);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, lightboxImage]);

  async function updateStatus(requestId, status) {
    setUpdatingId(requestId);
    setError("");
    try {
      const updated = await api.updateRescueRequest(requestId, status);
      queryClient.setQueryData(queryKeys.rescueRequests, (current = []) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.rescueRequests });
    } catch (requestError) {
      setError(requestError.message || "Rescue request status could not be updated.");
    } finally {
      setUpdatingId(null);
    }
  }

  // Calculate status counts
  const openCount = useMemo(
    () => requests.filter((r) => isOpenStatus(r.status)).length,
    [requests]
  );
  const inProgressCount = useMemo(
    () => requests.filter((r) => isInProgressStatus(r.status)).length,
    [requests]
  );
  const resolvedCount = useMemo(
    () => requests.filter((r) => isResolvedStatus(r.status)).length,
    [requests]
  );
  const totalCount = requests.length;

  const statCards = [
    {
      id: "all",
      label: "Total Requests",
      count: totalCount,
      sub: "All time recorded",
      icon: faInbox,
      variant: "neutral",
    },
    {
      id: "open",
      label: "Open Alerts",
      count: openCount,
      sub: openCount > 0 ? "Requires response" : "All clear",
      icon: faBell,
      variant: "pending",
    },
    {
      id: "in_progress",
      label: "In Progress",
      count: inProgressCount,
      sub: inProgressCount > 0 ? "Responders active" : "None active",
      icon: faTruckFast,
      variant: "in-progress",
    },
    {
      id: "resolved",
      label: "Resolved",
      count: resolvedCount,
      sub: "Successfully assisted",
      icon: faCircleCheck,
      variant: "resolved",
    },
  ];

  // Filter requests based on search query and selected filter
  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanQ = q.replace(/^#/, "").replace(/^rescue alert\s*#?/i, "").trim();

    return requests.filter((item) => {
      if (filterStatus === "open" && !isOpenStatus(item.status)) return false;
      if (filterStatus === "in_progress" && !isInProgressStatus(item.status)) return false;
      if (filterStatus === "resolved" && !isResolvedStatus(item.status)) return false;

      if (q) {
        const idStr = String(item.id || "");
        const matchId = cleanQ ? idStr.includes(cleanQ) : false;
        const name = (
          item.requester_name ||
          item.name ||
          item.user_name ||
          item.full_name ||
          ""
        ).toLowerCase();
        const matchName = name.includes(q);
        const contact = (
          item.requester_contact ||
          item.contact_number ||
          item.phone ||
          ""
        ).toLowerCase();
        const matchContact = contact.includes(q);
        const barangay = (item.barangay || item.barangay_name || "").toLowerCase();
        const matchBarangay = barangay.includes(q);
        const locDesc = (item.location_description || "").toLowerCase();
        const matchLoc = locDesc.includes(q);
        const desc = (item.description || "").toLowerCase();
        const matchDesc = desc.includes(q);

        if (
          !matchId &&
          !matchName &&
          !matchContact &&
          !matchBarangay &&
          !matchLoc &&
          !matchDesc
        ) {
          return false;
        }
      }
      return true;
    });
  }, [requests, filterStatus, searchQuery]);

  // Open requests sort oldest first; non-open sort newest first
  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      const aOpen = isOpenStatus(a.status);
      const bOpen = isOpenStatus(b.status);

      if (aOpen && !bOpen) return -1;
      if (!aOpen && bOpen) return 1;

      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;

      if (aOpen && bOpen) {
        return timeA - timeB;
      }

      return timeB - timeA;
    });
  }, [filteredRequests]);

  const totalFiltered = sortedRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedRequests = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRequests.slice(start, start + pageSize);
  }, [sortedRequests, safePage, pageSize]);

  const paginationItems = useMemo(() => {
    if (totalPages <= 1) return [];
    const pages = [];
    for (let i = 1; i <= totalPages; i += 1) {
      if (i === 1 || i === totalPages || Math.abs(i - safePage) <= 1) {
        pages.push(i);
      }
    }
    const items = [];
    for (let i = 0; i < pages.length; i += 1) {
      const p = pages[i];
      const prev = pages[i - 1];
      if (i > 0) {
        if (p - prev === 2) {
          items.push(prev + 1);
        } else if (p - prev > 2) {
          items.push(`ellipsis-${prev}`);
        }
      }
      items.push(p);
    }
    return items;
  }, [totalPages, safePage]);

  const selected = requests.find((item) => item.id === selectedId);
  const visibleError = error || requestsQuery.error?.message || "";

  function handleSearchChange(nextQuery) {
    setSearchQuery(nextQuery);
    setPage(1);
  }

  function handleFilterStatusChange(nextStatus) {
    setFilterStatus(nextStatus);
    setPage(1);
  }

  function clearFilters() {
    setSearchQuery("");
    setFilterStatus("all");
    setPage(1);
  }

  function handleViewOnMap() {
    if (!selected) return;
    if (typeof onOpenMap === "function") {
      onOpenMap(selected);
      return;
    }
    const lat = Number(selected.latitude);
    const lng = Number(selected.longitude);
    const isLgu = user?.role === "lgu_personnel";
    const staffMapPath = isLgu ? "/lgu/map" : "/admin/map";
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const params = new URLSearchParams();
      params.set("lat", lat);
      params.set("lng", lng);
      params.set("rescue", selected.id);

      const bName = selected.barangay || selected.barangay_name || "";
      if (bName) params.set("barangay", bName);

      navigate(`${staffMapPath}?${params.toString()}`);
    } else {
      navigate(staffMapPath);
    }
  }

  const selectedContactNumber =
    selected?.requester_contact ||
    selected?.contact_number ||
    selected?.phone_number ||
    selected?.phone ||
    selected?.contact ||
    null;

  const selectedRequesterName =
    selected?.requester_name ||
    selected?.name ||
    selected?.user_name ||
    selected?.full_name ||
    null;

  const selectedPeopleCount =
    selected?.number_of_people ??
    selected?.people_count ??
    selected?.num_people ??
    selected?.people ??
    selected?.family_members ??
    null;

  const selectedTimeStatus = selected ? getAlertTimeStatus(selected, now) : null;
  const currentStatusIndex = selected
    ? STATUS_OPTIONS.indexOf(selected.status)
    : -1;

  const hasSelectedCoords =
    selected &&
    selected.latitude != null &&
    selected.longitude != null &&
    Number.isFinite(Number(selected.latitude)) &&
    Number.isFinite(Number(selected.longitude));

  const proofImages = useMemo(() => {
    if (!selected || !Array.isArray(selected.proof_images)) return [];
    return selected.proof_images.map(resolveProofImageUrl).filter(Boolean);
  }, [selected]);

  const safeProofIdx =
    proofImages.length > 0 ? Math.min(activeProofIdx, proofImages.length - 1) : 0;

  function openRequest(id) {
    setSelectedId(id);
    setActiveProofIdx(0);
    setFailedProofImages({});
  }

  function closeRequest() {
    setSelectedId(null);
    setLightboxImage(null);
  }

  function handlePrevProof() {
    if (proofImages.length <= 1) return;
    setActiveProofIdx((prev) => (prev > 0 ? prev - 1 : proofImages.length - 1));
  }

  function handleNextProof() {
    if (proofImages.length <= 1) return;
    setActiveProofIdx((prev) => (prev < proofImages.length - 1 ? prev + 1 : 0));
  }

  function handleProofTouchStart(e) {
    if (e.touches && e.touches.length === 1) {
      proofTouchStartXRef.current = e.touches[0].clientX;
    }
  }

  function handleProofTouchEnd(e) {
    if (proofTouchStartXRef.current === null) return;
    const diff = proofTouchStartXRef.current - e.changedTouches[0].clientX;
    if (diff > 40) {
      handleNextProof();
    } else if (diff < -40) {
      handlePrevProof();
    }
    proofTouchStartXRef.current = null;
  }

  function handleProofKeyDown(e) {
    if (proofImages.length > 1) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        handlePrevProof();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        handleNextProof();
        return;
      }
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      const currentUrl = proofImages[safeProofIdx];
      if (currentUrl) setLightboxImage(currentUrl);
    }
  }

  return (
    <main className="rescue-queue-page">
      {/* 1. HEADER */}
      <header className="rescue-queue-header">
        <div className="rescue-queue-title-area">
          <span className="rescue-queue-eyebrow">Emergency Operations · Dispatch Center</span>
          <h1>Rescue Alerts</h1>
          <p className="rescue-queue-subtitle">
            Review and respond to emergency rescue requests from residents in real-time.
          </p>
        </div>
        <div className="rescue-header-right">
          <span
            className={`rescue-open-count ${openCount > 0 ? "is-active" : "is-zero"}`}
            aria-live="polite"
          >
            <span className="rescue-open-dot" />
            {openCount > 0 ? (
              <span><strong>{openCount}</strong> {openCount === 1 ? "Open Alert" : "Open Alerts"}</span>
            ) : (
              <span>All Clear · 0 open alerts</span>
            )}
          </span>

        </div>
      </header>

      {visibleError && (
        <p className="rescue-queue-error" role="alert">
          {visibleError}
        </p>
      )}

      {/* 2. STAT CARDS */}
      <section
        className="stat-card-grid cols-4"
        aria-label="Rescue alert summary and filters"
      >
        {statCards.map((card) => {
          const isSelected = filterStatus === card.id;
          return (
            <button
              type="button"
              key={card.id}
              className={`stat-card is-clickable is-${card.variant} ${isSelected ? "is-selected" : ""}`}
              onClick={() => handleFilterStatusChange(card.id)}
              aria-pressed={isSelected}
            >
              <div className="stat-card-content">
                <span className="stat-card-label">{card.label}</span>
                <strong className="stat-card-value">{card.count}</strong>
                <span className="stat-card-hint">{card.sub}</span>
              </div>
              <span className={`stat-card-icon stat-card-icon--${card.variant}`} aria-hidden="true">
                <FontAwesomeIcon icon={card.icon} />
              </span>
            </button>
          );
        })}
      </section>

      {/* 3. TABLE CARD: TOOLBAR + SCROLLABLE ROWS + PAGINATION */}
      <section className="rescue-list-section" aria-label="Rescue requests list">
        <div className="rescue-filter-toolbar">
          <div className="rescue-search-wrapper">
            <FontAwesomeIcon icon={faSearch} className="rescue-search-icon" />
            <input
              type="search"
              className="rescue-search-input"
              placeholder="Search by requester name, contact, ID, or location…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Search rescue requests"
            />
            {searchQuery && (
              <button
                type="button"
                className="rescue-search-clear"
                onClick={() => handleSearchChange("")}
                aria-label="Clear search"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>
        </div>

        {/* REQUESTS LIST SCROLL CONTAINER */}
        <div ref={listScrollRef} className="rescue-request-container">
          {loading ? (
            <div className="rescue-loading-state" role="status">
              <FontAwesomeIcon icon={faRotateRight} spin />
              <span>Loading rescue requests…</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="rescue-empty-state">
              <div className="rescue-empty-icon-wrap">
                <FontAwesomeIcon icon={faCircleCheck} />
              </div>
              <h3>No rescue requests yet</h3>
              <p>Emergency rescue signals from residents will appear here immediately.</p>
            </div>
          ) : sortedRequests.length === 0 ? (
            <div className="rescue-empty-state">
              <div className="rescue-empty-icon-wrap">
                <FontAwesomeIcon icon={faSearch} />
              </div>
              <h3>No matching requests</h3>
              <p>No alerts match your current search or status filter.</p>
              <button
                type="button"
                className="rescue-clear-filters-btn"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="rescue-request-list" role="list">
              <div className="rescue-table-header" aria-hidden="true">
                <span className="rescue-th-cell">Requester</span>
                <span className="rescue-th-cell">Location</span>
                <span className="rescue-th-cell">Time</span>
                <span className="rescue-th-status">Status</span>
              </div>

              {paginatedRequests.map((item) => {
                const requesterName =
                  item.requester_name ||
                  item.name ||
                  item.user_name ||
                  item.full_name ||
                  `Rescue Alert #${item.id}`;
                const requesterContact =
                  item.requester_contact ||
                  item.contact_number ||
                  item.phone_number ||
                  item.phone ||
                  item.contact ||
                  null;
                const barangayText =
                  item.barangay ||
                  item.barangay_name ||
                  item.location_description ||
                  "Sogod, Southern Leyte";
                const photoCount = Array.isArray(item.proof_images)
                  ? item.proof_images.length
                  : 0;
                const timeStatus = getAlertTimeStatus(item, now);
                const timeText = item.created_at
                  ? new Date(item.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                  : "";
                const isStillOpen = isOpenStatus(item.status);
                const isResolved = isResolvedStatus(item.status);
                const isSelected = selectedId === item.id;
                const statusIcon = isStillOpen
                  ? faTriangleExclamation
                  : isResolved
                    ? faCircleCheck
                    : faTruckFast;
                const statusClass = isStillOpen
                  ? "is-open"
                  : isResolved
                    ? "is-resolved"
                    : "is-in-progress";
                const statusLabel =
                  STATUS_LABELS[item.status] || item.status.replace("_", " ");

                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`rescue-request-card ${statusClass} ${isSelected ? "is-selected" : ""}`}
                    onClick={() => openRequest(item.id)}
                    aria-label={`View details for Rescue Alert #${item.id}, requested by ${requesterName}`}
                  >
                    <div className="rescue-row-desktop-content">
                      <div className="rescue-col-requester">
                        <span
                          className={`rescue-row-status-icon ${statusClass}`}
                          aria-hidden="true"
                        >
                          <FontAwesomeIcon icon={statusIcon} />
                        </span>
                        <div className="rescue-requester-stack">
                          <div className="rescue-requester-heading">
                            <strong className="rescue-row-name">{requesterName}</strong>
                            <span className="rescue-row-id">#{item.id}</span>
                          </div>
                          <div
                            className={`rescue-requester-phone ${!requesterContact ? "is-missing" : ""}`}
                          >
                            <FontAwesomeIcon icon={faPhone} />
                            <span>{requesterContact || "Not provided"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rescue-col-location">
                        <span className="rescue-row-barangay">{barangayText}</span>
                        <div className="rescue-row-loc-sub">
                          {(() => {
                            const locSource = getLocationSourceInfo(item);
                            if (!locSource) return null;
                            return (
                              <span className={`rescue-loc-source-pill ${locSource.className}`}>
                                <span className="rescue-badge-dot" />
                                {locSource.label}
                                {locSource.accuracyText && (
                                  <span className="rescue-loc-acc-tag">{locSource.accuracyText}</span>
                                )}
                              </span>
                            );
                          })()}
                          {photoCount > 0 && (
                            <span className="rescue-row-photos">
                              <FontAwesomeIcon icon={faImages} />
                              <span>
                                {photoCount} {photoCount === 1 ? "photo" : "photos"}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={`rescue-col-time ${!timeText ? "is-missing" : ""}`}>
                        <FontAwesomeIcon icon={faClock} />
                        <span>{timeText || "—"}</span>
                      </div>

                      <div className="rescue-col-status">
                        <span className={`rescue-status-badge ${getRescueStatusPillClass(item.status)}`}>
                          {isStillOpen && <span className="rescue-badge-dot" />}
                          {statusLabel}
                        </span>
                        {timeStatus.text && (
                          <span className="rescue-row-duration">{timeStatus.text}</span>
                        )}
                      </div>
                    </div>

                    <div className="rescue-row-mobile-content">
                      <div className="rescue-mr-line1">
                        <span
                          className={`rescue-row-status-icon ${statusClass}`}
                          aria-hidden="true"
                        >
                          <FontAwesomeIcon icon={statusIcon} />
                        </span>
                        <strong className="rescue-mr-name">{requesterName}</strong>
                        <span className={`rescue-status-badge rescue-mr-pill ${getRescueStatusPillClass(item.status)}`}>
                          {isStillOpen && <span className="rescue-badge-dot" />}
                          {statusLabel}
                        </span>
                      </div>
                      <div className="rescue-mr-line2">
                        {(() => {
                          const locSource = getLocationSourceInfo(item);
                          const locLabel = locSource
                            ? (locSource.accuracyText ? `${locSource.label} (${locSource.accuracyText})` : locSource.label)
                            : null;
                          return [`#${item.id}`, barangayText, locLabel, timeText].filter(Boolean).join(" · ");
                        })()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!loading && totalFiltered > 0 && (
          <nav className="rescue-pagination" aria-label="Pagination">
            <span className="rescue-pagination-info">
              Showing {(safePage - 1) * pageSize + 1} to{" "}
              {Math.min(safePage * pageSize, totalFiltered)} of {totalFiltered}
            </span>

            <div className="rescue-pagination-controls">
              <label className="rescue-pagination-size">
                <span className="rescue-pagination-size-label">Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Rows per page"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>

              <button
                type="button"
                className="rescue-page-nav-btn"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                Previous
              </button>

              {totalPages > 1 && (
                <div className="rescue-pagination-pages">
                  {paginationItems.map((item) =>
                    typeof item === "string" ? (
                      <span
                        key={item}
                        className="rescue-pagination-ellipsis"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={`rescue-page-num-btn ${item === safePage ? "is-active" : ""
                          }`}
                        aria-label={`Page ${item}`}
                        aria-current={item === safePage ? "page" : undefined}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </button>
                    )
                  )}
                </div>
              )}

              <span className="rescue-pagination-page">
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                className="rescue-page-nav-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </section>

      {/* 4. DETAIL MODAL & BACKDROP */}
      {selected && (
        <div
          className="rescue-drawer-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRequest();
          }}
        >
          <aside
            className="rescue-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rescue-drawer-title"
          >
            {/* FIXED HEADER */}
            <div className="rescue-drawer-header">
              <div className="rescue-drawer-title-stack">
                <div className="rescue-drawer-eyebrow-row">
                  <span className="rescue-drawer-alert-id">
                    Rescue Alert #{selected.id}
                  </span>
                  <span className={`rescue-status-badge ${getRescueStatusPillClass(selected.status)}`}>
                    {STATUS_LABELS[selected.status] || selected.status.replace("_", " ")}
                  </span>
                  {selectedTimeStatus && (
                    <span
                      className={`rescue-drawer-wait-pill ${isOpenStatus(selected.status) && selectedTimeStatus.isUrgent
                        ? "is-urgent"
                        : ""
                        }`}
                    >
                      <FontAwesomeIcon icon={selectedTimeStatus.icon} /> {selectedTimeStatus.text}
                    </span>
                  )}
                </div>
                <h2 id="rescue-drawer-title">
                  {selectedRequesterName || `Emergency Request #${selected.id}`}
                </h2>
              </div>

              {/* ONE-WAY STATUS PROGRESSION BAR */}
              <div
                className="rescue-status-actions"
                role="group"
                aria-label="Update request status"
              >
                {STATUS_OPTIONS.map((status, idx) => {
                  const isCurrent = selected.status === status;
                  const isCompleted = currentStatusIndex > idx;
                  const isNextStep = currentStatusIndex !== -1 && idx === currentStatusIndex + 1;
                  const isDisabled =
                    updatingId === selected.id || isCurrent || isCompleted;

                  return (
                    <button
                      type="button"
                      key={status}
                      disabled={isDisabled}
                      className={[
                        "rescue-status-action-btn",
                        `status-${status}`,
                        isCurrent ? "is-current" : "",
                        isCompleted ? "is-completed" : "",
                        isNextStep ? "is-next-step" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => updateStatus(selected.id, status)}
                      title={
                        isCompleted
                          ? "Status cannot move backward"
                          : isCurrent
                            ? `Currently ${STATUS_LABELS[status]}`
                            : `Advance status to ${STATUS_LABELS[status]}`
                      }
                    >
                      <span className="rescue-step-indicator">
                        {isCompleted ? <FontAwesomeIcon icon={faCheck} /> : idx + 1}
                      </span>
                      <span>{STATUS_LABELS[status]}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="rescue-drawer-close-btn"
                onClick={closeRequest}
                aria-label="Close rescue alert details"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {/* DRAWER BODY (2x2 GRID ON DESKTOP) */}
            <div className="rescue-drawer-body">
              <div className="rescue-drawer-grid">
                {/* TOP LEFT: EMERGENCY SITUATION */}
                <div className="rescue-drawer-card rescue-situation-card">
                  <h3 className="rescue-drawer-section-title">
                    Emergency Situation
                  </h3>
                  <p className="rescue-detail-description">
                    {selected.description || "No description provided."}
                  </p>
                </div>

                {/* BOTTOM LEFT: PHOTO PROOF */}
                <div className="rescue-drawer-card rescue-proof-card">
                  <div className="rescue-drawer-card-head">
                    <h3 className="rescue-drawer-section-title">
                      Photo Proof
                    </h3>
                    {proofImages.length > 0 && (
                      <span className="rescue-drawer-photo-count">
                        {proofImages.length}{" "}
                        {proofImages.length === 1 ? "photo" : "photos"}
                      </span>
                    )}
                  </div>

                  {proofImages.length > 0 ? (
                    <div
                      className="rescue-proof-carousel"
                      role="group"
                      aria-roledescription="carousel"
                      aria-label="Photo proof carousel"
                    >
                      <div
                        className="rescue-proof-stage"
                        onClick={() => {
                          const currentUrl = proofImages[safeProofIdx];
                          if (currentUrl) setLightboxImage(currentUrl);
                        }}
                        onTouchStart={handleProofTouchStart}
                        onTouchEnd={handleProofTouchEnd}
                        onKeyDown={handleProofKeyDown}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          proofImages.length > 1
                            ? `Photo ${safeProofIdx + 1} of ${proofImages.length}. Tap to view full size.`
                            : "View photo proof full size"
                        }
                      >
                        <div className="rescue-proof-counter" aria-live="polite">
                          {safeProofIdx + 1} / {proofImages.length}
                        </div>

                        {proofImages.length > 1 && (
                          <button
                            type="button"
                            className="rescue-proof-arrow is-prev"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrevProof();
                            }}
                            aria-label="Previous photo"
                          >
                            <FontAwesomeIcon icon={faChevronLeft} />
                          </button>
                        )}

                        {failedProofImages[proofImages[safeProofIdx]] ? (
                          <div className="rescue-proof-broken" aria-label="Photo unavailable">
                            <FontAwesomeIcon icon={faImage} />
                            <span>Image unavailable</span>
                          </div>
                        ) : (
                          <img
                            src={proofImages[safeProofIdx]}
                            alt={`Proof ${safeProofIdx + 1}`}
                            className="rescue-proof-stage-img"
                            onError={() => {
                              const brokenUrl = proofImages[safeProofIdx];
                              setFailedProofImages((prev) => ({
                                ...prev,
                                [brokenUrl]: true,
                              }));
                            }}
                          />
                        )}

                        {proofImages.length > 1 && (
                          <button
                            type="button"
                            className="rescue-proof-arrow is-next"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNextProof();
                            }}
                            aria-label="Next photo"
                          >
                            <FontAwesomeIcon icon={faChevronRight} />
                          </button>
                        )}

                        <span className="rescue-proof-zoom-badge" aria-hidden="true">
                          <FontAwesomeIcon icon={faExpand} />
                        </span>
                      </div>

                      {proofImages.length > 1 && (
                        <div
                          className="rescue-proof-dots"
                          role="tablist"
                          aria-label="Photo proof slides"
                        >
                          {proofImages.map((_, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className={`rescue-proof-dot ${safeProofIdx === idx ? "is-active" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveProofIdx(idx);
                              }}
                              role="tab"
                              aria-selected={safeProofIdx === idx}
                              aria-label={`Go to photo ${idx + 1}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rescue-proof-empty">
                      <FontAwesomeIcon icon={faImages} />
                      <span>No photos attached</span>
                    </div>
                  )}
                </div>

                {/* TOP RIGHT: REQUESTER & CONTACT */}
                <div className="rescue-drawer-card rescue-contact-card">
                  <div className="rescue-drawer-card-head">
                    <h3 className="rescue-drawer-section-title">
                      Requester & Contact
                    </h3>
                    {selectedContactNumber && (
                      <a
                        href={`tel:${selectedContactNumber}`}
                        className="rescue-call-btn"
                        aria-label={`Call contact number ${selectedContactNumber}`}
                      >
                        <FontAwesomeIcon icon={faPhone} />
                        <span>Call</span>
                      </a>
                    )}
                  </div>

                  <div className="rescue-drawer-meta-list">
                    <div className="rescue-drawer-meta-item">
                      <span className="rescue-meta-icon">
                        <FontAwesomeIcon icon={faUser} />
                      </span>
                      <div>
                        <strong>Requester Name</strong>
                        <span>
                          {selectedRequesterName || "Not provided"}
                          {selectedPeopleCount != null && selectedPeopleCount !== "" && (
                            <em className="rescue-meta-people-inline">
                              {" "}
                              · {selectedPeopleCount}{" "}
                              {Number(selectedPeopleCount) === 1 ? "person" : "people"}
                            </em>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="rescue-drawer-meta-item">
                      <span className="rescue-meta-icon">
                        <FontAwesomeIcon icon={faPhone} />
                      </span>
                      <div>
                        <strong>Contact Number</strong>
                        <span>{selectedContactNumber || "Not provided"}</span>
                      </div>
                    </div>

                    <div className="rescue-drawer-meta-item">
                      <span className="rescue-meta-icon">
                        <FontAwesomeIcon icon={faClock} />
                      </span>
                      <div>
                        <strong>Reported Time</strong>
                        <span>
                          {selected.created_at
                            ? new Date(selected.created_at).toLocaleString()
                            : "Unknown"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BOTTOM RIGHT: LOCATION DETAILS */}
                <div className="rescue-drawer-card rescue-location-card">
                  <div className="rescue-drawer-loc-head">
                    <div className="rescue-drawer-loc-title-group">
                      <span className="rescue-meta-icon is-blue">
                        <FontAwesomeIcon icon={faLocationDot} />
                      </span>
                      <div className="rescue-drawer-loc-title-text">
                        <h3 className="rescue-drawer-section-title">Location Details</h3>
                        {hasSelectedCoords ? (
                          <div className="rescue-drawer-coords-stack">
                            <p className="rescue-drawer-coords">
                              {Number(selected.latitude).toFixed(5)}° N,{" "}
                              {Number(selected.longitude).toFixed(5)}° E
                            </p>
                            {(() => {
                              const locSource = getLocationSourceInfo(selected);
                              if (!locSource) return null;
                              return (
                                <div className="rescue-drawer-loc-source-badge">
                                  <span className={`rescue-loc-source-pill ${locSource.className}`}>
                                    <span className="rescue-badge-dot" />
                                    {locSource.label}
                                  </span>
                                  {locSource.fullAccuracyText && (
                                    <span className="rescue-drawer-accuracy-note">
                                      {locSource.fullAccuracyText}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <p className="rescue-drawer-coords is-muted">
                            GPS coordinates were not provided.
                          </p>
                        )}
                      </div>
                    </div>

                    {hasSelectedCoords && (
                      <button
                        type="button"
                        className="rescue-map-btn"
                        onClick={handleViewOnMap}
                      >
                        <FontAwesomeIcon icon={faCompass} />
                        <span>Locate on Map</span>
                      </button>
                    )}
                  </div>

                  {(selected.barangay || selected.location_description) && (
                    <div className="rescue-drawer-loc-meta">
                      {selected.barangay && (
                        <div className="rescue-drawer-loc-text">
                          <strong>Barangay</strong>
                          <p>{selected.barangay}</p>
                        </div>
                      )}
                      {selected.location_description && (
                        <div className="rescue-drawer-loc-text">
                          <strong>Landmark / Directions</strong>
                          <p>{selected.location_description}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {hasSelectedCoords && MAPBOX_TOKEN && !mapImgFailed && (
                    <div className="rescue-minimap">
                      <img
                        src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+dc2626(${Number(selected.longitude)},${Number(selected.latitude)})/${Number(selected.longitude)},${Number(selected.latitude)},15,0/480x280@2x?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`}
                        alt="Rescue location preview map"
                        className="rescue-minimap-img"
                        onError={() => setMapImgFailed(true)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* 5. FULLSCREEN PHOTO LIGHTBOX */}
      {lightboxImage && (
        <div
          className="rescue-lightbox-overlay"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Full size photo preview"
        >
          <button
            type="button"
            className="rescue-lightbox-close"
            onClick={() => setLightboxImage(null)}
            aria-label="Close photo preview"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
          <img
            src={lightboxImage}
            alt="Full size rescue proof"
            className="rescue-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
