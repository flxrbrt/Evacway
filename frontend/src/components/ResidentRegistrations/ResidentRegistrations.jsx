import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faCircleCheck,
  faCircleNotch,
  faCircleXmark,
  faClock,
  faEllipsisVertical,
  faEnvelope,
  faInfoCircle,
  faMagnifyingGlass,
  faTriangleExclamation,
  faUserPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";
import { queryKeys } from "../../hooks/useEvacuationQueries";
import CreateResidentAccountModal from "./CreateResidentAccountModal";
import "./ResidentRegistrations.css";

const STATUS_CARDS = [
  {
    id: "pending",
    label: "Pending",
    sub: "Awaiting review",
    icon: faClock,
    variant: "pending",
  },
  {
    id: "approved",
    label: "Approved",
    sub: "Linked to roster",
    icon: faCircleCheck,
    variant: "approved",
  },
  {
    id: "rejected",
    label: "Rejected",
    sub: "Not accepted",
    icon: faCircleXmark,
    variant: "rejected",
  },
];

const COMPARISON_FIELDS = [
  { id: "name", label: "Full name", flag: "name", format: (record) => record.full_name || joinName(record) },
  { id: "birthdate", label: "Birthdate", flag: "birthdate", format: (record) => record.birthdate || "Not provided" },
  { id: "barangay", label: "Barangay", flag: "barangay", format: (record) => record.barangay || "Not provided" },
  { id: "address", label: "Address / purok", flag: "address", format: (record) => record.address || "Not provided" },
  { id: "contact_number", label: "Contact number", flag: "contact_number", format: (record) => record.contact_number || "Not provided" },
];

function joinName(record) {
  return [record.first_name, record.middle_name, record.last_name].filter(Boolean).join(" ");
}

function normalizedName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatDate(value) {
  if (!value) return "Not provided";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(parsed);
}

function getRosterRecord(resident) {
  const alreadyLinked = Boolean(resident.already_linked);
  return {
    id: resident.id,
    first_name: resident.first_name,
    middle_name: resident.middle_name,
    last_name: resident.last_name,
    full_name: resident.full_name || joinName(resident),
    birthdate: resident.birthdate || resident.date_of_birth || null,
    barangay: resident.barangay,
    address: resident.address,
    contact_number: resident.contact_number,
    match_flags: {},
    already_linked: alreadyLinked,
    available: !alreadyLinked,
  };
}

