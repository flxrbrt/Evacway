import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faBuildingColumns,
  faClock,
  faCheck,
  faRotateLeft,
  faMagnifyingGlass,
  faXmark,
  faSpinner,
  faUserGroup,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faListCheck,
  faCircleCheck,
  faCircleExclamation,
  faFileExcel,
  faCalendarDays,
  faCalendarCheck,
  faGear,
  faTriangleExclamation,
  faBolt,
  faBoxArchive,
  faEllipsisVertical,
  faClockRotateLeft,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import "./EvacueeCheckIn.css";

export default function EvacueeCheckIn() {
  const queryClient = useQueryClient();
  const [selectedOperationId, setSelectedOperationId] = useState("active");
  const [selectedCenterId, setSelectedCenterId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "pending" | "partial" | "checked_in"
  const [selectedDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = useMemo(
    () => searchQuery.trim().replace(/\s+/g, " "),
    [searchQuery]
  );
  const [isMobileViewport, setIsMobileViewport] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 768px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mq = window.matchMedia("(max-width: 768px)");
    const handleChange = (e) => setIsMobileViewport(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handleChange);
      return () => mq.removeEventListener("change", handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Dropdown Menu & Mobile Filter Sheet States
  const [opMenuOpen, setOpMenuOpen] = useState(false);
  const [shelterMenuOpen, setShelterMenuOpen] = useState(false);
  const [bannerMenuOpen, setBannerMenuOpen] = useState(false);
  const [openMobileRowMenuId, setOpenMobileRowMenuId] = useState(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftCenterId, setDraftCenterId] = useState("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Member Checklist Modal State
  const [modalFamily, setModalFamily] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set());

  // User auth & Evacuation Operation / Report States
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [exportingReport, setExportingReport] = useState(false);
  const [showManageOpModal, setShowManageOpModal] = useState(false);
  const [showNewOpModal, setShowNewOpModal] = useState(false);
  const [pendingOpConfirm, setPendingOpConfirm] = useState(null); // null | "manage-conclude" | "new-operation"
  const [scheduleCenterId, setScheduleCenterId] = useState("all");
  const [scheduleOpenDate, setScheduleOpenDate] = useState("");
  const [scheduleOpenTime, setScheduleOpenTime] = useState("08:00");
  const [scheduleCutoffDate, setScheduleCutoffDate] = useState("");
  const [scheduleCutoffTime, setScheduleCutoffTime] = useState("18:00");
  const [scheduleStatus, setScheduleStatus] = useState("open");
  const [scheduleEventName, setScheduleEventName] = useState("");
  const [scheduleEventNameError, setScheduleEventNameError] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const savingScheduleRef = useRef(false);

  // Quick Extension Modal States
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendHoursOption, setExtendHoursOption] = useState(2);
  const [customExtendDate, setCustomExtendDate] = useState("");
  const [customExtendTime, setCustomExtendTime] = useState("20:00");
  const [extendingSchedule, setExtendingSchedule] = useState(false);

  // Fetch check-in data
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["evacuee-check-in-list", selectedCenterId, filterStatus, normalizedSearch, selectedDate, selectedOperationId],
    queryFn: () =>
      api.getCheckInList({
        center_id: selectedCenterId,
        q: normalizedSearch,
        status: filterStatus,
        date: selectedDate || undefined,
        operation_id: selectedOperationId,
      }),
    staleTime: 10_000,
  });

  const centers = useMemo(() => data?.centers || [], [data?.centers]);
  const evacuees = useMemo(() => data?.evacuees || [], [data?.evacuees]);
  const operations = useMemo(() => data?.operations || [], [data?.operations]);
  const isHistorical = Boolean(data?.is_historical || (selectedOperationId !== "active" && selectedOperationId !== ""));
  const summary = data?.summary || {
    total_assigned: 0,
    total_checked_in: 0,
    total_partial: 0,
    total_pending: 0,
    occupancy_rate: 0,
  };

  const schedule = useMemo(() => data?.evacuation_schedule || {
    center_id: "all",
    center_name: "All Evacuation Centers",
    evacuation_open_date: null,
    evacuation_open_time: "08:00",
    evacuation_cutoff_date: null,
    evacuation_cutoff_time: "18:00",
    evacuation_extension_count: 0,
    evacuation_extended_until: null,
    evacuation_status: "standby",
    evacuation_event_name: "",
    is_schedule_set: false,
    is_expired: false,
    can_check_in: false,
  }, [data?.evacuation_schedule]);

  // Determine active center and effective schedule
  const activeCenterObj = useMemo(() => {
    if (selectedCenterId === "all") return null;
    return centers.find((c) => String(c.id) === String(selectedCenterId));
  }, [centers, selectedCenterId]);

  const effectiveSchedule = useMemo(() => {
    if (activeCenterObj) {
      return {
        ...schedule,
        ...activeCenterObj,
        is_schedule_set: Boolean(activeCenterObj.evacuation_open_date),
        can_check_in: Boolean(activeCenterObj.can_check_in),
        is_expired: Boolean(activeCenterObj.is_expired),
      };
    }
    return schedule;
  }, [schedule, activeCenterObj]);

  const isScheduleConfigured = Boolean(effectiveSchedule?.is_schedule_set || effectiveSchedule?.evacuation_open_date);
  const isCenterClosed = (effectiveSchedule?.evacuation_status || "standby") === "closed";
  const isWindowExpired = Boolean(effectiveSchedule?.is_expired);
  const canCheckIn = !isHistorical && isScheduleConfigured && !isCenterClosed;

  const getCheckInDisabledReason = (evacuee) => {
    if (isHistorical) {
      return "Viewing archived historical operation. Check-in records from past disaster events are preserved as read-only.";
    }
    if (!isScheduleConfigured) {
      return "Cannot mark as arrived: No evacuation operation has been started. An administrator must open evacuation operations.";
    }
    if (isCenterClosed) {
      return `Cannot mark as arrived: ${evacuee?.center_name || "Evacuation center"} is currently closed / concluded.`;
    }
    return null;
  };

  // Close dropdown menus & filter sheet on outside click or Escape
  useEffect(() => {
    if (!opMenuOpen && !shelterMenuOpen && !bannerMenuOpen && openMobileRowMenuId == null && !filterSheetOpen) {
      return undefined;
    }
    const handleOutsideClick = (e) => {
      if (!e.target.closest?.(".checkin-dropdown-anchor") && !e.target.closest?.(".checkin-mobile-menu-anchor")) {
        setOpMenuOpen(false);
        setShelterMenuOpen(false);
        setBannerMenuOpen(false);
        setOpenMobileRowMenuId(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpMenuOpen(false);
        setShelterMenuOpen(false);
        setBannerMenuOpen(false);
        setOpenMobileRowMenuId(null);
        setFilterSheetOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [opMenuOpen, shelterMenuOpen, bannerMenuOpen, openMobileRowMenuId, filterSheetOpen]);

  // Open Manage Operation Modal (prefilled with current operation details)
  const handleOpenManageOpModal = () => {
    const today = new Date().toISOString().split("T")[0];
    setScheduleCenterId(selectedCenterId !== "all" ? String(selectedCenterId) : "all");
    setScheduleOpenDate(effectiveSchedule?.evacuation_open_date || today);
    setScheduleOpenTime(effectiveSchedule?.evacuation_open_time || "08:00");
    setScheduleCutoffDate(
      effectiveSchedule?.evacuation_cutoff_date ||
      effectiveSchedule?.evacuation_open_date ||
      today
    );
    setScheduleCutoffTime(effectiveSchedule?.evacuation_cutoff_time || "18:00");
    setScheduleStatus(effectiveSchedule?.evacuation_status || "open");
    setScheduleEventName(effectiveSchedule?.evacuation_event_name || "");
    setScheduleEventNameError("");
    setPendingOpConfirm(null);
    setShowNewOpModal(false);
    setShowManageOpModal(true);
  };

  // Open New Operation Modal (starts with empty fields)
  const handleOpenNewOpModal = () => {
    setScheduleEventName("");
    setScheduleEventNameError("");
    setScheduleCenterId("all");
    setScheduleOpenDate("");
    setScheduleOpenTime("");
    setScheduleCutoffDate("");
    setScheduleCutoffTime("");
    setScheduleStatus("open");
    setPendingOpConfirm(null);
    setShowManageOpModal(false);
    setShowNewOpModal(true);
  };

  // Submit / Confirm Operation Save (with validation, confirmation, and double-click guard)
  const handleSaveOperation = async (mode, confirmed = false) => {
    if (savingScheduleRef.current) return;

    const trimmedName = scheduleEventName.trim();
    if (!trimmedName) {
      setScheduleEventNameError("Operation name is required.");
      return;
    }

    if (mode === "manage" && scheduleStatus === "closed" && !confirmed) {
      setPendingOpConfirm("manage-conclude");
      return;
    }

    if (mode === "new" && !confirmed) {
      setPendingOpConfirm("new-operation");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const openDateValue = scheduleOpenDate || today;
    const openTimeValue = scheduleOpenTime || "08:00";
    const cutoffDateValue = scheduleCutoffDate || openDateValue;
    const cutoffTimeValue = scheduleCutoffTime || "18:00";

    try {
      savingScheduleRef.current = true;
      setSavingSchedule(true);
      const res = await api.updateEvacuationSchedule({
        center_id: scheduleCenterId,
        evacuation_open_date: openDateValue,
        evacuation_open_time: openTimeValue,
        evacuation_cutoff_date: cutoffDateValue,
        evacuation_cutoff_time: cutoffTimeValue,
        evacuation_status: scheduleStatus,
        evacuation_event_name: trimmedName,
        start_new_operation: mode === "new",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evacuee-check-in-list"] }),
        queryClient.invalidateQueries({ queryKey: ["evacuation-centers"] }),
      ]);
      showToast(
        res?.message ||
        (mode === "new"
          ? "New evacuation operation started."
          : "Evacuation operation successfully saved.")
      );
      setPendingOpConfirm(null);
      setShowManageOpModal(false);
      setShowNewOpModal(false);
      if (mode === "new") {
        setSelectedOperationId("active");
        setCurrentPage(1);
      }
    } catch (err) {
      showToast(err.message || "Failed to update evacuation operation.");
    } finally {
      savingScheduleRef.current = false;
      setSavingSchedule(false);
    }
  };

  const handleExtendSchedule = async (presetHours) => {
    try {
      setExtendingSchedule(true);
      const payload = {
        center_id: selectedCenterId !== "all" ? selectedCenterId : "all",
      };
      if (presetHours) {
        payload.extend_hours = presetHours;
      } else if (extendHoursOption === "custom") {
        payload.custom_cutoff_date = customExtendDate;
        payload.custom_cutoff_time = customExtendTime;
      } else {
        payload.extend_hours = Number(extendHoursOption);
      }
      const res = await api.extendEvacuationSchedule(payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evacuee-check-in-list"] }),
        queryClient.invalidateQueries({ queryKey: ["evacuation-centers"] }),
      ]);
      showToast(res?.message || "Arrival deadline extended successfully.");
      setShowExtendModal(false);
    } catch (err) {
      showToast(err.message || "Failed to extend arrival deadline.");
    } finally {
      setExtendingSchedule(false);
    }
  };

  // Export Evacuee Arrival Report (.xlsx)
  const handleExportReport = async () => {
    try {
      setExportingReport(true);
      const blob = await api.exportCheckInReport({
        center_id: selectedCenterId,
        status: filterStatus,
        q: normalizedSearch,
        date: selectedDate || undefined,
        operation_id: selectedOperationId,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const centerObj = centers.find((c) => String(c.id) === String(selectedCenterId));
      const centerSlug = centerObj ? centerObj.name.replace(/\s+/g, "_") : "All_Centers";
      const opObj = operations.find((o) => String(o.id) === String(selectedOperationId));
      const opSlug = opObj ? opObj.event_name.replace(/\s+/g, "_") : (selectedOperationId === "active" ? "Active_Operation" : "Operation");
      const dateSlug = (selectedDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
      a.download = `EvacWay-Arrival-Report-${opSlug}-${centerSlug}-${dateSlug}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("Evacuee arrival report downloaded successfully.");
    } catch (err) {
      console.error("Failed to export check-in report:", err);
      showToast(err.message || "Failed to download arrival report.");
    } finally {
      setExportingReport(false);
    }
  };

  // Derived Pagination
  const totalCount = evacuees.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);

  const paginatedEvacuees = useMemo(() => {
    return evacuees.slice(startIndex, endIndex);
  }, [evacuees, startIndex, endIndex]);

  // Generate pagination buttons with smart ellipsis
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push("...");
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (safeCurrentPage < totalPages - 2) pages.push("...");
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  };

  // Show auto-dismissing toast
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Mutation for check-in / partial / undo
  const checkInMutation = useMutation({
    mutationFn: ({ centerId, familyId, action, residentIds }) =>
      api.updateEvacueeCheckIn(centerId, {
        family_id: familyId,
        action,
        resident_ids: residentIds,
        method: "manual",
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["evacuee-check-in-list"] });
      queryClient.invalidateQueries({ queryKey: ["evacuation-centers"] });
      queryClient.invalidateQueries({ queryKey: ["evacuation-center-details"] });
      showToast(res?.message || "Successfully updated check-in status.");
    },
    onError: (err) => {
      showToast(err?.message || "Failed to update check-in status.");
    },
    onSettled: () => {
      setActionLoadingId(null);
    },
  });

  // Quick 1-click All Arrived
  const handleQuickCheckInAll = (evacuee) => {
    setActionLoadingId(evacuee.family_id);
    checkInMutation.mutate({
      centerId: evacuee.center_id,
      familyId: evacuee.family_id,
      action: "check_in",
    });
  };

  // Quick 1-click Undo Check-In
  const handleQuickUndo = (evacuee) => {
    setActionLoadingId(evacuee.family_id);
    checkInMutation.mutate({
      centerId: evacuee.center_id,
      familyId: evacuee.family_id,
      action: "check_out",
    });
  };

  // Open Member Checklist Modal
  const handleOpenMemberModal = (evacuee) => {
    setModalFamily(evacuee);
    const members = evacuee.members || [];
    const alreadyPresent = members.filter((m) => m.is_checked_in).map((m) => m.id);

    if (alreadyPresent.length > 0) {
      setSelectedMemberIds(new Set(alreadyPresent));
    } else {
      setSelectedMemberIds(new Set(members.map((m) => m.id)));
    }
  };

  // Member toggle in modal
  const handleToggleMember = (memberId) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const handleSelectAllMembers = () => {
    if (!modalFamily?.members) return;
    setSelectedMemberIds(new Set(modalFamily.members.map((m) => m.id)));
  };

  const handleClearAllMembers = () => {
    setSelectedMemberIds(new Set());
  };

  const handleSaveModalCheckIn = () => {
    if (!modalFamily) return;
    const residentIdsList = Array.from(selectedMemberIds);
    setActionLoadingId(modalFamily.family_id);

    if (residentIdsList.length === 0) {
      checkInMutation.mutate({
        centerId: modalFamily.center_id,
        familyId: modalFamily.family_id,
        action: "check_out",
      }, {
        onSettled: () => setModalFamily(null),
      });
      return;
    }

    checkInMutation.mutate({
      centerId: modalFamily.center_id,
      familyId: modalFamily.family_id,
      residentIds: residentIdsList,
      action: "partial",
    }, {
      onSettled: () => setModalFamily(null),
    });
  };

  const getInitials = (name) => {
    if (!name) return "HH";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join("") || "HH";
  };

  const normalizeRoomLabel = (room) => {
    if (!room) return "";
    const str = String(room).trim();
    if (!str) return "";
    return /^\d+[a-zA-Z]?$/i.test(str) ? `Room ${str}` : str;
  };

  const getEvacueeStructureMode = (evacuee) => {
    const raw = String(evacuee?.structure_mode || "").trim().toLowerCase();
    if (["open_area", "rooms_only", "buildings_and_rooms"].includes(raw)) {
      return raw;
    }
    const code = String(evacuee?.center_type || "").trim().toLowerCase();
    if (code === "single_venue") return "open_area";
    if (code === "private_property") return "rooms_only";
    return "buildings_and_rooms";
  };

  const formatRoomBadge = (bldg, room, structureMode = "buildings_and_rooms") => {
    if (structureMode === "open_area") return null;
    const label = normalizeRoomLabel(room);
    if (!label) return null;
    if (structureMode === "buildings_and_rooms" && bldg) {
      return `${bldg} · ${label}`;
    }
    return label;
  };

  const formatMobileShelterLine = (evacuee) => {
    const mode = getEvacueeStructureMode(evacuee);
    if (mode === "open_area") {
      return evacuee.center_name || "Evacuation Center";
    }
    const roomLabel = normalizeRoomLabel(evacuee.room_number);
    const venueParts =
      mode === "buildings_and_rooms"
        ? [evacuee.building_name, roomLabel].filter(Boolean).join(", ")
        : roomLabel;
    return [evacuee.center_name, venueParts].filter(Boolean).join(" · ");
  };

  const formatOpDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatOpDateRange = (openDate, cutoffDate) => {
    const start = formatOpDate(openDate);
    const end = formatOpDate(cutoffDate);
    if (start && end && cutoffDate !== openDate) return `${start} – ${end}`;
    return start || end || "";
  };

  const activeOperation = useMemo(
    () => operations.find((op) => op.status !== "concluded") || null,
    [operations]
  );

  const archivedOperations = useMemo(() => {
    return operations
      .filter((op) => op.status === "concluded")
      .slice()
      .sort((a, b) => {
        const aKey = a.concluded_at || a.open_date || "";
        const bKey = b.concluded_at || b.open_date || "";
        if (bKey !== aKey) return bKey.localeCompare(aKey);
        return (b.id || 0) - (a.id || 0);
      });
  }, [operations]);

  const activeOpName =
    activeOperation?.event_name ||
    (!isHistorical ? effectiveSchedule?.evacuation_event_name : "") ||
    "Current Operation";
  const activeOpDates = formatOpDateRange(
    activeOperation?.open_date || (!isHistorical ? effectiveSchedule?.evacuation_open_date : null),
    activeOperation?.cutoff_date || (!isHistorical ? effectiveSchedule?.evacuation_cutoff_date : null)
  );
  const selectedArchivedOp = useMemo(
    () => archivedOperations.find((op) => String(op.id) === String(selectedOperationId)) || null,
    [archivedOperations, selectedOperationId]
  );
  const selectedCenterObj = useMemo(
    () => (selectedCenterId === "all" ? null : centers.find((c) => String(c.id) === String(selectedCenterId)) || null),
    [centers, selectedCenterId]
  );
  const archivedBannerName =
    effectiveSchedule?.evacuation_event_name ||
    selectedArchivedOp?.event_name ||
    "Archived Operation";
  const archivedBannerDates = formatOpDateRange(
    effectiveSchedule?.evacuation_open_date || selectedArchivedOp?.open_date,
    effectiveSchedule?.evacuation_cutoff_date || selectedArchivedOp?.cutoff_date
  );

  const renderMobileOperationMenu = () => (
    <div className="checkin-banner-mobile-actions checkin-dropdown-anchor">
      <button
        type="button"
        className="checkin-mobile-kebab-btn checkin-banner-kebab-btn"
        onClick={() => {
          setOpMenuOpen(false);
          setShelterMenuOpen(false);
          setOpenMobileRowMenuId(null);
          setBannerMenuOpen((prev) => !prev);
        }}
        aria-label="Operation actions"
        aria-expanded={bannerMenuOpen}
        aria-haspopup="menu"
      >
        <FontAwesomeIcon icon={faEllipsisVertical} />
      </button>

      {bannerMenuOpen && (
        <div className="checkin-mobile-row-dropdown checkin-banner-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="checkin-mobile-row-menu-item"
            onClick={() => {
              setBannerMenuOpen(false);
              handleOpenManageOpModal();
            }}
          >
            <FontAwesomeIcon icon={faGear} />
            <span>Manage Operation</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="checkin-mobile-row-menu-item is-primary"
            onClick={() => {
              setBannerMenuOpen(false);
              handleOpenNewOpModal();
            }}
          >
            <FontAwesomeIcon icon={faBolt} />
            <span>New Operation</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="checkin-container" role="main" aria-label="Evacuee Check-In Management">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="checkin-floating-toast"
        >
          <FontAwesomeIcon icon={faCheck} className="checkin-toast-check-icon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header: Single row on desktop (Title left, compact controls right); stacked rows on mobile */}
      <header className="checkin-header">
        <div className="checkin-header-titles">
          <div className="checkin-title-badge-row">
            <h1>Evacuee Arrival & Check-In</h1>
            {!isHistorical && (
              <span className="checkin-live-badge">
                <span className="checkin-live-dot" /> Live
              </span>
            )}
          </div>
        </div>

        {/* Header Actions (Operation Selector, Shelter Filter, Export Report/Archive) */}
        <div className="checkin-header-actions">
          {/* Operation History Selector (Compact closed label; full name + date range in open menu) */}
          <div className="checkin-op-dropdown-wrap checkin-dropdown-anchor">
            <button
              type="button"
              id="checkin-operation-filter-select"
              className="checkin-op-trigger"
              onClick={() => {
                setShelterMenuOpen(false);
                setOpMenuOpen((prev) => !prev);
              }}
              aria-haspopup="listbox"
              aria-expanded={opMenuOpen}
              aria-label="Select active or archived evacuation operation"
              title={
                isHistorical
                  ? `${archivedBannerName}${archivedBannerDates ? ` (${archivedBannerDates})` : ""}`
                  : `Active: ${activeOpName}${activeOpDates ? ` (${activeOpDates})` : ""}`
              }
            >
              <FontAwesomeIcon icon={faClockRotateLeft} className="checkin-pill-icon" />
              <span className="checkin-op-trigger-label">
                {isHistorical ? archivedBannerName : `Active: ${activeOpName}`}
              </span>
              <FontAwesomeIcon icon={faChevronDown} className="checkin-pill-arrow" />
            </button>

            {opMenuOpen && (
              <div className="checkin-op-dropdown-menu" role="listbox" aria-label="Evacuation operations">
                <button
                  type="button"
                  role="option"
                  aria-selected={!isHistorical}
                  className={`checkin-op-option ${!isHistorical ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelectedOperationId("active");
                    setCurrentPage(1);
                    setOpMenuOpen(false);
                  }}
                >
                  <span className="checkin-op-option-main">
                    <span className="checkin-op-option-badge is-active">Active</span>
                    <span className="checkin-op-option-name">{activeOpName}</span>
                  </span>
                  {activeOpDates && (
                    <span className="checkin-op-option-date">{activeOpDates}</span>
                  )}
                </button>

                <div className="checkin-op-menu-divider" />

                {archivedOperations.length === 0 ? (
                  <div className="checkin-op-menu-empty" role="option" aria-disabled="true">
                    No archived operations yet
                  </div>
                ) : (
                  archivedOperations.map((op) => {
                    const rangeLabel = formatOpDateRange(op.open_date, op.cutoff_date);
                    const isSelected = String(op.id) === String(selectedOperationId);
                    return (
                      <button
                        key={op.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`checkin-op-option ${isSelected ? "is-selected" : ""}`}
                        onClick={() => {
                          setSelectedOperationId(String(op.id));
                          setCurrentPage(1);
                          setOpMenuOpen(false);
                        }}
                      >
                        <span className="checkin-op-option-main">
                          <span className="checkin-op-option-name">{op.event_name || "Archived Operation"}</span>
                        </span>
                        {rangeLabel && (
                          <span className="checkin-op-option-date">{rangeLabel}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* By-Center Filter Dropdown (Closed shows "All Shelters" or name without count; open list shows counts) */}
          <div className="checkin-shelter-dropdown-wrap checkin-dropdown-anchor">
            <button
              type="button"
              id="checkin-center-filter-select"
              className="checkin-op-trigger checkin-shelter-trigger"
              onClick={() => {
                setOpMenuOpen(false);
                setShelterMenuOpen((prev) => !prev);
              }}
              aria-haspopup="listbox"
              aria-expanded={shelterMenuOpen}
              aria-label="Filter evacuees by center"
              title={
                selectedCenterObj
                  ? `${selectedCenterObj.name} (${selectedCenterObj.checked_in}/${selectedCenterObj.assigned})`
                  : `All Shelters (${centers.length})`
              }
            >
              <FontAwesomeIcon icon={faBuildingColumns} className="checkin-pill-icon" />
              <span className="checkin-op-trigger-label">
                {selectedCenterObj ? selectedCenterObj.name : "All Shelters"}
              </span>
              <FontAwesomeIcon icon={faChevronDown} className="checkin-pill-arrow" />
            </button>

            {shelterMenuOpen && (
              <div className="checkin-op-dropdown-menu checkin-shelter-dropdown-menu" role="listbox" aria-label="Evacuation centers">
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedCenterId === "all"}
                  className={`checkin-op-option checkin-shelter-option ${selectedCenterId === "all" ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelectedCenterId("all");
                    setCurrentPage(1);
                    setShelterMenuOpen(false);
                  }}
                >
                  <span className="checkin-op-option-main checkin-shelter-option-row">
                    <span className="checkin-op-option-name">All Shelters</span>
                    <span className="checkin-op-option-count">({centers.length})</span>
                  </span>
                </button>

                {centers.map((c) => {
                  const isSelected = String(selectedCenterId) === String(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`checkin-op-option checkin-shelter-option ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedCenterId(String(c.id));
                        setCurrentPage(1);
                        setShelterMenuOpen(false);
                      }}
                    >
                      <span className="checkin-op-option-main checkin-shelter-option-row">
                        <span className="checkin-op-option-name">{c.name}</span>
                        <span className="checkin-op-option-count">
                          ({c.checked_in}/{c.assigned})
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Downloadable Report Button */}
          <button
            type="button"
            className="checkin-export-btn"
            onClick={handleExportReport}
            disabled={exportingReport}
            aria-label={exportingReport ? "Exporting report" : isHistorical ? "Export Archive" : "Export Report"}
            title={isHistorical ? "Download historical check-in report for this archived event" : "Download Excel arrival roster and shelter summary report"}
          >
            <FontAwesomeIcon icon={exportingReport ? faSpinner : faFileExcel} spin={exportingReport} />
            <span className="checkin-export-label">
              {exportingReport ? "Exporting..." : isHistorical ? "Export Archive" : "Export Report"}
            </span>
          </button>
        </div>
      </header>

      {/* Unified Single Operational Banner */}
      <div className={`checkin-banner ${isHistorical ? "is-archive" : isWindowExpired ? "is-expired" : !isScheduleConfigured ? "is-unscheduled" : isCenterClosed ? "is-closed" : "is-active"}`}>
        {isHistorical ? (
          // State 1: Historical Archive Mode (Single clean row on desktop & mobile)
          <div className="checkin-banner-inner">
            <div className="checkin-banner-left">
              <div className="checkin-banner-icon archive">
                <FontAwesomeIcon icon={faBoxArchive} />
              </div>
              <div className="checkin-banner-details">
                <span className="checkin-banner-title">
                  Viewing archived: <strong>{archivedBannerName}</strong>
                  {archivedBannerDates ? (
                    <span className="checkin-hide-mobile">{` · ${archivedBannerDates}`}</span>
                  ) : null}
                </span>
              </div>
            </div>
            <div className="checkin-banner-actions">
              <button
                type="button"
                className="checkin-banner-btn primary"
                onClick={() => {
                  setSelectedOperationId("active");
                  setCurrentPage(1);
                }}
                title="Return to the current active evacuation operation"
              >
                <FontAwesomeIcon icon={faRotateLeft} />
                <span className="checkin-hide-mobile">Back to active operation</span>
                <span className="checkin-show-mobile">Back</span>
              </button>
            </div>
          </div>
        ) : !isScheduleConfigured ? (
          // State 2: No Schedule Configured
          <div className="checkin-banner-inner">
            <div className="checkin-banner-left">
              <div className="checkin-banner-icon info">
                <FontAwesomeIcon icon={faCalendarDays} />
              </div>
              <span className="checkin-banner-mobile-dot standby" aria-hidden="true" />
              <div className="checkin-banner-details">
                <div className="checkin-banner-title-row">
                  <span className="checkin-banner-title">No Evacuation Schedule Configured</span>
                  <span className="checkin-banner-pill standby">Standby</span>
                </div>
                <div className="checkin-banner-meta">
                  <span>Set an opening date and arrival deadline to enable resident check-in.</span>
                </div>
              </div>
            </div>
            {isAdmin && (
              <>
                <div className="checkin-banner-actions">
                  <button
                    type="button"
                    className="checkin-banner-btn primary"
                    onClick={handleOpenManageOpModal}
                  >
                    <FontAwesomeIcon icon={faCalendarDays} />
                    <span>Set Evacuation Date</span>
                  </button>
                </div>
                {renderMobileOperationMenu()}
              </>
            )}
          </div>
        ) : isCenterClosed ? (
          // State 3: Shelter Closed
          <div className="checkin-banner-inner">
            <div className="checkin-banner-left">
              <div className="checkin-banner-icon neutral">
                <FontAwesomeIcon icon={faTriangleExclamation} />
              </div>
              <span className="checkin-banner-mobile-dot closed" aria-hidden="true" />
              <div className="checkin-banner-details">
                <div className="checkin-banner-title-row">
                  <span className="checkin-banner-title">
                    <span className="checkin-hide-mobile">Evacuation Closed / Concluded — </span>
                    <strong>{effectiveSchedule?.evacuation_event_name || "Evacuation"}</strong>
                  </span>
                  <span className="checkin-banner-pill closed">Closed / Stand Down</span>
                </div>
                <div className="checkin-banner-meta">
                  <span>Shelters have concluded operations and are currently standing down. Check-in is paused.</span>
                </div>
              </div>
            </div>
            {isAdmin && (
              <>
                <div className="checkin-banner-actions">
                  <button
                    type="button"
                    className="checkin-banner-btn secondary"
                    onClick={handleOpenManageOpModal}
                  >
                    <FontAwesomeIcon icon={faRotateLeft} />
                    <span>Reopen Operation</span>
                  </button>
                  <button
                    type="button"
                    className="checkin-banner-btn primary"
                    onClick={handleOpenNewOpModal}
                    title="Start a new evacuation operation for a new disaster event"
                  >
                    <FontAwesomeIcon icon={faBolt} />
                    <span>Start New Evacuation</span>
                  </button>
                </div>
                {renderMobileOperationMenu()}
              </>
            )}
          </div>
        ) : (
          // State 4: Active Live Operation (24/7 Arrivals)
          <div className="checkin-banner-inner">
            <div className="checkin-banner-left">
              <div className="checkin-banner-icon live">
                <FontAwesomeIcon icon={faCalendarCheck} />
              </div>
              <span className="checkin-banner-mobile-dot live" aria-hidden="true" />
              <div className="checkin-banner-details">
                <div className="checkin-banner-title-row">
                  <span className="checkin-banner-title">
                    <strong>{effectiveSchedule?.evacuation_event_name || "General Municipality Evacuation"}</strong>
                  </span>
                  <span className="checkin-banner-pill open">
                    <span className="checkin-live-dot" style={{ width: 6, height: 6 }} />
                    Open for Evacuation (24/7)
                  </span>
                </div>
                <div className="checkin-banner-meta">
                  <span>
                    Started: {effectiveSchedule?.evacuation_open_date ? new Date(effectiveSchedule.evacuation_open_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Today"}
                  </span>
                  <span className="checkin-banner-dot">•</span>
                  <span>Scope: {selectedCenterId !== "all" ? centers.find((c) => String(c.id) === String(selectedCenterId))?.name || "Selected Center" : "All Shelters"}</span>
                  <span className="checkin-banner-dot">•</span>
                  <span>Arrival check-ins active 24/7</span>
                </div>
              </div>
            </div>
            {isAdmin && (
              <>
                <div className="checkin-banner-actions">
                  <button
                    type="button"
                    className="checkin-banner-btn secondary"
                    onClick={handleOpenManageOpModal}
                    title="Edit operation parameters or conclude/archive"
                  >
                    <FontAwesomeIcon icon={faGear} />
                    <span>Manage Operation</span>
                  </button>
                  <button
                    type="button"
                    className="checkin-banner-btn primary"
                    onClick={handleOpenNewOpModal}
                    title="Start a fresh evacuation operation for a new disaster event"
                  >
                    <FontAwesomeIcon icon={faBolt} />
                    <span>New Operation</span>
                  </button>
                </div>
                {renderMobileOperationMenu()}
              </>
            )}
          </div>
        )}
      </div>

      {/* Interactive KPI Stat Cards (Click to Filter by Status) */}
      <section className="stat-card-grid cols-4" role="group" aria-label="Filter check-in list by arrival status">
        {/* Total Assigned */}
        <button
          type="button"
          className={`stat-card is-clickable is-neutral ${filterStatus === "all" ? "is-selected" : ""}`}
          onClick={() => {
            setFilterStatus("all");
            setCurrentPage(1);
          }}
          aria-pressed={filterStatus === "all"}
        >
          <div className="stat-card-content">
            <span className="stat-card-label">Total Assigned</span>
            <strong className="stat-card-value">{summary.total_assigned}</strong>
            <span className="stat-card-hint">All assigned evacuees</span>
          </div>
          <span className="stat-card-icon stat-card-icon--neutral" aria-hidden="true">
            <FontAwesomeIcon icon={faUserGroup} />
          </span>
        </button>

        {/* Fully Arrived */}
        <button
          type="button"
          className={`stat-card is-clickable is-resolved ${filterStatus === "checked_in" ? "is-selected" : ""}`}
          onClick={() => {
            setFilterStatus("checked_in");
            setCurrentPage(1);
          }}
          aria-pressed={filterStatus === "checked_in"}
        >
          <div className="stat-card-content">
            <span className="stat-card-label">Fully Arrived</span>
            <strong className="stat-card-value">{summary.total_checked_in}</strong>
            <span className="stat-card-hint">Checked in successfully</span>
          </div>
          <span className="stat-card-icon stat-card-icon--resolved" aria-hidden="true">
            <FontAwesomeIcon icon={faCircleCheck} />
          </span>
        </button>

        {/* Partially Arrived */}
        <button
          type="button"
          className={`stat-card is-clickable is-warning ${filterStatus === "partial" ? "is-selected" : ""}`}
          onClick={() => {
            setFilterStatus("partial");
            setCurrentPage(1);
          }}
          aria-pressed={filterStatus === "partial"}
        >
          <div className="stat-card-content">
            <span className="stat-card-label">Partially Arrived</span>
            <strong className="stat-card-value">{summary.total_partial || 0}</strong>
            <span className="stat-card-hint">Some members checked in</span>
          </div>
          <span className="stat-card-icon stat-card-icon--warning" aria-hidden="true">
            <FontAwesomeIcon icon={faClock} />
          </span>
        </button>

        {/* Pending Arrival */}
        <button
          type="button"
          className={`stat-card is-clickable is-pending ${filterStatus === "pending" ? "is-selected" : ""}`}
          onClick={() => {
            setFilterStatus("pending");
            setCurrentPage(1);
          }}
          aria-pressed={filterStatus === "pending"}
        >
          <div className="stat-card-content">
            <span className="stat-card-label">Pending Arrival</span>
            <strong className="stat-card-value">{summary.total_pending}</strong>
            <span className="stat-card-hint">Not yet checked in</span>
          </div>
          <span className="stat-card-icon stat-card-icon--pending" aria-hidden="true">
            <FontAwesomeIcon icon={faCircleExclamation} />
          </span>
        </button>
      </section>

      {/* Full-Width Search Toolbar (+ Mobile Shelter Filters Button) */}
      <section className="checkin-controls-card" aria-label="Search evacuees">
        <div className="checkin-search-wrap">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="checkin-search-icon" />
          <input
            type="text"
            className="checkin-search-input"
            placeholder={
              isMobileViewport
                ? "Search name or code"
                : "Search by name or household code"
            }
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Search evacuees"
          />
          {searchQuery && (
            <button
              type="button"
              className="checkin-search-clear"
              onClick={() => {
                setSearchQuery("");
                setCurrentPage(1);
              }}
              title="Clear search"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`checkin-mobile-filter-btn ${selectedCenterId !== "all" ? "has-active" : ""}`}
          onClick={() => {
            setOpMenuOpen(false);
            setBannerMenuOpen(false);
            setOpenMobileRowMenuId(null);
            setDraftCenterId(selectedCenterId);
            setFilterSheetOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={filterSheetOpen}
          aria-label={
            selectedCenterId !== "all"
              ? "Filter by shelter (shelter selected)"
              : "Filter by shelter"
          }
        >
          <FontAwesomeIcon icon={faSliders} />
          <span>Filters</span>
          {selectedCenterId !== "all" && (
            <span className="checkin-filter-dot" aria-hidden="true" />
          )}
        </button>
      </section>

      {/* Evacuee List Section */}
      <section className="checkin-table-card" aria-label="Evacuee check-in list">
        {isLoading ? (
          <div className="checkin-loading-spinner" role="status">
            <FontAwesomeIcon icon={faSpinner} spin />
            <span>Loading assigned evacuees...</span>
          </div>
        ) : error ? (
          <div className="checkin-empty-state">
            <div className="checkin-empty-icon">!</div>
            <h3 className="checkin-empty-title">Error Loading Evacuees</h3>
            <p className="checkin-empty-text">{error.message || "Failed to load check-in data."}</p>
          </div>
        ) : evacuees.length === 0 ? (
          <div className="checkin-empty-state">
            <div className="checkin-empty-icon">
              <FontAwesomeIcon icon={faUsers} />
            </div>
            <h3 className="checkin-empty-title">No Evacuees Found</h3>
            <p className="checkin-empty-text">
              {searchQuery
                ? `No matching households found for "${searchQuery}".`
                : filterStatus === "pending"
                  ? "All assigned households have arrived!"
                  : filterStatus === "partial"
                    ? "No households have partial arrivals right now."
                    : "No households match the current filters."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table View */}
            <div className="checkin-table-wrap">
              <table className="checkin-table">
                <thead>
                  <tr>
                    <th scope="col" className="col-household">Household</th>
                    <th scope="col" className="col-barangay">Origin Barangay</th>
                    <th scope="col" className="col-center">Assigned Shelter</th>
                    <th scope="col" className="col-members">Family Members</th>
                    <th scope="col" className="col-status checkin-th-status">STATUS</th>
                    <th scope="col" className="col-action">Staff Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvacuees.map((evacuee) => {
                    const isRowLoading = actionLoadingId === evacuee.family_id;
                    const state = evacuee.checkin_state || "none";
                    const isFullyArrived = state === "full";
                    const isPartiallyArrived = state === "partial";

                    return (
                      <tr key={`${evacuee.family_id}-${evacuee.center_id}`}>
                        {/* Household Head info */}
                        <td className="col-household">
                          <div className="checkin-user-cell">
                            <div className="checkin-avatar" aria-hidden="true">
                              {getInitials(evacuee.head_name)}
                            </div>
                            <div className="checkin-user-text">
                              <span className="checkin-user-name">{evacuee.head_name}</span>
                              {evacuee.contact_number && (
                                <span className="checkin-contact-num">{evacuee.contact_number}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Origin Barangay */}
                        <td className="col-barangay">
                          <div className="checkin-barangay-cell">
                            <span className="checkin-barangay-name">
                              {evacuee.barangay_name}
                            </span>
                            {evacuee.address && (
                              <span className="checkin-address-text">
                                {evacuee.address}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Center & Room */}
                        <td className="col-center">
                          <div className="checkin-center-cell">
                            <span className="checkin-center-name">
                              {evacuee.center_name}
                            </span>
                            {(() => {
                              const mode = getEvacueeStructureMode(evacuee);
                              const badge = formatRoomBadge(
                                evacuee.building_name,
                                evacuee.room_number,
                                mode
                              );
                              return badge ? (
                                <div>
                                  <span className="checkin-room-badge is-assigned">
                                    <span>{badge}</span>
                                  </span>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </td>

                        {/* Family members & tags */}
                        <td className="col-members">
                          <div className="checkin-members-cell">
                            <div className="checkin-members-row">
                              <button
                                type="button"
                                className="checkin-members-chip-btn"
                                onClick={() => handleOpenMemberModal(evacuee)}
                                title={evacuee.special_needs?.length ? `Tags: ${evacuee.special_needs.join(", ")} (click to view family roster)` : "Click to view family roster"}
                              >
                                <FontAwesomeIcon icon={faUsers} />
                                <span>
                                  {evacuee.member_count} {evacuee.member_count === 1 ? "person" : "people"}
                                </span>
                                {evacuee.checked_in_members > 0 && (
                                  <span className={`checkin-members-here-pill ${isFullyArrived ? "full" : "partial"}`}>
                                    {evacuee.checked_in_members} here
                                  </span>
                                )}
                              </button>
                              {evacuee.special_needs?.length > 0 && (
                                <span
                                  className="checkin-tags-muted-hint"
                                  title={`Special Needs: ${evacuee.special_needs.join(", ")}`}
                                >
                                  +{evacuee.special_needs.length} {evacuee.special_needs.length === 1 ? "tag" : "tags"}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Arrival Status */}
                        <td className="col-status">
                          <div className="checkin-status-cell">
                            {isFullyArrived ? (
                              <span
                                className="checkin-status-badge checkin-status-badge--available"
                                title={evacuee.checked_in_at ? `Arrival: ${evacuee.checked_in_at_formatted || evacuee.checked_in_at}` : undefined}
                              >
                                <span className="checkin-status-dot" aria-hidden="true" />
                                <span>Arrived</span>
                              </span>
                            ) : isPartiallyArrived ? (
                              <span className="checkin-status-badge checkin-status-badge--near-full">
                                <span className="checkin-status-dot" aria-hidden="true" />
                                <span>{evacuee.checked_in_members} of {evacuee.member_count} Here</span>
                              </span>
                            ) : (
                              <span className="checkin-status-badge checkin-status-badge--unmapped">
                                <span className="checkin-status-dot" aria-hidden="true" />
                                <span>Pending</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Action Buttons (Sticky right) */}
                        <td className="col-action">
                          <div className="checkin-action-group">
                            {isHistorical ? (
                              <button
                                type="button"
                                className="checkin-action-btn btn-view-roster"
                                onClick={() => handleOpenMemberModal(evacuee)}
                                title="View archived arrival details and family roster"
                                aria-label={`View roster for ${evacuee.head_name}`}
                              >
                                <FontAwesomeIcon icon={faListCheck} />
                                <span>View Roster</span>
                              </button>
                            ) : isFullyArrived ? (
                              <>
                                <button
                                  type="button"
                                  className="checkin-action-btn btn-undo"
                                  onClick={() => handleQuickUndo(evacuee)}
                                  disabled={isRowLoading}
                                  title="Undo check-in for this household"
                                  aria-label={`Undo check-in for ${evacuee.head_name}`}
                                >
                                  {isRowLoading ? (
                                    <FontAwesomeIcon icon={faSpinner} spin />
                                  ) : (
                                    <FontAwesomeIcon icon={faRotateLeft} />
                                  )}
                                  <span>Undo</span>
                                </button>
                                <button
                                  type="button"
                                  className="checkin-action-btn btn-icon-only"
                                  onClick={() => handleOpenMemberModal(evacuee)}
                                  title="Manage individual member presence"
                                  aria-label="Manage individual members"
                                >
                                  <FontAwesomeIcon icon={faListCheck} />
                                </button>
                              </>
                            ) : isPartiallyArrived ? (
                              <>
                                <button
                                  type="button"
                                  className="checkin-action-btn btn-manage"
                                  onClick={() => handleOpenMemberModal(evacuee)}
                                  disabled={isRowLoading}
                                  title="Manage or check in remaining family members"
                                  aria-label={`Manage members for ${evacuee.head_name}`}
                                >
                                  <FontAwesomeIcon icon={faListCheck} />
                                  <span>Manage ({evacuee.checked_in_members}/{evacuee.member_count})</span>
                                </button>
                                <button
                                  type="button"
                                  className="checkin-action-btn btn-icon-only green"
                                  onClick={() => handleQuickCheckInAll(evacuee)}
                                  disabled={isRowLoading || !canCheckIn}
                                  title={getCheckInDisabledReason(evacuee) || "Mark all remaining members arrived"}
                                  aria-label="Mark all arrived"
                                >
                                  <FontAwesomeIcon icon={faCheck} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={`checkin-action-btn btn-arrive ${!canCheckIn ? "is-disabled" : ""}`}
                                  onClick={() => handleQuickCheckInAll(evacuee)}
                                  disabled={isRowLoading || !canCheckIn}
                                  title={getCheckInDisabledReason(evacuee) || "Mark all members of this household as arrived"}
                                  aria-label={`Check in all for ${evacuee.head_name}`}
                                >
                                  {isRowLoading ? (
                                    <FontAwesomeIcon icon={faSpinner} spin />
                                  ) : (
                                    <FontAwesomeIcon icon={faCheck} />
                                  )}
                                  <span>Mark All Arrived</span>
                                </button>
                                <button
                                  type="button"
                                  className="checkin-action-btn btn-icon-only"
                                  onClick={() => handleOpenMemberModal(evacuee)}
                                  title="Check in specific family members only"
                                  aria-label="Check in specific members"
                                >
                                  <FontAwesomeIcon icon={faListCheck} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Compact Cards View (Visible on viewports <= 768px) */}
            <div className="checkin-mobile-cards-wrap">
              {paginatedEvacuees.map((evacuee) => {
                const isRowLoading = actionLoadingId === evacuee.family_id;
                const state = evacuee.checkin_state || "none";
                const isFullyArrived = state === "full";
                const isPartiallyArrived = state === "partial";
                const rowMenuKey = `${evacuee.family_id}-${evacuee.center_id}`;
                const isMenuOpen = openMobileRowMenuId === rowMenuKey;
                const mobileShelterLine = formatMobileShelterLine(evacuee);

                return (
                  <article
                    key={`mob-${rowMenuKey}`}
                    className="checkin-mobile-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setOpenMobileRowMenuId(null);
                      handleOpenMemberModal(evacuee);
                    }}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setOpenMobileRowMenuId(null);
                        handleOpenMemberModal(evacuee);
                      }
                    }}
                  >
                    {/* Row 1: Head Name + Status Pill + Three-Dot Menu */}
                    <div className="checkin-mobile-card-line1">
                      <div className="checkin-mobile-name-wrap">
                        <span className="checkin-user-name">{evacuee.head_name}</span>
                      </div>

                      <div
                        className="checkin-mobile-right-controls checkin-mobile-menu-anchor"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isFullyArrived ? (
                          <span className="checkin-status-badge checkin-status-badge--available">
                            <span className="checkin-status-dot" aria-hidden="true" />
                            <span>Arrived</span>
                          </span>
                        ) : isPartiallyArrived ? (
                          <span className="checkin-status-badge checkin-status-badge--near-full">
                            <span className="checkin-status-dot" aria-hidden="true" />
                            <span>{evacuee.checked_in_members}/{evacuee.member_count} Here</span>
                          </span>
                        ) : (
                          <span className="checkin-status-badge checkin-status-badge--unmapped">
                            <span className="checkin-status-dot" aria-hidden="true" />
                            <span>Pending</span>
                          </span>
                        )}

                        <button
                          type="button"
                          className="checkin-mobile-kebab-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpMenuOpen(false);
                            setBannerMenuOpen(false);
                            setOpenMobileRowMenuId((prev) => (prev === rowMenuKey ? null : rowMenuKey));
                          }}
                          aria-label={`Actions for ${evacuee.head_name}`}
                          aria-expanded={isMenuOpen}
                          aria-haspopup="menu"
                        >
                          {isRowLoading ? (
                            <FontAwesomeIcon icon={faSpinner} spin />
                          ) : (
                            <FontAwesomeIcon icon={faEllipsisVertical} />
                          )}
                        </button>

                        {isMenuOpen && (
                          <div
                            className="checkin-mobile-row-dropdown"
                            role="menu"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isHistorical ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="checkin-mobile-row-menu-item"
                                onClick={() => {
                                  setOpenMobileRowMenuId(null);
                                  handleOpenMemberModal(evacuee);
                                }}
                              >
                                <FontAwesomeIcon icon={faListCheck} />
                                <span>View Roster</span>
                              </button>
                            ) : (
                              <>
                                {!isFullyArrived && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="checkin-mobile-row-menu-item is-primary"
                                    disabled={isRowLoading || !canCheckIn}
                                    title={getCheckInDisabledReason(evacuee) || undefined}
                                    onClick={() => {
                                      setOpenMobileRowMenuId(null);
                                      handleQuickCheckInAll(evacuee);
                                    }}
                                  >
                                    <FontAwesomeIcon icon={faCheck} />
                                    <span>Mark All Arrived</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="checkin-mobile-row-menu-item"
                                  onClick={() => {
                                    setOpenMobileRowMenuId(null);
                                    handleOpenMemberModal(evacuee);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faListCheck} />
                                  <span>
                                    {isPartiallyArrived
                                      ? `Manage (${evacuee.checked_in_members}/${evacuee.member_count})`
                                      : "Manage"}
                                  </span>
                                </button>
                                {(isFullyArrived || isPartiallyArrived) && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="checkin-mobile-row-menu-item is-danger"
                                    disabled={isRowLoading}
                                    onClick={() => {
                                      setOpenMobileRowMenuId(null);
                                      handleQuickUndo(evacuee);
                                    }}
                                  >
                                    <FontAwesomeIcon icon={faRotateLeft} />
                                    <span>Undo</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Barangay & Member Count */}
                    <div className="checkin-mobile-card-line2">
                      {evacuee.barangay_name && (
                        <>
                          <span>{evacuee.barangay_name}</span>
                          <span className="checkin-sep">·</span>
                        </>
                      )}
                      <span>
                        {evacuee.member_count} {evacuee.member_count === 1 ? "person" : "people"}
                      </span>
                    </div>

                    {/* Row 3: Shelter & Room */}
                    {mobileShelterLine && (
                      <div className="checkin-mobile-card-line3">
                        {mobileShelterLine}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Pagination Controls Bar */}
            {totalCount > 0 && (
              <footer className="checkin-pagination-bar" aria-label="Evacuee list pagination">
                <div className="checkin-pagination-info">
                  <span className="checkin-hide-mobile">
                    Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of{" "}
                    <strong>{totalCount}</strong>
                  </span>
                  <span className="checkin-show-mobile">
                    {startIndex + 1}-{endIndex} of {totalCount}
                  </span>
                </div>

                <div className="checkin-pagination-actions">
                  <div className="checkin-pagesize-wrap">
                    <span className="checkin-pagesize-label">Rows:</span>
                    <select
                      className="checkin-pagesize-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      aria-label="Select number of evacuee rows per page"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <nav className="checkin-page-nav" aria-label="Page navigation">
                    <button
                      type="button"
                      className="checkin-page-btn nav-text-btn"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      aria-label="Go to previous page"
                    >
                      <FontAwesomeIcon icon={faChevronLeft} />
                      <span>Previous</span>
                    </button>

                    <span className="checkin-mobile-page-indicator checkin-show-mobile">
                      Page {safeCurrentPage} of {totalPages}
                    </span>

                    {totalPages > 1 && (
                      <div className="checkin-page-numbers">
                        {getPageNumbers().map((item, idx) =>
                          item === "..." ? (
                            <span key={`dots-${idx}`} className="checkin-page-dots" aria-hidden="true">
                              …
                            </span>
                          ) : (
                            <button
                              key={`page-${item}`}
                              type="button"
                              className={`checkin-page-btn ${item === safeCurrentPage ? "active" : ""}`}
                              onClick={() => setCurrentPage(item)}
                              aria-current={item === safeCurrentPage ? "page" : undefined}
                              aria-label={`Page ${item}`}
                            >
                              {item}
                            </button>
                          )
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      className="checkin-page-btn nav-text-btn"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Go to next page"
                    >
                      <span>Next</span>
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                  </nav>
                </div>
              </footer>
            )}
          </>
        )}
      </section>

      {/* Member Checklist Modal (For Partial / Individual Arrival) */}
      {modalFamily && (
        <div
          className="checkin-modal-backdrop"
          onClick={() => setModalFamily(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-modal-title"
        >
          <div
            className="checkin-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Sheet Handle */}
            <div className="checkin-modal-mobile-handle" aria-hidden="true" />

            {/* Modal Header */}
            <div className="checkin-modal-header">
              <div className="checkin-modal-titles">
                <span className="checkin-modal-tag">Household Arrival Checklist</span>
                <h2 id="member-modal-title">{modalFamily.head_name}</h2>
                <span className="checkin-modal-sub">
                  {modalFamily.family_code ? `Code: ${modalFamily.family_code} · ` : ""}
                  {modalFamily.center_name}
                  {modalFamily.room_number ? ` · Room ${modalFamily.room_number}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="checkin-modal-close"
                onClick={() => setModalFamily(null)}
                aria-label="Close modal"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {/* Quick Select Bar */}
            <div className="checkin-modal-controls">
              <div className="checkin-modal-summary-text">
                <strong>{selectedMemberIds.size}</strong> of{" "}
                <strong>{modalFamily.members?.length || modalFamily.member_count}</strong> members {isHistorical ? "arrived during event" : "present"}
              </div>
              {!isHistorical && (
                <div className="checkin-modal-quick-btns">
                  <button
                    type="button"
                    className="checkin-modal-quick-btn"
                    onClick={handleSelectAllMembers}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="checkin-modal-quick-btn"
                    onClick={handleClearAllMembers}
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {/* Member List */}
            <div className="checkin-modal-member-list">
              {modalFamily.members && modalFamily.members.length > 0 ? (
                modalFamily.members.map((member) => {
                  const isChecked = selectedMemberIds.has(member.id);

                  return (
                    <label
                      key={member.id}
                      className={`checkin-modal-member-row ${isChecked ? "is-selected" : ""} ${isHistorical ? "is-readonly" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="checkin-modal-checkbox"
                        checked={isChecked}
                        disabled={isHistorical}
                        onChange={() => !isHistorical && handleToggleMember(member.id)}
                      />
                      <div className="checkin-modal-member-info">
                        <div className="checkin-modal-member-name-row">
                          <span className="checkin-modal-member-name">{member.name}</span>
                          {member.is_head && (
                            <span className="checkin-modal-head-tag">Head</span>
                          )}
                          <span className="checkin-modal-rel-tag">{member.relationship}</span>
                        </div>

                        {member.special_needs?.length > 0 && (
                          <div className="checkin-modal-needs-row">
                            {member.special_needs.map((flag) => (
                              <span key={flag} className="checkin-special-chip">
                                {flag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="checkin-modal-member-status">
                        {isChecked ? (
                          <span className="checkin-modal-status-text present">
                            <FontAwesomeIcon icon={faCheck} />
                            <span>Present</span>
                          </span>
                        ) : (
                          <span className="checkin-modal-status-text absent">
                            <span>{isHistorical ? "Did Not Arrive" : "Not Here"}</span>
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })
              ) : (
                <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                  No individual member records found.
                </div>
              )}
            </div>

            {/* Modal Warning Notice if Check-In Disabled */}
            {!canCheckIn && !isHistorical && (
              <div className="checkin-modal-warning-bar">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <span>{getCheckInDisabledReason(modalFamily)}</span>
              </div>
            )}
            {isHistorical && (
              <div className="checkin-modal-warning-bar is-archive">
                <FontAwesomeIcon icon={faBoxArchive} />
                <span>Viewing archived disaster record. Records are preserved as read-only.</span>
              </div>
            )}

            {/* Modal Footer */}
            <div className="checkin-modal-footer">
              {isHistorical ? (
                <button
                  type="button"
                  className="checkin-modal-btn is-secondary"
                  onClick={() => setModalFamily(null)}
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="checkin-modal-btn is-secondary"
                    onClick={() => setModalFamily(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="checkin-modal-btn is-primary"
                    onClick={handleSaveModalCheckIn}
                    disabled={actionLoadingId === modalFamily.family_id || (!canCheckIn && selectedMemberIds.size > 0)}
                    title={!canCheckIn && selectedMemberIds.size > 0 ? getCheckInDisabledReason(modalFamily) : undefined}
                  >
                    {actionLoadingId === modalFamily.family_id ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin />
                        <span>Saving...</span>
                      </>
                    ) : selectedMemberIds.size === 0 ? (
                      <span>Mark All Absent (Undo)</span>
                    ) : selectedMemberIds.size === (modalFamily.members?.length || modalFamily.member_count) ? (
                      <span>Confirm All ({selectedMemberIds.size} Present)</span>
                    ) : (
                      <span>Confirm Partial ({selectedMemberIds.size} Present)</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manage Evacuation Operation Modal */}
      {showManageOpModal && (
        <div
          className="checkin-modal-backdrop"
          onClick={() => !savingSchedule && setShowManageOpModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-op-modal-title"
        >
          <div
            className="checkin-modal-card checkin-op-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="checkin-modal-header">
              <div className="checkin-modal-title-wrap">
                <FontAwesomeIcon icon={faGear} className="checkin-op-header-icon" />
                <div>
                  <h3 id="manage-op-modal-title" className="checkin-op-modal-title">
                    Manage Operation
                  </h3>
                  <span className="checkin-op-modal-sub">
                    Update active event name, scope, status, or conclude to archive
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="checkin-modal-close"
                onClick={() => setShowManageOpModal(false)}
                disabled={savingSchedule}
                aria-label="Close Manage Operation modal"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {pendingOpConfirm === "manage-conclude" ? (
              <div className="checkin-op-form">
                <div className="checkin-modal-body checkin-op-confirm-body">
                  <div className="checkin-op-confirm-box is-archive">
                    <FontAwesomeIcon icon={faBoxArchive} />
                    <div>
                      <strong>Conclude &amp; Save to Archive?</strong>
                      <p>
                        Concluding &ldquo;{scheduleEventName.trim()}&rdquo; pauses check-ins and saves current records into historical archives.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="checkin-modal-footer">
                  <button
                    type="button"
                    className="checkin-modal-btn is-secondary"
                    onClick={() => setPendingOpConfirm(null)}
                    disabled={savingSchedule}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="checkin-modal-btn is-primary"
                    onClick={() => handleSaveOperation("manage", true)}
                    disabled={savingSchedule}
                  >
                    {savingSchedule && <FontAwesomeIcon icon={faSpinner} spin />}
                    <span>{savingSchedule ? "Saving..." : "Confirm Conclude & Archive"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <form
                noValidate
                className="checkin-op-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveOperation("manage", false);
                }}
              >
                <div className="checkin-modal-body checkin-op-modal-body">
                  <div className="checkin-form-group">
                    <label htmlFor="manage-op-name" className="checkin-form-label">
                      Operation / Event Name <span className="checkin-required-star">*</span>
                    </label>
                    <input
                      id="manage-op-name"
                      type="text"
                      className={`checkin-form-input ${scheduleEventNameError ? "has-error" : ""}`}
                      placeholder="e.g. Pre-emptive Evacuation"
                      value={scheduleEventName}
                      onChange={(e) => {
                        setScheduleEventName(e.target.value);
                        if (scheduleEventNameError && e.target.value.trim()) {
                          setScheduleEventNameError("");
                        }
                      }}
                      disabled={savingSchedule}
                    />
                    {scheduleEventNameError && (
                      <p className="checkin-field-error" role="alert">
                        {scheduleEventNameError}
                      </p>
                    )}
                  </div>

                  <div className="checkin-form-group">
                    <label htmlFor="manage-op-scope" className="checkin-form-label">
                      Target Shelter Scope
                    </label>
                    <select
                      id="manage-op-scope"
                      className="checkin-form-input"
                      value={scheduleCenterId}
                      onChange={(e) => setScheduleCenterId(e.target.value)}
                      disabled={savingSchedule}
                    >
                      <option value="all">
                        All Evacuation Centers ({centers.length} facilities)
                      </option>
                      {centers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="checkin-form-group">
                    <label className="checkin-form-label">Operational Status</label>
                    <div
                      className="checkin-status-segmented"
                      role="radiogroup"
                      aria-label="Operational Status"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={scheduleStatus === "open"}
                        className={`checkin-segment-btn is-open ${scheduleStatus === "open" ? "is-active" : ""}`}
                        onClick={() => setScheduleStatus("open")}
                        disabled={savingSchedule}
                      >
                        <span className="checkin-seg-dot open" />
                        <span>Open</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={scheduleStatus === "standby"}
                        className={`checkin-segment-btn is-standby ${scheduleStatus === "standby" ? "is-active" : ""}`}
                        onClick={() => setScheduleStatus("standby")}
                        disabled={savingSchedule}
                      >
                        <span className="checkin-seg-dot standby" />
                        <span>Standby</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={scheduleStatus === "closed"}
                        className={`checkin-segment-btn is-closed ${scheduleStatus === "closed" ? "is-active" : ""}`}
                        onClick={() => setScheduleStatus("closed")}
                        disabled={savingSchedule}
                        aria-label="Conclude & Save to Archive"
                      >
                        <span className="checkin-seg-dot closed" />
                        <span>Conclude &amp; Archive</span>
                      </button>
                    </div>
                  </div>

                  {scheduleStatus !== "closed" ? (
                    <div className="checkin-window-compact">
                      <div className="checkin-window-col">
                        <label className="checkin-form-label-sm">Opening Date &amp; Time</label>
                        <div className="checkin-date-time-pair">
                          <input
                            type="date"
                            className="checkin-form-input"
                            value={scheduleOpenDate}
                            onChange={(e) => {
                              setScheduleOpenDate(e.target.value);
                              if (!scheduleCutoffDate || scheduleCutoffDate < e.target.value) {
                                setScheduleCutoffDate(e.target.value);
                              }
                            }}
                            disabled={savingSchedule}
                          />
                          <input
                            type="time"
                            className="checkin-form-input checkin-time-input"
                            value={scheduleOpenTime}
                            onChange={(e) => setScheduleOpenTime(e.target.value)}
                            disabled={savingSchedule}
                          />
                        </div>
                      </div>

                      <div className="checkin-window-col">
                        <label className="checkin-form-label-sm">Expected Target (Advisory)</label>
                        <div className="checkin-date-time-pair">
                          <input
                            type="date"
                            className="checkin-form-input"
                            value={scheduleCutoffDate}
                            onChange={(e) => setScheduleCutoffDate(e.target.value)}
                            disabled={savingSchedule}
                          />
                          <input
                            type="time"
                            className="checkin-form-input checkin-time-input"
                            value={scheduleCutoffTime}
                            onChange={(e) => setScheduleCutoffTime(e.target.value)}
                            disabled={savingSchedule}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="checkin-op-short-notice is-archive">
                      <FontAwesomeIcon icon={faBoxArchive} />
                      <span>Shelters will stand down and records will be saved to history.</span>
                    </div>
                  )}
                </div>

                <div className="checkin-modal-footer">
                  <button
                    type="button"
                    className="checkin-modal-btn is-secondary"
                    onClick={() => setShowManageOpModal(false)}
                    disabled={savingSchedule}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="checkin-modal-btn is-primary"
                    disabled={savingSchedule}
                  >
                    {savingSchedule && <FontAwesomeIcon icon={faSpinner} spin />}
                    <span>
                      {savingSchedule
                        ? "Saving..."
                        : scheduleStatus === "closed"
                          ? "Conclude & Save to Archive"
                          : "Save Changes"}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Start New Evacuation Operation Modal */}
      {showNewOpModal && (
        <div
          className="checkin-modal-backdrop"
          onClick={() => !savingSchedule && setShowNewOpModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-op-modal-title"
        >
          <div
            className="checkin-modal-card checkin-op-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="checkin-modal-header">
              <div className="checkin-modal-title-wrap">
                <FontAwesomeIcon icon={faBolt} className="checkin-op-header-icon" />
                <div>
                  <h3 id="new-op-modal-title" className="checkin-op-modal-title">
                    New Operation
                  </h3>
                  <span className="checkin-op-modal-sub">
                    Begin a fresh evacuation operation for a new event
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="checkin-modal-close"
                onClick={() => setShowNewOpModal(false)}
                disabled={savingSchedule}
                aria-label="Close New Operation modal"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {pendingOpConfirm === "new-operation" ? (
              <div className="checkin-op-form">
                <div className="checkin-modal-body checkin-op-confirm-body">
                  <div className="checkin-op-confirm-box is-new">
                    <FontAwesomeIcon icon={faBolt} />
                    <div>
                      <strong>Start New Operation?</strong>
                      <p>
                        &ldquo;{effectiveSchedule?.evacuation_event_name || "Current Operation"}&rdquo; will be archived and all shelter check-ins will reset to 0 arrived for &ldquo;{scheduleEventName.trim()}&rdquo;.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="checkin-modal-footer">
                  <button
                    type="button"
                    className="checkin-modal-btn is-secondary"
                    onClick={() => setPendingOpConfirm(null)}
                    disabled={savingSchedule}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="checkin-modal-btn is-primary"
                    onClick={() => handleSaveOperation("new", true)}
                    disabled={savingSchedule}
                  >
                    {savingSchedule && <FontAwesomeIcon icon={faSpinner} spin />}
                    <span>{savingSchedule ? "Starting..." : "Confirm Start Operation"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <form
                noValidate
                className="checkin-op-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveOperation("new", false);
                }}
              >
                <div className="checkin-modal-body checkin-op-modal-body">
                  <div className="checkin-op-short-notice is-new">
                    <FontAwesomeIcon icon={faBoxArchive} />
                    <span>Archives the current event and resets check-ins to 0 arrived.</span>
                  </div>

                  <div className="checkin-form-group">
                    <label htmlFor="new-op-name" className="checkin-form-label">
                      Operation / Event Name <span className="checkin-required-star">*</span>
                    </label>
                    <input
                      id="new-op-name"
                      type="text"
                      className={`checkin-form-input ${scheduleEventNameError ? "has-error" : ""}`}
                      placeholder="e.g. Typhoon Kristine Evacuation"
                      value={scheduleEventName}
                      onChange={(e) => {
                        setScheduleEventName(e.target.value);
                        if (scheduleEventNameError && e.target.value.trim()) {
                          setScheduleEventNameError("");
                        }
                      }}
                      disabled={savingSchedule}
                    />
                    {scheduleEventNameError && (
                      <p className="checkin-field-error" role="alert">
                        {scheduleEventNameError}
                      </p>
                    )}
                  </div>

                  <div className="checkin-form-group">
                    <label htmlFor="new-op-scope" className="checkin-form-label">
                      Target Shelter Scope
                    </label>
                    <select
                      id="new-op-scope"
                      className="checkin-form-input"
                      value={scheduleCenterId}
                      onChange={(e) => setScheduleCenterId(e.target.value)}
                      disabled={savingSchedule}
                    >
                      <option value="all">
                        All Evacuation Centers ({centers.length} facilities)
                      </option>
                      {centers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="checkin-form-group">
                    <label className="checkin-form-label">Initial Status</label>
                    <div
                      className="checkin-status-segmented is-two"
                      role="radiogroup"
                      aria-label="Initial Status"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={scheduleStatus === "open"}
                        className={`checkin-segment-btn is-open ${scheduleStatus === "open" ? "is-active" : ""}`}
                        onClick={() => setScheduleStatus("open")}
                        disabled={savingSchedule}
                      >
                        <span className="checkin-seg-dot open" />
                        <span>Open</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={scheduleStatus === "standby"}
                        className={`checkin-segment-btn is-standby ${scheduleStatus === "standby" ? "is-active" : ""}`}
                        onClick={() => setScheduleStatus("standby")}
                        disabled={savingSchedule}
                      >
                        <span className="checkin-seg-dot standby" />
                        <span>Standby</span>
                      </button>
                    </div>
                  </div>

                  <div className="checkin-window-compact">
                    <div className="checkin-window-col">
                      <label className="checkin-form-label-sm">Opening Date &amp; Time</label>
                      <div className="checkin-date-time-pair">
                        <input
                          type="date"
                          className="checkin-form-input"
                          value={scheduleOpenDate}
                          onChange={(e) => {
                            setScheduleOpenDate(e.target.value);
                            if (!scheduleCutoffDate || scheduleCutoffDate < e.target.value) {
                              setScheduleCutoffDate(e.target.value);
                            }
                          }}
                          disabled={savingSchedule}
                        />
                        <input
                          type="time"
                          className="checkin-form-input checkin-time-input"
                          value={scheduleOpenTime}
                          onChange={(e) => setScheduleOpenTime(e.target.value)}
                          disabled={savingSchedule}
                        />
                      </div>
                    </div>

                    <div className="checkin-window-col">
                      <label className="checkin-form-label-sm">Expected Target (Optional)</label>
                      <div className="checkin-date-time-pair">
                        <input
                          type="date"
                          className="checkin-form-input"
                          value={scheduleCutoffDate}
                          onChange={(e) => setScheduleCutoffDate(e.target.value)}
                          disabled={savingSchedule}
                        />
                        <input
                          type="time"
                          className="checkin-form-input checkin-time-input"
                          value={scheduleCutoffTime}
                          onChange={(e) => setScheduleCutoffTime(e.target.value)}
                          disabled={savingSchedule}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="checkin-modal-footer">
                  <button
                    type="button"
                    className="checkin-modal-btn is-secondary"
                    onClick={() => setShowNewOpModal(false)}
                    disabled={savingSchedule}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="checkin-modal-btn is-primary"
                    disabled={savingSchedule}
                  >
                    {savingSchedule && <FontAwesomeIcon icon={faSpinner} spin />}
                    <span>{savingSchedule ? "Starting..." : "Start New Operation"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Quick Extension Modal */}
      {showExtendModal && (
        <div className="checkin-modal-backdrop" onClick={() => !extendingSchedule && setShowExtendModal(false)}>
          <div className="checkin-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="checkin-modal-header">
              <div className="checkin-modal-title-wrap">
                <FontAwesomeIcon icon={faClock} style={{ color: "var(--brand, #2563eb)", fontSize: "18px" }} />
                <h3>Extend Evacuation Arrival Window</h3>
              </div>
              <button
                type="button"
                className="checkin-modal-close"
                onClick={() => setShowExtendModal(false)}
                disabled={extendingSchedule}
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="checkin-modal-body" style={{ padding: "18px 22px" }}>
              <p style={{ fontSize: "13px", color: "var(--muted, #64748b)", margin: "0 0 16px" }}>
                Prolong the allowed arrival window for evacuees. Once extended, check-in controls will immediately reactivate so staff can continue recording arrivals.
              </p>

              <div className="checkin-form-group">
                <label className="checkin-form-label">Extension Duration</label>
                <div className="checkin-preset-btns">
                  {[2, 4, 8, 24].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      className={`checkin-preset-btn ${extendHoursOption === hrs ? "is-active" : ""}`}
                      onClick={() => setExtendHoursOption(hrs)}
                    >
                      +{hrs} Hours {hrs === 24 ? "(+1 Day)" : ""}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`checkin-preset-btn ${extendHoursOption === "custom" ? "is-active" : ""}`}
                    onClick={() => {
                      setExtendHoursOption("custom");
                      if (!customExtendDate) {
                        setCustomExtendDate(effectiveSchedule?.evacuation_cutoff_date || new Date().toISOString().split("T")[0]);
                      }
                    }}
                  >
                    Custom Date & Time
                  </button>
                </div>
              </div>

              {extendHoursOption === "custom" && (
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "10px", marginTop: "12px" }}>
                  <div className="checkin-form-group">
                    <label className="checkin-form-label">New Cutoff Date</label>
                    <input
                      type="date"
                      className="checkin-form-input"
                      value={customExtendDate}
                      onChange={(e) => setCustomExtendDate(e.target.value)}
                    />
                  </div>
                  <div className="checkin-form-group">
                    <label className="checkin-form-label">New Cutoff Time</label>
                    <input
                      type="time"
                      className="checkin-form-input"
                      value={customExtendTime}
                      onChange={(e) => setCustomExtendTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="checkin-modal-footer" style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  className="checkin-modal-btn is-secondary"
                  onClick={() => setShowExtendModal(false)}
                  disabled={extendingSchedule}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="checkin-modal-btn is-primary"
                  onClick={() => handleExtendSchedule()}
                  disabled={extendingSchedule}
                >
                  {extendingSchedule && <FontAwesomeIcon icon={faSpinner} spin style={{ marginRight: "6px" }} />}
                  {extendingSchedule ? "Extending Deadline..." : "Confirm Extension"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Shelter Filter Bottom Sheet */}
      {filterSheetOpen && (
        <div
          className="checkin-filter-sheet-backdrop"
          onClick={() => setFilterSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkin-filter-sheet-title"
        >
          <div
            className="checkin-filter-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="checkin-filter-sheet-handle" aria-hidden="true" />

            <div className="checkin-filter-sheet-header">
              <h2 id="checkin-filter-sheet-title">Filter by Shelter</h2>
              <button
                type="button"
                className="checkin-modal-close-btn"
                onClick={() => setFilterSheetOpen(false)}
                aria-label="Close shelter filter"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="checkin-filter-sheet-list" role="listbox" aria-label="Evacuation centers">
              <button
                type="button"
                role="option"
                aria-selected={draftCenterId === "all"}
                className={`checkin-filter-sheet-option ${draftCenterId === "all" ? "is-selected" : ""}`}
                onClick={() => setDraftCenterId("all")}
              >
                <span className="checkin-filter-sheet-option-main">
                  <span className="checkin-filter-sheet-option-name">All Shelters</span>
                  <span className="checkin-filter-sheet-option-count">({centers.length})</span>
                </span>
                {draftCenterId === "all" && (
                  <FontAwesomeIcon icon={faCheck} className="checkin-filter-sheet-check" />
                )}
              </button>

              {centers.map((c) => {
                const isSelected = String(draftCenterId) === String(c.id);
                return (
                  <button
                    key={`sheet-center-${c.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`checkin-filter-sheet-option ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setDraftCenterId(String(c.id))}
                  >
                    <span className="checkin-filter-sheet-option-main">
                      <span className="checkin-filter-sheet-option-name">{c.name}</span>
                      <span className="checkin-filter-sheet-option-count">
                        ({c.checked_in}/{c.assigned})
                      </span>
                    </span>
                    {isSelected && (
                      <FontAwesomeIcon icon={faCheck} className="checkin-filter-sheet-check" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="checkin-filter-sheet-footer">
              <button
                type="button"
                className="checkin-filter-sheet-btn is-reset"
                onClick={() => {
                  setDraftCenterId("all");
                  setSelectedCenterId("all");
                  setCurrentPage(1);
                  setFilterSheetOpen(false);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="checkin-filter-sheet-btn is-apply"
                onClick={() => {
                  setSelectedCenterId(draftCenterId);
                  setCurrentPage(1);
                  setFilterSheetOpen(false);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