function normalizeContact(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function getMatchResident(match) {
  return match?.resident || match || {};
}

function getMatchResidentId(match) {
  return getMatchResident(match)?.id ?? null;
}

function getComparisonValue(record, field) {
  if (!record) return "Not provided";
  if (field.id === "name") return record.full_name || joinName(record) || "Not provided";
  if (field.id === "birthdate") return formatDate(record.birthdate);
  return record[field.id] || "Not provided";
}

function isFieldMatched(request, match, field) {
  if (match?.match_flags && typeof match.match_flags[field.flag] === "boolean") {
    return match.match_flags[field.flag];
  }
  const roster = getMatchResident(match);
  if (field.id === "name") {
    return normalizedName(request.full_name || joinName(request)) === normalizedName(roster.full_name || joinName(roster));
  }
  if (field.id === "birthdate") {
    return Boolean(request.birthdate && roster.birthdate && String(request.birthdate) === String(roster.birthdate));
  }
  if (field.id === "contact_number") {
    const left = normalizeContact(request.contact_number);
    const right = normalizeContact(roster.contact_number);
    return Boolean(left && right && left === right);
  }
  const left = normalizedName(request[field.id]);
  const right = normalizedName(roster[field.id]);
  return Boolean(left && right && left === right);
}

function allFieldsMatch(request, match) {
  if (!request || !match) return false;
  return COMPARISON_FIELDS.every((field) => isFieldMatched(request, match, field));
}

function matchesAutosuggestRecord(resident, suggestion) {
  const suggestionName = normalizedName(suggestion.name);
  const residentNames = [
    resident.full_name,
    joinName(resident),
    resident.household_head_name,
  ].map(normalizedName);
  return (
    residentNames.includes(suggestionName)
    && normalizedName(resident.barangay) === normalizedName(suggestion.barangay)
  );
}

export default function ResidentRegistrations({ focusRegistrationId = null }) {
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [requests, setRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const handledFocusIdRef = useRef(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchRetryKey, setMatchRetryKey] = useState(0);
  const [selectedResident, setSelectedResident] = useState(null);
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState("");
  const [confirmModal, setConfirmModal] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [decisionResult, setDecisionResult] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetCooldowns, setResetCooldowns] = useState({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Manual account modal, pagination, mobile menu & toast notification state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMobileMenuId, setOpenMobileMenuId] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const dialogRef = useRef(null);
  const listRequestRef = useRef(0);
  const listScrollRef = useRef(null);
  const actionLockRef = useRef(false);
  const resetLockRef = useRef(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  // Auto-dismiss floating toast after 4.5 seconds
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshList = useCallback(async () => {
    const requestNumber = ++listRequestRef.current;
    setListLoading(true);
    setListError("");
    try {
      const [filtered, all] = await Promise.all([
        api.getResidentRegistrations({ status: activeStatus, search }),
        api.getResidentRegistrations({ status: "all" }),
      ]);
      if (requestNumber !== listRequestRef.current) return;
      setRequests(filtered.requests || []);
      setAllRequests(all.requests || []);
      const nextCounts = { pending: 0, approved: 0, rejected: 0 };
      (all.requests || []).forEach((item) => {
        if (Object.hasOwn(nextCounts, item.status)) nextCounts[item.status] += 1;
      });
      setCounts(nextCounts);
    } catch (error) {
      if (requestNumber === listRequestRef.current) {
        setRequests([]);
        setListError(error.message || "Resident registrations could not be loaded.");
      }
    } finally {
      if (requestNumber === listRequestRef.current) setListLoading(false);
    }
  }, [activeStatus, search]);

  useEffect(() => {
    const timer = window.setTimeout(refreshList, search ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey, refreshList, search]);

  useEffect(() => {
    if (focusRegistrationId == null) {
      handledFocusIdRef.current = null;
      return undefined;
    }
    if (handledFocusIdRef.current === String(focusRegistrationId)) return undefined;
    const match = allRequests.find(
      (item) => String(item.id) === String(focusRegistrationId)
    );
    if (!match) return undefined;
    handledFocusIdRef.current = String(focusRegistrationId);
    const timer = window.setTimeout(() => {
      if (match.status && match.status !== activeStatus) {
        setActiveStatus(match.status);
      }
      openReview(match);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusRegistrationId, allRequests, activeStatus]);

  useEffect(() => {
    if (!selectedRequest) return undefined;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();

    api.clearNotificationsByResource("resident_registration", selectedRequest.id)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }))
      .catch(() => {});

    let active = true;
    api.getResidentRegistrationMatches(selectedRequest.id)
      .then((result) => {
        if (!active) return;
        setMatchResult(result);
        const available = (result.matches || []).filter((item) => item.available);
        if (result.status === "match" && available.length === 1) {
          setSelectedResident(available[0]);
        }
      })
      .catch((error) => {
        if (active) setMatchError(error.message || "Resident matching could not be completed.");
      })
      .finally(() => {
        if (active) setMatchLoading(false);
      });

    return () => { active = false; };
  }, [selectedRequest, matchRetryKey, queryClient]);

  const visibleRequests = useMemo(() => requests, [requests]);
  const totalFiltered = visibleRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedRequests = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return visibleRequests.slice(start, start + pageSize);
  }, [visibleRequests, safePage, pageSize]);

  const paginationItems = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = Array.from(
      new Set(
        [1, totalPages, safePage - 1, safePage, safePage + 1].filter(
          (p) => p >= 1 && p <= totalPages
        )
      )
    ).sort((a, b) => a - b);

    const items = [];
    for (let i = 0; i < pages.length; i++) {
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

  useEffect(() => {
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }
  }, [page, pageSize, activeStatus]);

  useEffect(() => {
    if (openMobileMenuId == null) return undefined;
    const handleOutsideClick = (event) => {
      if (!event.target.closest?.(".resident-mobile-menu-anchor")) {
        setOpenMobileMenuId(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenMobileMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMobileMenuId]);

  const activeCooldownExpiresAt = selectedRequest ? resetCooldowns[selectedRequest.id] || 0 : 0;
  useEffect(() => {
    if (!activeCooldownExpiresAt || activeCooldownExpiresAt <= Date.now()) {
      return undefined;
    }
    const tick = window.setInterval(() => {
      const currentNow = Date.now();
      setNowMs(currentNow);
      if (currentNow >= activeCooldownExpiresAt) {
        window.clearInterval(tick);
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [activeCooldownExpiresAt]);

  function closeReview() {
    if (actionLoading || resetLoading) return;
    dialogRef.current?.close();
  }

  function handleDialogClose() {
    setSelectedRequest(null);
    setMatchResult(null);
    setSelectedResident(null);
    setManualResults([]);
    setDecisionResult(null);
    setConfirmModal(null);
    setActionError("");
  }

  function openReview(registration, options = {}) {
    setOpenMobileMenuId(null);
    setMatchResult(null);
    setSelectedResident(null);
    setMatchError("");
    setMatchLoading(true);
    setActionError("");
    setMatchRetryKey(0);
    setDecisionResult(null);
    setManualSearch("");
    setManualResults([]);
    setManualError("");
    setConfirmModal(options.openReject ? "reject" : null);
    setRejectionReason("");
    setSelectedRequest(registration);
  }

  function selectMatch(match) {
    if (!match.available || match.already_linked) return;
    setSelectedResident(match);
    setActionError("");
  }

  async function searchRoster(event) {
    event.preventDefault();
    const query = manualSearch.trim();
    if (query.length < 3) {
      setManualError("Enter at least 3 characters to search the roster.");
      return;
    }
    setManualLoading(true);
    setManualError("");
    setManualResults([]);
    try {
      const [suggestionResult, residentResult] = await Promise.all([
        api.autosuggestResidents(query),
        api.getResidents(),
      ]);
      const suggestions = suggestionResult.suggestions || [];
      const normalizedQuery = normalizedName(query);
      const suggestionRecords = residentResult.filter((resident) =>
        suggestions.some((suggestion) => matchesAutosuggestRecord(resident, suggestion))
      );
      const directRecords = residentResult.filter((resident) => {
        const fields = [resident.full_name, joinName(resident), resident.household_head_name];
        return fields.some((value) => normalizedName(value).includes(normalizedQuery));
      });
      const unique = new Map();
      [...suggestionRecords, ...directRecords].forEach((resident) => {
        if (!unique.has(resident.id)) unique.set(resident.id, getRosterRecord(resident));
      });
      setManualResults(Array.from(unique.values()).slice(0, 10));
      if (!unique.size) setManualError("No roster records match that search.");
    } catch (error) {
      setManualError(error.message || "The roster search could not be completed.");
    } finally {
      setManualLoading(false);
    }
  }

  async function approveRequest() {
    const matchedResidentId = getMatchResidentId(selectedResident);
    if (!selectedRequest || !matchedResidentId || actionLockRef.current || decisionResult) return;
    actionLockRef.current = true;
    setActionLoading(true);
    setActionError("");
    try {
      const result = await api.approveResidentRegistration(selectedRequest.id, matchedResidentId);
      setDecisionResult({ status: "approved", result });
      setConfirmModal(null);
      setSelectedRequest((current) =>
        current
          ? {
              ...current,
              ...(result.request || {}),
              status: "approved",
              matched_resident_id: matchedResidentId,
              has_account: true,
              account_email: result.account?.email || current.email,
            }
          : current
      );
      setRequests((current) => current.filter((item) => item.id !== selectedRequest.id));
      setCounts((current) => ({
        ...current,
        pending: Math.max(0, current.pending - 1),
        approved: current.approved + 1,
      }));
      showToast(`Registration approved for ${selectedRequest.full_name || joinName(selectedRequest)}!`, "success");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      const message = error.message || "The registration could not be approved.";
      setActionError(message);
      setConfirmModal(null);
      showToast(message, "error");
      if (/already linked/i.test(message)) {
        setSelectedResident((current) => current ? { ...current, already_linked: true, available: false } : current);
      }
    } finally {
      actionLockRef.current = false;
      setActionLoading(false);
    }
  }

  async function rejectRequest(event) {
    if (event) event.preventDefault();
    if (!selectedRequest || actionLockRef.current || decisionResult) return;
    const reason = rejectionReason.trim();
    actionLockRef.current = true;
    setActionLoading(true);
    setActionError("");
    try {
      const result = await api.rejectResidentRegistration(selectedRequest.id, reason);
      setDecisionResult({ status: "rejected", result });
      setConfirmModal(null);
      setSelectedRequest((current) =>
        current
          ? {
              ...current,
              ...(result.request || {}),
              status: "rejected",
              rejection_reason: reason || null,
            }
          : current
      );
      setRequests((current) => current.filter((item) => item.id !== selectedRequest.id));
      setCounts((current) => ({
        ...current,
        pending: Math.max(0, current.pending - 1),
        rejected: current.rejected + 1,
      }));
      showToast("Registration rejected.", "info");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      const message = error.message || "The registration could not be rejected.";
      setActionError(message);
      setConfirmModal(null);
      showToast(message, "error");
    } finally {
      actionLockRef.current = false;
      setActionLoading(false);
    }
  }

  async function resendDecisionEmail() {
    if (!selectedRequest || actionLockRef.current || !decisionResult) return;
    actionLockRef.current = true;
    setActionLoading(true);
    setActionError("");
    try {
      const result = await api.resendResidentRegistrationEmail(selectedRequest.id);
      setDecisionResult((current) => ({
        ...current,
        result: { ...current.result, email_sent: result.email_sent },
        resendMessage: result.message,
      }));
      showToast(result.message || "Email resent successfully.", "success");
    } catch (error) {
      setActionError(error.message || "The activation email could not be resent.");
      showToast(error.message || "The activation email could not be resent.", "error");
    } finally {
      actionLockRef.current = false;
      setActionLoading(false);
    }
  }

  async function sendResetPasswordEmail() {
    if (!selectedRequest || resetLockRef.current) return;
    const requestId = selectedRequest.id;
    const targetEmail = selectedRequest.account_email || selectedRequest.email;
    resetLockRef.current = true;
    setResetLoading(true);
    try {
      const result = await api.sendResidentResetPasswordEmail(requestId);
      const sentEmail = result.email || targetEmail;
      const now = Date.now();
      setNowMs(now);
      setResetCooldowns((current) => ({ ...current, [requestId]: now + 60000 }));
      setConfirmModal(null);
      showToast(`Reset link sent to ${sentEmail}`, "success");
    } catch (error) {
      setConfirmModal(null);
      showToast(error.message || "Could not send reset password email.", "error");
    } finally {
      resetLockRef.current = false;
      setResetLoading(false);
    }
  }

  function renderComparison(match) {
    const residentRecord = getMatchResident(match);
    const residentId = residentRecord.id;
    const rosterName = residentRecord.full_name || joinName(residentRecord) || "Roster record";
    const rosterBarangay = typeof residentRecord.barangay === "string" ? residentRecord.barangay.trim() : "";
    const isSelected = residentId != null && getMatchResidentId(selectedResident) === residentId;
    const isAvailable = match.available && !match.already_linked;

    return (
      <div
        className={`resident-match-card ${isSelected ? "is-selected" : ""} ${!isAvailable ? "is-unavailable" : ""}`}
        key={residentId ?? rosterName}
      >
        <div className="resident-match-card-header">
          <div className="resident-match-identity">
            <strong className="resident-match-name">{rosterName}</strong>
            {(residentId != null || rosterBarangay) && (
              <div className="resident-match-meta">
                {residentId != null && <span className="resident-match-id">Roster #{residentId}</span>}
                {rosterBarangay && <span className="resident-match-barangay">{rosterBarangay}</span>}
              </div>
            )}
          </div>
          {isPendingRequest && !decisionResult ? (
            isAvailable ? (
              <button
                type="button"
                className={`resident-select-match ${isSelected ? "is-active" : ""}`}
                onClick={() => selectMatch(match)}
              >
                {isSelected && <FontAwesomeIcon icon={faCheck} aria-hidden="true" />}
                <span>{isSelected ? "Selected" : "Select this match"}</span>
              </button>
            ) : (
              <span className="resident-already-linked-chip">Already linked</span>
            )
          ) : selectedRequest?.matched_resident_id === residentId ? (
            <span className="resident-linked-badge">
              <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
              <span>Linked</span>
            </span>
          ) : null}
        </div>

        {/* Desktop Comparison Table */}
        <div className="resident-comparison-table-wrap">
          <table className="resident-comparison-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Submitted</th>
                <th scope="col">Roster</th>
                <th scope="col" className="is-match-col">Match</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_FIELDS.map((field) => {
                const submittedVal = getComparisonValue(selectedRequest, field);
                const rosterVal = getComparisonValue(residentRecord, field);
                const matched = isFieldMatched(selectedRequest, match, field);
                return (
                  <tr key={field.id} className={matched ? "is-match" : "is-mismatch"}>
                    <td className="resident-cmp-field">{field.label}</td>
                    <td className="resident-cmp-value">{submittedVal}</td>
                    <td className="resident-cmp-value">{rosterVal}</td>
                    <td className="resident-cmp-status">
                      <span className={`resident-cmp-icon ${matched ? "is-match" : "is-mismatch"}`}>
                        <FontAwesomeIcon
                          icon={matched ? faCircleCheck : faTriangleExclamation}
                          aria-hidden="true"
                        />
                        <span className="sr-only">{matched ? "Matches" : "Mismatch"}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Comparison Cards (<= 768px) */}
        <div className="resident-comparison-mobile-list">
          {COMPARISON_FIELDS.map((field) => {
            const submittedVal = getComparisonValue(selectedRequest, field);
            const rosterVal = getComparisonValue(residentRecord, field);
            const matched = isFieldMatched(selectedRequest, match, field);
            return (
              <div
                key={field.id}
                className={`resident-comparison-mobile-card ${matched ? "is-match" : "is-mismatch"}`}
              >
                <div className="resident-comparison-mobile-top">
                  <span className="resident-comparison-mobile-field">{field.label}</span>
                  <span className={`resident-cmp-icon ${matched ? "is-match" : "is-mismatch"}`}>
                    <FontAwesomeIcon
                      icon={matched ? faCircleCheck : faTriangleExclamation}
                      aria-hidden="true"
                    />
                    <span className="sr-only">{matched ? "Matches" : "Mismatch"}</span>
                  </span>
                </div>
                <div className="resident-comparison-mobile-values">
                  <div>
                    <span>Submitted</span>
                    <strong>{submittedVal}</strong>
                  </div>
                  <div>
                    <span>Roster</span>
                    <strong>{rosterVal}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const isPendingRequest = selectedRequest?.status === "pending" && !decisionResult;
  const displayedMatches = useMemo(() => {
    const apiMatches = matchResult?.matches || [];
    if (!isPendingRequest && selectedRequest?.matched_resident_id) {
      const linked = apiMatches.find(
        (m) => getMatchResidentId(m) === selectedRequest.matched_resident_id
      );
      if (linked) return [linked];
    }
    if (matchResult?.status === "none" && selectedResident) {
      return [selectedResident];
    }
    return apiMatches;
  }, [matchResult, selectedResident, isPendingRequest, selectedRequest]);

  const activeReferenceMatch = selectedResident || displayedMatches[0] || null;
  const matchBanner = (() => {
    if (!matchResult && !selectedResident) return null;
    if (!activeReferenceMatch || (matchResult?.status === "none" && !selectedResident)) {
      return { className: "is-neutral", icon: faInfoCircle, text: "No roster match" };
    }
    if (allFieldsMatch(selectedRequest, activeReferenceMatch)) {
      return { className: "is-success", icon: faCircleCheck, text: "Match found" };
    }
    return {
      className: "is-warning",
      icon: faTriangleExclamation,
      text: "Partial match: check the highlighted rows",
    };
  })();

  const resetTargetEmail = selectedRequest?.account_email || selectedRequest?.email || "";
  const resetCooldownSeconds = selectedRequest
    ? Math.max(0, Math.ceil(((resetCooldowns[selectedRequest.id] || 0) - nowMs) / 1000))
    : 0;
  const hasApprovedAccount = Boolean(
    selectedRequest &&
      selectedRequest.status === "approved" &&
      (selectedRequest.has_account || decisionResult?.status === "approved")
  );
  const canApprove = Boolean(
    isPendingRequest &&
      !actionLoading &&
      !matchLoading &&
      selectedResident &&
      !selectedResident.already_linked &&
      (selectedResident.available || !selectedResident.resident)
  );

  return (
    <section className="resident-registrations-page" aria-labelledby="resident-registrations-title">
      {/* Floating Toast Notification */}
      {toast && (
        <div className={`resident-floating-toast is-${toast.type}`} role="alert">
          <div className="resident-toast-icon">
            <FontAwesomeIcon
              icon={
                toast.type === "success"
                  ? faCircleCheck
                  : toast.type === "error"
                  ? faTriangleExclamation
                  : faInfoCircle
              }
            />
          </div>
          <span className="resident-toast-message">{toast.message}</span>
          <button
            type="button"
            className="resident-toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="resident-registrations-header">
        <div className="resident-header-left">
          <p className="resident-registrations-eyebrow">Resident Management</p>
          <h1 id="resident-registrations-title">Resident Registrations</h1>
          <p className="resident-header-description">
            Review submitted resident accounts, link verified applicants to the roster, and manually create resident accounts.
          </p>
        </div>
        <div className="resident-header-actions">
          <button
            type="button"
            className="resident-btn-create-account"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <FontAwesomeIcon icon={faUserPlus} />
            <span>Create Resident Account</span>
          </button>
          
        </div>
      </header>

      {/* Status Filter Stat Cards */}
      <section className="resident-stat-cards" aria-label="Registration status filters">
        {STATUS_CARDS.map((card) => {
          const isSelected = activeStatus === card.id;
          return (
            <button
              key={card.id}
              type="button"
              aria-pressed={isSelected}
              className={`resident-stat-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => {
                setActiveStatus(card.id);
                setPage(1);
                setOpenMobileMenuId(null);
              }}
            >
              <div className="resident-stat-card-top">
                <span className="resident-stat-label">{card.label}</span>
                <span className={`resident-stat-icon-wrap is-${card.variant}`} aria-hidden="true">
                  <FontAwesomeIcon icon={card.icon} />
                </span>
              </div>
              <div className="resident-stat-card-bottom">
                <span className="resident-stat-value">{counts[card.id]}</span>
                <span className="resident-stat-hint">{card.sub}</span>
              </div>
            </button>
          );
        })}
      </section>

      {/* Unified Table Card: Toolbar + Scrollable List/Table + Pagination */}
      <section className="resident-table-card" aria-label="Resident registrations">
        {/* Toolbar inside White Card */}
        <div className="resident-registration-toolbar">
          <label className="resident-registration-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
            <span className="sr-only">Search registrations</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
                setOpenMobileMenuId(null);
              }}
              placeholder="Search name, email, contact, barangay..."
            />
            {search && (
              <button
                type="button"
                className="resident-search-clear-btn"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                  setOpenMobileMenuId(null);
                }}
                aria-label="Clear search"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </label>
        </div>

        {/* Scrollable Table / Card Body (Empty & Loading states live inside card) */}
        <div ref={listScrollRef} className="resident-list-scroll">
          {listLoading ? (
            <div className="resident-registration-state" role="status">
              <FontAwesomeIcon icon={faCircleNotch} spin /> Loading resident registrations…
            </div>
          ) : listError ? (
            <div className="resident-registration-state is-error" role="alert">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              <span>{listError}</span>
              <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>
                Retry
              </button>
            </div>
          ) : visibleRequests.length === 0 ? (
            <div className="resident-registration-state is-empty">
              <div className="resident-empty-icon">
                <FontAwesomeIcon icon={faEnvelope} />
              </div>
              <strong>No {activeStatus} registrations</strong>
              <span>
                {search ? "Try a different search query." : "New resident requests will appear here."}
              </span>
            </div>
          ) : (
            <>
              {/* Desktop Table View with Sticky Column Headings */}
              <div className="resident-registration-list" role="list" aria-label={`${activeStatus} registrations`}>
                <div className="resident-table-header" aria-hidden="true">
                  <span className="resident-th-cell">Applicant</span>
                  <span className="resident-th-cell">Barangay</span>
                  <span className="resident-th-cell">Contact</span>
                  <span className="resident-th-cell">Submitted</span>
                  <span className="resident-th-cell is-status">Status</span>
                </div>

                {paginatedRequests.map((item) => {
                  const name = item.full_name || joinName(item) || "Unknown Resident";
                  const initials = name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0].toUpperCase())
                    .join("");

                  return (
                    <button
                      type="button"
                      role="listitem"
                      className="resident-registration-row"
                      key={item.id}
                      onClick={() => openReview(item)}
                    >
                      <div className="resident-col-applicant">
                        <div className="resident-row-avatar" aria-hidden="true">
                          {initials}
                        </div>
                        <div className="resident-registration-person">
                          <strong className="resident-row-name">{name}</strong>
                          <small className="resident-row-email">{item.email}</small>
                        </div>
                      </div>
                      <div className="resident-registration-row-detail resident-row-barangay">
                        <span className="resident-badge-subtle">{item.barangay || "N/A"}</span>
                      </div>
                      <div className="resident-registration-row-detail resident-row-contact">
                        {item.contact_number || "—"}
                      </div>
                      <div className="resident-registration-row-date">
                        {formatDate(item.created_at?.slice(0, 10))}
                      </div>
                      <div className="resident-row-status-wrap">
                        <span className={`resident-registration-status is-${item.status}`}>
                          {item.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Mobile Compact Cards View with Three-Dot Menu (<= 768px) */}
              <div className="resident-mobile-cards" role="list" aria-label={`${activeStatus} registrations`}>
                {paginatedRequests.map((item) => {
                  const name = item.full_name || joinName(item) || "Unknown Resident";
                  const isMenuOpen = openMobileMenuId === item.id;
                  const metaParts = [
                    item.barangay || "N/A",
                    item.contact_number || null,
                    formatDate(item.created_at?.slice(0, 10)),
                  ].filter(Boolean);

                  return (
                    <div
                      key={`mob-${item.id}`}
                      role="button"
                      tabIndex={0}
                      className="resident-mobile-card"
                      onClick={() => openReview(item)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          openReview(item);
                        }
                      }}
                    >
                      <div className="resident-mobile-card-top">
                        <div className="resident-mobile-card-title-group">
                          <strong className="resident-mobile-card-name">{name}</strong>
                          {item.email && (
                            <span className="resident-mobile-card-email">{item.email}</span>
                          )}
                        </div>

                        <div
                          className="resident-mobile-card-actions resident-mobile-menu-anchor"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className={`resident-registration-status is-${item.status}`}>
                            {item.status}
                          </span>
                          <button
                            type="button"
                            className="resident-mobile-kebab-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMobileMenuId((prev) => (prev === item.id ? null : item.id));
                            }}
                            aria-label={`Actions for ${name}`}
                            aria-expanded={isMenuOpen}
                            aria-haspopup="menu"
                          >
                            <FontAwesomeIcon icon={faEllipsisVertical} />
                          </button>

                          {isMenuOpen && (
                            <div
                              className="resident-mobile-row-dropdown"
                              role="menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.status === "pending" ? (
                                <>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="resident-mobile-menu-item is-primary"
                                    onClick={() => openReview(item)}
                                  >
                                    <FontAwesomeIcon icon={faCheck} />
                                    <span>Review & Approve</span>
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="resident-mobile-menu-item is-danger"
                                    onClick={() => openReview(item, { openReject: true })}
                                  >
                                    <FontAwesomeIcon icon={faXmark} />
                                    <span>Reject</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="resident-mobile-menu-item"
                                  onClick={() => openReview(item)}
                                >
                                  <FontAwesomeIcon icon={faInfoCircle} />
                                  <span>View Details</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="resident-mobile-card-meta">
                        {metaParts.join(" · ")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pagination Bar at Bottom of Card */}
        {!listLoading && !listError && totalFiltered > 0 && (
          <nav className="resident-pagination" aria-label="Pagination">
            <span className="resident-pagination-info">
              Showing {(safePage - 1) * pageSize + 1} to{" "}
              {Math.min(safePage * pageSize, totalFiltered)} of {totalFiltered}
            </span>

            <div className="resident-pagination-controls">
              <label className="resident-pagination-size">
                <span className="resident-pagination-size-label">Rows per page</span>
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
                className="resident-page-nav-btn"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                Previous
              </button>

              {totalPages > 1 && (
                <div className="resident-pagination-pages">
                  {paginationItems.map((item) =>
                    typeof item === "string" ? (
                      <span
                        key={item}
                        className="resident-pagination-ellipsis"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={`resident-page-num-btn ${item === safePage ? "is-active" : ""}`}
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

              <span className="resident-pagination-page">
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                className="resident-page-nav-btn"
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

      {/* Review Dialog */}
      <dialog
        ref={dialogRef}
        className="resident-review-dialog"
        aria-labelledby="resident-review-title"
        onCancel={(event) => {
          if (actionLoading || resetLoading) {
            event.preventDefault();
          }
        }}
        onClose={handleDialogClose}
        onClick={(event) => {
          if (event.target === dialogRef.current && !confirmModal) {
            closeReview();
          }
        }}
      >
        {selectedRequest && (
          <div className="resident-review-shell">
            <header className="resident-review-header">
              <div className="resident-review-header-info">
                <div className="resident-review-meta-row">
                  <span className="resident-registrations-eyebrow">Request #{selectedRequest.id}</span>
                  <span className={`resident-registration-status is-${selectedRequest.status}`}>
                    {selectedRequest.status}
                  </span>
                </div>
                <h2 id="resident-review-title">Review resident registration</h2>
                {selectedRequest.email && (
                  <p className="resident-review-header-email">
                    <FontAwesomeIcon icon={faEnvelope} aria-hidden="true" />
                    <span>{selectedRequest.email}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                className="resident-registration-icon-button"
                onClick={closeReview}
                aria-label="Close review"
                disabled={actionLoading || resetLoading}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </header>

            <div className="resident-review-body">
              {matchLoading ? (
                <div className="resident-review-state" role="status">
                  <FontAwesomeIcon icon={faCircleNotch} spin />
                  <span>Checking the resident roster…</span>
                </div>
              ) : matchError ? (
                <div className="resident-review-state is-error" role="alert">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <span>{matchError}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMatchError("");
                      setMatchLoading(true);
                      setMatchRetryKey((current) => current + 1);
                    }}
                  >
                    Retry match check
                  </button>
                </div>
              ) : (
                <>
                  {matchBanner && (
                    <div className={`resident-match-banner ${matchBanner.className}`} role="status">
                      <FontAwesomeIcon icon={matchBanner.icon} aria-hidden="true" />
                      <span>{matchBanner.text}</span>
                    </div>
                  )}

                  {displayedMatches.length > 0 ? (
                    displayedMatches.map(renderComparison)
                  ) : (
                    /* Fallback submitted-only details when no roster match is found */
                    <div className="resident-match-card is-submitted-only">
                      <div className="resident-comparison-table-wrap">
                        <table className="resident-comparison-table">
                          <thead>
                            <tr>
                              <th scope="col">Field</th>
                              <th scope="col">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {COMPARISON_FIELDS.map((field) => (
                              <tr key={field.id}>
                                <td className="resident-cmp-field">{field.label}</td>
                                <td className="resident-cmp-value">{getComparisonValue(selectedRequest, field)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="resident-comparison-mobile-list">
                        {COMPARISON_FIELDS.map((field) => (
                          <div key={field.id} className="resident-comparison-mobile-card">
                            <div className="resident-comparison-mobile-top">
                              <span className="resident-comparison-mobile-field">{field.label}</span>
                            </div>
                            <div className="resident-comparison-mobile-values is-single">
                              <div>
                                <span>Submitted</span>
                                <strong>{getComparisonValue(selectedRequest, field)}</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {matchResult?.status === "none" && isPendingRequest && (
                    <form className="resident-manual-search" onSubmit={searchRoster}>
                      <label htmlFor="resident-roster-search">Search the resident roster</label>
                      <div className="resident-manual-search-controls">
                        <input
                          id="resident-roster-search"
                          value={manualSearch}
                          onChange={(event) => setManualSearch(event.target.value)}
                          placeholder="Enter a resident name"
                        />
                        <button type="submit" disabled={manualLoading}>
                          <FontAwesomeIcon icon={manualLoading ? faCircleNotch : faMagnifyingGlass} spin={manualLoading} />
                          <span>Search</span>
                        </button>
                      </div>
                      {manualError && <p className="resident-review-inline-error" role="alert">{manualError}</p>}
                      {manualResults.map((resident) => (
                        <button
                          type="button"
                          className={`resident-manual-result ${getMatchResidentId(selectedResident) === resident.id ? "is-selected" : ""}`}
                          key={resident.id}
                          onClick={() => setSelectedResident(resident)}
                          disabled={resident.already_linked}
                        >
                          <span>
                            <strong>{resident.full_name}</strong>
                            <small>{resident.barangay ? `${resident.barangay} · ` : ""}{formatDate(resident.birthdate)}</small>
                            {resident.already_linked && (
                              <small className="resident-manual-linked-warning">Already linked to another account</small>
                            )}
                          </span>
                          <span>{resident.already_linked ? "Already linked" : `#${resident.id}`}</span>
                        </button>
                      ))}
                    </form>
                  )}
                </>
              )}

              {isPendingRequest && selectedResident?.already_linked && (
                <p className="resident-registration-warning" role="alert">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <span>This resident record is already linked to another account.</span>
                </p>
              )}

              {selectedRequest.status === "rejected" && selectedRequest.rejection_reason && (
                <div className="resident-reviewed-notice" role="status">
                  <strong>Rejection reason</strong>
                  <span>{selectedRequest.rejection_reason}</span>
                </div>
              )}

              {actionError && <p className="resident-review-inline-error" role="alert">{actionError}</p>}

              {decisionResult && !decisionResult.result.email_sent && (
                <div className="resident-decision-result" role="status">
                  <div className="resident-email-warning">
                    <span>
                      <FontAwesomeIcon icon={faTriangleExclamation} />
                      Decision email not sent.
                    </span>
                    <button type="button" onClick={resendDecisionEmail} disabled={actionLoading}>
                      {actionLoading ? <FontAwesomeIcon icon={faCircleNotch} spin /> : <FontAwesomeIcon icon={faEnvelope} />}
                      <span>Resend email</span>
                    </button>
                  </div>
                  {decisionResult.resendMessage && <small>{decisionResult.resendMessage}</small>}
                </div>
              )}

              {hasApprovedAccount && (
                <section className="resident-account-section" aria-label="Account">
                  <div className="resident-account-info">
                    <span className="resident-account-title">Account</span>
                    <span className="resident-account-subtitle">
                      Active resident login: <strong>{resetTargetEmail}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="resident-action-secondary resident-reset-pw-btn"
                    onClick={() => setConfirmModal("reset_password")}
                    disabled={resetLoading || actionLoading || resetCooldownSeconds > 0}
                  >
                    <FontAwesomeIcon icon={resetLoading ? faCircleNotch : faEnvelope} spin={resetLoading} />
                    <span>
                      {resetLoading
                        ? "Sending..."
                        : resetCooldownSeconds > 0
                          ? `Send reset password email (${resetCooldownSeconds}s)`
                          : "Send reset password email"}
                    </span>
                  </button>
                </section>
              )}
            </div>

            <footer className="resident-review-footer">
              {isPendingRequest ? (
                <>
                  <button
                    type="button"
                    className="resident-action-secondary"
                    onClick={closeReview}
                    disabled={actionLoading}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="resident-action-reject-outline"
                    onClick={() => setConfirmModal("reject")}
                    disabled={actionLoading || matchLoading}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="resident-action-primary"
                    onClick={() => setConfirmModal("approve")}
                    disabled={!canApprove}
                  >
                    {actionLoading ? <FontAwesomeIcon icon={faCircleNotch} spin /> : <FontAwesomeIcon icon={faCheck} />}
                    <span>{actionLoading ? "Approving..." : "Approve"}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="resident-action-secondary"
                  onClick={closeReview}
                  disabled={actionLoading || resetLoading}
                >
                  Close
                </button>
              )}
            </footer>

            {/* In-Dialog Confirmation Prompt (Approve / Reject / Reset Password) */}
            {confirmModal && (
              <div
                className="resident-confirm-overlay"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="resident-confirm-title"
                onClick={(event) => {
                  if (event.target === event.currentTarget && !actionLoading && !resetLoading) {
                    setConfirmModal(null);
                  }
                }}
              >
                {confirmModal === "approve" && (
                  <div className="resident-confirm-card">
                    <h3 id="resident-confirm-title">Approve resident registration?</h3>
                    <p>
                      Create an active resident account for{" "}
                      <strong>{selectedRequest.full_name || joinName(selectedRequest)}</strong>{" "}
                      linked to{" "}
                      <strong>
                        {getMatchResident(selectedResident).full_name || joinName(getMatchResident(selectedResident))}
                      </strong>
                      {getMatchResidentId(selectedResident) != null
                        ? ` (Roster #${getMatchResidentId(selectedResident)})`
                        : ""}
                      ?
                    </p>
                    <div className="resident-confirm-actions">
                      <button
                        type="button"
                        className="resident-action-secondary"
                        onClick={() => setConfirmModal(null)}
                        disabled={actionLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="resident-action-primary"
                        onClick={approveRequest}
                        disabled={actionLoading}
                      >
                        {actionLoading && <FontAwesomeIcon icon={faCircleNotch} spin />}
                        <span>{actionLoading ? "Approving..." : "Approve"}</span>
                      </button>
                    </div>
                  </div>
                )}

                {confirmModal === "reject" && (
                  <form className="resident-confirm-card" onSubmit={rejectRequest}>
                    <h3 id="resident-confirm-title">Reject resident registration?</h3>
                    <p>
                      This marks request #{selectedRequest.id} for{" "}
                      <strong>{selectedRequest.full_name || joinName(selectedRequest)}</strong> as rejected.
                    </p>
                    <label className="resident-confirm-label" htmlFor="resident-rejection-reason">
                      Reason (optional)
                    </label>
                    <textarea
                      id="resident-rejection-reason"
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                      placeholder="Add an optional note to include in the email..."
                      maxLength={2000}
                      rows={3}
                      disabled={actionLoading}
                    />
                    <div className="resident-confirm-actions">
                      <button
                        type="button"
                        className="resident-action-secondary"
                        onClick={() => setConfirmModal(null)}
                        disabled={actionLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="resident-action-danger"
                        disabled={actionLoading}
                      >
                        {actionLoading && <FontAwesomeIcon icon={faCircleNotch} spin />}
                        <span>{actionLoading ? "Rejecting..." : "Reject"}</span>
                      </button>
                    </div>
                  </form>
                )}

                {confirmModal === "reset_password" && (
                  <div className="resident-confirm-card">
                    <h3 id="resident-confirm-title">Send reset password link?</h3>
                    <p>Send a reset password link to {resetTargetEmail}?</p>
                    <div className="resident-confirm-actions">
                      <button
                        type="button"
                        className="resident-action-secondary"
                        onClick={() => setConfirmModal(null)}
                        disabled={resetLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="resident-action-primary"
                        onClick={sendResetPasswordEmail}
                        disabled={resetLoading}
                      >
                        {resetLoading && <FontAwesomeIcon icon={faCircleNotch} spin />}
                        <span>{resetLoading ? "Sending..." : "Send"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </dialog>

      {/* Create Account Modal */}
      <CreateResidentAccountModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={({ message }) => {
          showToast(message, "success");
          setRefreshKey((k) => k + 1);
        }}
      />
    </section>
  );
}
