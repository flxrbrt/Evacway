import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faArrowRight,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faUserCheck,
  faPersonWalking,
  faDoorOpen,
  faClock,
  faHouseFlag,
  faLifeRing,
  faLocationDot,
  faPeopleGroup,
  faTriangleExclamation,
  faUsers,
  faMapLocationDot,
  faChartPie,
  faShieldHalved,
  faMagnifyingGlass,
  faBell,
  faXmark,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { useQuery } from "@tanstack/react-query";
import {
  queryKeys,
  useDashboardSummary,
  useBarangays,
  useHazardReports,
  useRescueRequests,
} from "../../hooks/useEvacuationQueries";
import LoadingState from "../LoadingState/LoadingState";
import Sidebar from "../Sidebar/Sidebar";
import { useIsMobile } from "../../hooks/useIsMobile";
import "./Dashboard.css";

function decodeVapidKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

async function getOrRegisterServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js");
  }
  if (reg.active) return reg;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(reg), 1500);
    navigator.serviceWorker.ready.then((readyReg) => {
      clearTimeout(timer);
      resolve(readyReg);
    }).catch(() => {
      clearTimeout(timer);
      resolve(reg);
    });
  });
}

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

function percentage(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function formatTimeAgo(dateString) {
  if (!dateString) return "Recently";
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / (1000 * 60));
  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

function getReadinessStatus({
  openRescueCount = 0,
  totalCapacity = 0,
  totalAssignedPeople = 0,
  unassignedFamilies = 0,
  pendingHazardCount = 0,
  pendingArrivalFamilies = 0,
}) {
  const totalRemaining = Math.max(0, totalCapacity - totalAssignedPeople);
  const isCapacityLow = totalCapacity > 0 && totalRemaining / totalCapacity < 0.1;

  if (openRescueCount > 0 || isCapacityLow) {
    const reasons = [];
    if (openRescueCount > 0) {
      reasons.push(`${openRescueCount} open rescue request${openRescueCount > 1 ? "s" : ""}`);
    }
    if (isCapacityLow) {
      const remainingPercent = Math.round((totalRemaining / totalCapacity) * 100);
      reasons.push(`Remaining shelter capacity below 10% (${remainingPercent}%)`);
    }
    return {
      status: "action_needed",
      label: "Critical Action Needed",
      badgeClass: "ds-badge ds-badge--danger",
      dotColor: "bg-red-500",
      barColor: "bg-red-500",
      reason: reasons.join(", "),
    };
  }

  if (unassignedFamilies > 0 || pendingHazardCount > 0 || pendingArrivalFamilies > 0) {
    const reasons = [];
    if (pendingArrivalFamilies > 0) {
      reasons.push(`${formatCount(pendingArrivalFamilies)} family arrival${pendingArrivalFamilies > 1 ? "s" : ""} pending`);
    }
    if (unassignedFamilies > 0) {
      reasons.push(`${formatCount(unassignedFamilies)} unassigned household${unassignedFamilies > 1 ? "s" : ""}`);
    }
    if (pendingHazardCount > 0) {
      reasons.push(`${pendingHazardCount} pending hazard report${pendingHazardCount > 1 ? "s" : ""}`);
    }
    return {
      status: "monitoring",
      label: "Active Monitoring",
      badgeClass: "ds-badge ds-badge--warning",
      dotColor: "bg-amber-500",
      barColor: "bg-amber-500",
      reason: reasons.join(", "),
    };
  }

  return {
    status: "ready",
    label: "All Shelters Ready",
    badgeClass: "ds-badge ds-badge--success",
    dotColor: "bg-emerald-500",
    barColor: "bg-emerald-500",
    reason: "All assigned evacuees verified on site & within headroom",
  };
}

/* -------------------------------------------------------------
   SVG CIRCULAR RADIAL GAUGE
   ------------------------------------------------------------- */
function CircularRadialGauge({ percent = 0, strokeColor = "#10b981", label = "Arrived", size = 104 }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg className="size-full dashboard-donut-ring" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="dashboard-gauge-arc"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="dashboard-mono text-lg font-black text-slate-900 leading-none">
          {clamped}%
        </span>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
          {label}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
   SLICK EXECUTIVE KPI CARD
   ------------------------------------------------------------- */
function ExecutiveKpiCard({
  title,
  value,
  subtext,
  icon,
  isEmergency = false,
  trendText,
  trendType = "neutral",
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 text-left flex flex-col justify-between group cursor-pointer w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 hover:border-slate-300 hover:shadow-2xs transition"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {title}
          </span>
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${
              isEmergency ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"
            }`}
          >
            <FontAwesomeIcon icon={icon} className="text-sm" />
          </span>
        </div>

        <p className="dashboard-mono mt-2 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {formatCount(value)}
        </p>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-500 font-medium whitespace-normal leading-tight">
          {subtext}
        </span>
        {trendText && (
          <span
            className={`dashboard-mono text-[11px] font-semibold shrink-0 px-2 py-0.5 rounded-full ${
              trendType === "danger"
                ? "bg-red-50 text-red-700 border border-red-200"
                : trendType === "warning"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : trendType === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            {trendText}
          </span>
        )}
      </div>
    </button>
  );
}

/* -------------------------------------------------------------
   CENTER ARRIVAL & CAPACITY MATRIX (SIMPLE BARS LIST)
   ------------------------------------------------------------- */
function CenterArrivalList({ centers = [], onSelectCenter, onManageFacilities }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tooltip, setTooltip] = useState(null);

  const handleShowTooltip = (center, element) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const width = 230;
    const height = 48;

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(window.innerWidth - width - 12, left));

    let top = rect.top - height - 8;
    if (top < 10) {
      top = rect.bottom + 8;
    }

    setTooltip({
      center,
      top,
      left,
    });
  };

  const handleHideTooltip = () => {
    setTooltip(null);
  };

  useEffect(() => {
    if (!tooltip) return;
    const handleDismiss = () => setTooltip(null);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);
    return () => {
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [tooltip]);

  const filteredCenters = useMemo(() => {
    let list = Array.isArray(centers) ? centers : [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => (c?.name || "").toLowerCase().includes(q));
    }
    // Sort by occupancy, highest first
    return [...list].sort((a, b) => {
      const diff = (b?.assignedPercent ?? 0) - (a?.assignedPercent ?? 0);
      if (diff !== 0) return diff;
      return (a?.name || "").localeCompare(b?.name || "");
    });
  }, [centers, searchQuery]);

  if (!centers || centers.length === 0) {
    return (
      <section
        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs w-full"
        aria-label="Center Arrival & Capacity Matrix"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faHouseFlag} className="text-blue-600 text-sm" />
              <h2 className="dashboard-heading text-lg font-black text-slate-900 tracking-tight">
                Center Arrival & Capacity Matrix
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-medium">0 centers</span>
          </div>
          {onManageFacilities && (
            <button
              type="button"
              onClick={onManageFacilities}
              className="text-blue-600 hover:text-blue-800 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
            >
              <span>Manage Shelter Facilities</span>
              <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
            </button>
          )}
        </div>
        <div className="py-14 text-center">
          <div className="size-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <FontAwesomeIcon icon={faHouseFlag} className="text-xl" />
          </div>
          <p className="text-sm font-bold text-slate-700">No evacuation centers yet.</p>
        </div>
      </section>
    );
  }

  const getBarFillColor = (percent = 0) => {
    if (percent >= 100) return "bg-blue-600/70";
    return "bg-blue-600/40";
  };

  const getPercentBadge = (percent = 0) => {
    if (percent >= 100) {
      return {
        textColor: "text-red-700",
        hasDot: true,
      };
    }
    if (percent >= 95) {
      return {
        textColor: "text-amber-700",
        hasDot: true,
      };
    }
    return {
      textColor: "text-slate-500",
      hasDot: false,
    };
  };

  return (
    <section
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs w-full"
      aria-label="Center Arrival & Capacity Matrix"
    >
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faHouseFlag} className="text-blue-600 text-sm" />
            <h2 className="dashboard-heading text-lg font-black text-slate-900 tracking-tight">
              Center Arrival & Capacity Matrix
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {centers.length} {centers.length === 1 ? "center" : "centers"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 36px Search input */}
          <div className="relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search center..."
              aria-label="Search center"
              className="w-44 sm:w-56 h-9 pl-8 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white transition"
            />
          </div>

          {/* Manage Shelter Facilities Action */}
          {onManageFacilities && (
            <button
              type="button"
              onClick={onManageFacilities}
              className="text-blue-600 hover:text-blue-800 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <span>Manage Shelter Facilities</span>
              <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
            </button>
          )}
        </div>
      </div>

      {/* List Scroll Area */}
      <div
        tabIndex={0}
        aria-label="Evacuation centers list"
        onScroll={handleHideTooltip}
        className="overflow-y-auto max-h-[400px] sm:max-h-[440px] dashboard-scrollbar rounded-xl border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        {filteredCenters.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm font-medium">
            No centers found.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 bg-white">
            {filteredCenters.map((center) => {
              const percentBadge = getPercentBadge(center.assignedPercent);
              return (
                <div
                  key={center.id}
                  tabIndex={0}
                  role="img"
                  aria-label={`${center.name}: ${center.assignedPercent ?? 0}% assigned (${formatCount(center.checkedInCount)} arrived, ${formatCount(center.assignedCount)} assigned, ${formatCount(center.capacity)} capacity)`}
                  onClick={() => onSelectCenter && onSelectCenter(center.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (onSelectCenter) onSelectCenter(center.id);
                    }
                  }}
                  onMouseEnter={(e) => handleShowTooltip(center, e.currentTarget)}
                  onMouseLeave={handleHideTooltip}
                  onFocus={(e) => handleShowTooltip(center, e.currentTarget)}
                  onBlur={handleHideTooltip}
                  className="py-3.5 px-3.5 cursor-pointer hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-xl transition-colors block w-full text-left"
                >
                  {/* Line 1: Center name on left (medium weight, wrapping to 2 lines if needed, never cut off), percentage assigned at right end in small muted text with dot if near-full/full */}
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-sm text-slate-900 break-words whitespace-normal leading-snug">
                      {center.name}
                    </span>
                    <span
                      className={`text-xs font-medium dashboard-mono shrink-0 text-right inline-flex items-center gap-1.5 ${percentBadge.textColor}`}
                    >
                      {percentBadge.hasDot && (
                        <span
                          className="size-1.5 rounded-full bg-current shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span>{center.assignedPercent ?? 0}%</span>
                    </span>
                  </div>

                  {/* Line 2: One slim 8px bar below the name, full row width, fully rounded, with a light gray track and primary blue fill */}
                  <div className="mt-2 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getBarFillColor(center.assignedPercent)} rounded-full transition-all duration-300`}
                      style={{ width: `${Math.min(100, Math.max(0, center.assignedPercent || 0))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Hover / Focus Tooltip */}
      {tooltip && (
        <div
          role="tooltip"
          className="fixed z-50 pointer-events-none rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-xs text-xs whitespace-nowrap transition-opacity"
          style={{
            top: `${tooltip.top}px`,
            left: `${tooltip.left}px`,
            width: "max-content",
            maxWidth: "280px",
          }}
        >
          <div className="font-bold text-slate-900 truncate">
            {tooltip.center.name}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            <span className="dashboard-mono font-bold text-slate-800">
              {formatCount(tooltip.center.checkedInCount)}
            </span>{" "}
            arrived /{" "}
            <span className="dashboard-mono font-bold text-slate-800">
              {formatCount(tooltip.center.assignedCount)}
            </span>{" "}
            assigned /{" "}
            <span className="dashboard-mono font-bold text-slate-800">
              {formatCount(tooltip.center.capacity)}
            </span>{" "}
            capacity
          </div>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------
   STATUS GROUPING HELPERS
   ------------------------------------------------------------- */
function getHazardStatusGroup(status) {
  const s = String(status || "").toLowerCase().trim();
  if (s === "validated" || s === "active") return "active";
  if (s === "pending") return "pending";
  if (s === "resolved" || s === "cleared" || s === "rejected") return "cleared";
  return "active";
}

function getRescueStatusGroup(status) {
  const s = String(status || "").toLowerCase().trim();
  if (s === "pending" || s === "open") return "open";
  if (s === "acknowledged" || s === "responding" || s === "in_progress") return "in_progress";
  if (s === "resolved" || s === "closed" || s === "cleared") return "resolved";
  return "open";
}

/* -------------------------------------------------------------
   MONOTONE CUBIC SPLINE HELPER (FRITSCH-CARLSON)
   ------------------------------------------------------------- */
function getMonotoneBezierPath(points) {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  if (n === 2) {
    return `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)} L ${points[1][0].toFixed(1)},${points[1][1].toFixed(1)}`;
  }

  const dxs = [];
  const dys = [];
  const deltas = [];

  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    dxs.push(dx);
    dys.push(dy);
    deltas.push(dx !== 0 ? dy / dx : 0);
  }

  const ms = new Array(n).fill(0);
  ms[0] = deltas[0];
  ms[n - 1] = deltas[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      ms[i] = 0;
    } else {
      ms[i] = (deltas[i - 1] + deltas[i]) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (deltas[i] === 0) {
      ms[i] = 0;
      ms[i + 1] = 0;
    } else {
      const alpha = ms[i] / deltas[i];
      const beta = ms[i + 1] / deltas[i];
      if (alpha < 0) ms[i] = 0;
      if (beta < 0) ms[i + 1] = 0;
      const dist2 = alpha * alpha + beta * beta;
      if (dist2 > 9) {
        const tau = 3 / Math.sqrt(dist2);
        ms[i] = tau * alpha * deltas[i];
        ms[i + 1] = tau * beta * deltas[i];
      }
    }
  }

  let path = `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = dxs[i];
    const cp1x = points[i][0] + dx / 3;
    const cp1y = points[i][1] + (ms[i] * dx) / 3;
    const cp2x = points[i + 1][0] - dx / 3;
    const cp2y = points[i + 1][1] - (ms[i + 1] * dx) / 3;
    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${points[i + 1][0].toFixed(1)},${points[i + 1][1].toFixed(1)}`;
  }
  return path;
}

/* -------------------------------------------------------------
   INCIDENT TRENDS LINE GRAPH CARD (CURRENT CALENDAR MONTH)
   ------------------------------------------------------------- */
function IncidentTrendsCard({
  title,
  icon,
  iconColor,
  items = [],
  dateExtractor,
  statusExtractor,
  seriesConfig = [],
  selectedYear,
  selectedMonth,
  monthLabel,
  isCurrentMonth,
  onPrevMonth,
  onNextMonth,
  emptyTitle,
  ariaLabel,
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hiddenSeries, setHiddenSeries] = useState(() => new Set());
  const containerRef = useRef(null);

  const toggleSeries = (key) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 1. Filter items to only the selected month
  const monthItems = useMemo(() => {
    return (items || []).filter((item) => {
      const raw = dateExtractor ? dateExtractor(item) : item?.submitted_at || item?.created_at;
      if (!raw) return false;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [items, dateExtractor, selectedYear, selectedMonth]);

  // 2. Legend totals for the selected month
  const totalCounts = useMemo(() => {
    const counts = {};
    seriesConfig.forEach((s) => {
      counts[s.key] = 0;
    });
    monthItems.forEach((item) => {
      const grp = statusExtractor ? statusExtractor(item.status) : item.status;
      if (counts[grp] !== undefined) {
        counts[grp] += 1;
      }
    });
    return counts;
  }, [monthItems, seriesConfig, statusExtractor]);

  // 3. Days in selected month & counts per day
  const monthMeta = useMemo(() => {
    const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const shortMonthName = new Date(selectedYear, selectedMonth, 1).toLocaleDateString("en-US", {
      month: "short",
    });
    const now = new Date();
    const isThisMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    const todayDay = now.getDate();
    const maxDayWithData = isThisMonth
      ? Math.min(todayDay, totalDays)
      : selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth < now.getMonth())
      ? totalDays
      : 0;

    const list = [];
    for (let d = 1; d <= totalDays; d++) {
      const dayDateObj = new Date(selectedYear, selectedMonth, d);
      const key = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const shortDay = `${shortMonthName} ${d}`;
      const fullDate = dayDateObj.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const counts = {};
      seriesConfig.forEach((s) => {
        counts[s.key] = 0;
      });

      list.push({
        dayNum: d,
        key,
        shortDay,
        fullDate,
        counts,
      });
    }

    monthItems.forEach((item) => {
      const raw = dateExtractor ? dateExtractor(item) : item?.submitted_at || item?.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const dayNum = d.getDate();
        if (dayNum >= 1 && dayNum <= totalDays) {
          const grp = statusExtractor ? statusExtractor(item.status) : item.status;
          if (list[dayNum - 1] && list[dayNum - 1].counts[grp] !== undefined) {
            list[dayNum - 1].counts[grp] += 1;
          }
        }
      }
    });

    return {
      daysList: list,
      totalDays,
      maxDayWithData,
    };
  }, [selectedYear, selectedMonth, monthItems, dateExtractor, statusExtractor, seriesConfig]);

  const { daysList, totalDays, maxDayWithData } = monthMeta;
  const passedDays = daysList.slice(0, maxDayWithData);

  // SVG dimensions
  const vbWidth = 500;
  const vbHeight = 220;
  const padLeft = 32;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 32;

  const plotW = vbWidth - padLeft - padRight;
  const plotH = vbHeight - padTop - padBottom;
  const baseY = padTop + plotH;

  const activeSeries = seriesConfig.filter((s) => !hiddenSeries.has(s.key));
  const maxVal = Math.max(
    ...passedDays.flatMap((d) => activeSeries.map((s) => d.counts[s.key] || 0)),
    0
  );

  let maxY = 4;
  let yTicks = [0, 1, 2, 3, 4];
  if (maxVal > 4) {
    const step = Math.ceil(maxVal / 4);
    maxY = step * 4;
    yTicks = [0, step, step * 2, step * 3, maxY];
  } else if (maxVal > 0) {
    maxY = Math.max(2, maxVal);
    yTicks = Array.from({ length: maxY + 1 }, (_, i) => i);
  }

  // Calculate points only for passedDays (up to today's date)
  const seriesPoints = {};
  seriesConfig.forEach((s) => {
    seriesPoints[s.key] = passedDays.map((d) => {
      const x = padLeft + ((d.dayNum - 1) / (totalDays - 1)) * plotW;
      const count = d.counts[s.key] || 0;
      const y = maxY > 0 ? baseY - (count / maxY) * plotH : baseY;
      return [x, y];
    });
  });

  const hoveredDay = hoveredIndex != null ? passedDays[hoveredIndex] : null;
  const hoveredX = hoveredDay ? padLeft + ((hoveredDay.dayNum - 1) / (totalDays - 1)) * plotW : null;

  return (
    <section
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs w-full flex flex-col justify-between"
      aria-label={title}
    >
      {/* 2-Row Header */}
      <div className="mb-4 pb-3 border-b border-slate-100 space-y-2.5">
        {/* Row 1: Icon & Title on left (single line, nowrap, never wrapping), Month Switcher on right */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FontAwesomeIcon icon={icon} className={`${iconColor} text-sm shrink-0`} />
            <h2 className="dashboard-heading text-lg font-black text-slate-900 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
              {title}
            </h2>
          </div>

          {/* Month Switcher */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/80 rounded-xl p-0.5 text-xs shrink-0">
            <button
              type="button"
              onClick={onPrevMonth}
              aria-label="Previous month"
              className="size-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="text-[10px]" />
            </button>

            <span className="font-bold text-slate-700 dashboard-mono px-2 select-none whitespace-nowrap text-xs">
              {monthLabel}
            </span>

            <button
              type="button"
              onClick={onNextMonth}
              disabled={isCurrentMonth}
              aria-label="Next month"
              className={`size-7 flex items-center justify-center rounded-lg transition ${
                isCurrentMonth
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              }`}
            >
              <FontAwesomeIcon icon={faChevronRight} className="text-[10px]" />
            </button>
          </div>
        </div>

        {/* Row 2: Legend, left-aligned, in one line, wrapping only on very small screens */}
        <div className="flex items-center gap-2 flex-wrap">
          {seriesConfig.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={!hiddenSeries.has(s.key)}
              onClick={() => toggleSeries(s.key)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-2 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                hiddenSeries.has(s.key) ? "opacity-35 line-through" : "opacity-100 hover:bg-slate-50"
              }`}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-slate-600">{s.label}</span>
              <span className="dashboard-mono font-bold text-slate-900">
                {totalCounts[s.key] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart Body or Empty State */}
      {monthItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[240px] text-center select-none my-auto">
          <div className="size-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2.5">
            <FontAwesomeIcon icon={icon} className="text-lg" />
          </div>
          <p className="text-sm font-bold text-slate-700">{emptyTitle}</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative w-full h-[240px] select-none"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <svg
            role="img"
            aria-label={ariaLabel}
            viewBox={`0 0 ${vbWidth} ${vbHeight}`}
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
          >
            {/* Horizontal gridlines & Y-axis labels starting at 0 with whole numbers */}
            {yTicks.map((tick) => {
              const y = baseY - (tick / maxY) * plotH;
              return (
                <g key={tick}>
                  <line
                    x1={padLeft}
                    x2={padLeft + plotW}
                    y1={y}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize="10"
                    fill="#94a3b8"
                    className="font-medium dashboard-mono"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Lines (thin 2px, monotone interpolation, only up to today's date) */}
            {seriesConfig.map((s) => {
              if (hiddenSeries.has(s.key)) return null;
              const pts = seriesPoints[s.key];
              const pathD = getMonotoneBezierPath(pts);
              return (
                <path
                  key={s.key}
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

            {/* Small dots on data points (only up to today's date) */}
            {seriesConfig.map((s) => {
              if (hiddenSeries.has(s.key)) return null;
              const pts = seriesPoints[s.key];
              return pts.map(([x, y], i) => (
                <circle
                  key={`${s.key}-dot-${i}`}
                  cx={x}
                  cy={y}
                  r={hoveredIndex === i ? 4.5 : 2.5}
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth={hoveredIndex === i ? 2 : 1}
                  className="transition-all duration-150"
                />
              ));
            })}

            {/* X-axis day labels every 5 days: 1, 5, 10, 15, 20, 25, 30 */}
            {daysList.map((d) => {
              const isTick =
                d.dayNum === 1 ||
                d.dayNum === 5 ||
                d.dayNum === 10 ||
                d.dayNum === 15 ||
                d.dayNum === 20 ||
                d.dayNum === 25 ||
                d.dayNum === 30;
              if (!isTick) return null;
              const x = padLeft + ((d.dayNum - 1) / (totalDays - 1)) * plotW;
              return (
                <text
                  key={d.key}
                  x={x}
                  y={baseY + 18}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#94a3b8"
                  className="font-medium dashboard-mono"
                >
                  {d.shortDay}
                </text>
              );
            })}

            {/* Vertical guide line on hover */}
            {hoveredX != null && (
              <line
                x1={hoveredX}
                x2={hoveredX}
                y1={padTop}
                y2={baseY}
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                className="pointer-events-none"
              />
            )}

            {/* Interactive columns for hover detection (only up to today's date) */}
            {passedDays.map((d, i) => {
              const x = padLeft + ((d.dayNum - 1) / (totalDays - 1)) * plotW;
              const colW = plotW / (totalDays - 1);
              return (
                <rect
                  key={`col-${i}`}
                  x={x - colW / 2}
                  y={padTop}
                  width={colW}
                  height={plotH}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onTouchStart={() => setHoveredIndex(i)}
                />
              );
            })}
          </svg>

          {/* Hover Tooltip Card */}
          {hoveredDay != null && hoveredX != null && (
            <div
              role="tooltip"
              className="dashboard-chart-tooltip"
              style={{
                left: `${Math.max(10, Math.min(90, (hoveredX / vbWidth) * 100))}%`,
                top: "10px",
                transform:
                  hoveredX / vbWidth > 0.65
                    ? "translateX(-100%)"
                    : hoveredX / vbWidth < 0.35
                    ? "translateX(0%)"
                    : "translateX(-50%)",
              }}
            >
              <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-1.5 text-xs">
                {hoveredDay.fullDate}
              </div>
              <div className="space-y-1">
                {seriesConfig.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-3 text-slate-600 text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span>{s.label}</span>
                    </span>
                    <span className="dashboard-mono font-bold text-slate-900">
                      {hoveredDay.counts[s.key] || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
/* -------------------------------------------------------------
   MAIN COMPONENT
   ------------------------------------------------------------- */
function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "admin";

  const refreshOptions = {
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  };

  const { stats, isLoading, isFetching, error, refetch: refetchSummary } = useDashboardSummary(isAdmin);
  const { data: barangaysData, refetch: refetchBarangays } = useBarangays(refreshOptions);
  const { data: hazardReportsData, refetch: refetchHazardReports } = useHazardReports("all", refreshOptions);
  const { data: rescueRequestsData, refetch: refetchRescueRequests } = useRescueRequests(refreshOptions);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [barangayMetric, setBarangayMetric] = useState("households");
  const [barangaySearch, setBarangaySearch] = useState("");
  const [activeBarangayPopover, setActiveBarangayPopover] = useState(null);

  // Month Switcher State for Incident Trends (shared across Hazard Reports & Rescue Requests)
  const [trendYearMonth, setTrendYearMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const now = new Date();
  const currentTrendYear = now.getFullYear();
  const currentTrendMonth = now.getMonth();
  const isCurrentTrendMonth =
    trendYearMonth.year === currentTrendYear && trendYearMonth.month === currentTrendMonth;

  const trendMonthLabel = useMemo(() => {
    return new Date(trendYearMonth.year, trendYearMonth.month, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }, [trendYearMonth]);

  const handlePrevTrendMonth = useCallback(() => {
    setTrendYearMonth((prev) => {
      let m = prev.month - 1;
      let y = prev.year;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      return { year: y, month: m };
    });
  }, []);

  const handleNextTrendMonth = useCallback(() => {
    setTrendYearMonth((prev) => {
      const d = new Date();
      if (prev.year === d.getFullYear() && prev.month === d.getMonth()) {
        return prev;
      }
      let m = prev.month + 1;
      let y = prev.year;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      return { year: y, month: m };
    });
  }, []);

  const { data: familiesData } = useQuery({
    queryKey: queryKeys.dashboardFamilies,
    queryFn: () => api.getFamilies({ all: "true" }),
    ...refreshOptions,
  });

  const demographicsByBarangay = useMemo(() => {
    const map = new Map();
    const families = Array.isArray(familiesData?.items) ? familiesData.items : [];

    families.forEach((fam) => {
      const bKey = String(fam.barangay_id ?? fam.barangay ?? "").toLowerCase();
      const bNameKey = String(fam.barangay || "").toLowerCase();

      const updateData = (entry) => {
        entry.households += 1;
        const members = Array.isArray(fam.members) ? fam.members : [];
        entry.residents += members.length || Number(fam.member_count || 1);

        members.forEach((m) => {
          if (m.is_pwd) entry.pwd += 1;
          if (m.is_pregnant) entry.pregnant += 1;
          const age = Number(m.age ?? m.computed_age);
          if (Number.isFinite(age) && age >= 60) entry.senior += 1;
          if (m.is_solo_parent) entry.soloParent += 1;
          if (m.needs_assistance) entry.needsAssistance += 1;
        });
      };

      if (bKey) {
        if (!map.has(bKey)) {
          map.set(bKey, { households: 0, residents: 0, pwd: 0, pregnant: 0, senior: 0, soloParent: 0, needsAssistance: 0 });
        }
        updateData(map.get(bKey));
      }
      if (bNameKey && bNameKey !== bKey) {
        if (!map.has(bNameKey)) {
          map.set(bNameKey, { households: 0, residents: 0, pwd: 0, pregnant: 0, senior: 0, soloParent: 0, needsAssistance: 0 });
        }
        updateData(map.get(bNameKey));
      }
    });

    return map;
  }, [familiesData]);

  const getBarangayDemographics = useCallback((b) => {
    const fromMap =
      demographicsByBarangay.get(String(b.id).toLowerCase()) ||
      demographicsByBarangay.get(String(b.name || "").toLowerCase());
    return {
      households: fromMap?.households ?? Number(b.household_count ?? b.family_count ?? 0),
      residents: fromMap?.residents ?? Number(b.resident_count ?? b.population ?? 0),
      pwd: fromMap?.pwd ?? 0,
      pregnant: fromMap?.pregnant ?? 0,
      senior: fromMap?.senior ?? 0,
      soloParent: fromMap?.soloParent ?? 0,
      needsAssistance: fromMap?.needsAssistance ?? 0,
    };
  }, [demographicsByBarangay]);

  const handleOpenPopover = useCallback((barangay, element) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const popoverWidth = 230;
    const popoverHeight = 220;

    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, left));

    let top;
    if (rect.top > popoverHeight + 16) {
      top = rect.top - popoverHeight - 8;
    } else {
      top = rect.bottom + 8;
    }
    top = Math.max(8, Math.min(window.innerHeight - popoverHeight - 8, top));

    setActiveBarangayPopover({
      barangay,
      demographics: getBarangayDemographics(barangay),
      top,
      left,
    });
  }, [getBarangayDemographics]);

  useEffect(() => {
    if (!activeBarangayPopover) return;
    const handleClose = () => setActiveBarangayPopover(null);
    const handleKeyDown = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeBarangayPopover]);

  const [pushStatus, setPushStatus] = useState("checking");
  const [pushStripDismissed, setPushStripDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("evacway_push_strip_dismissed") === "true";
    } catch {
      return false;
    }
  });
  const [pushActivating, setPushActivating] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushStatus("denied");
      return;
    }
    getOrRegisterServiceWorker().then((reg) => {
      if (!reg) {
        setPushStatus("inactive");
        return;
      }
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) {
          setPushStatus("active");
        } else {
          setPushStatus("inactive");
        }
      }).catch(() => setPushStatus("inactive"));
    }).catch(() => setPushStatus("inactive"));
  }, []);

  const handleActivatePushFromDashboard = useCallback(async () => {
    setPushActivating(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("denied");
        return;
      }
      const reg = await getOrRegisterServiceWorker();
      if (!reg) return;

      const config = await api.getVapidPublicKey();
      if (!config.enabled || !config.public_key) return;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(config.public_key),
        });
      }
      await api.savePushSubscription(sub.toJSON());
      setPushStatus("active");
      setPushSuccess(true);
      setTimeout(() => {
        setPushSuccess(false);
      }, 2500);
    } catch (err) {
      console.warn("Failed to activate push notifications:", err);
    } finally {
      setPushActivating(false);
    }
  }, []);

  async function handleRefreshAll() {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchSummary(),
        refetchBarangays(),
        refetchHazardReports(),
        refetchRescueRequests(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleSectionChange(nextTab, extraParams = {}) {
    if (nextTab === "dashboard") {
      navigate("/dashboard");
      return;
    }
    if (nextTab === "profile") {
      navigate("/profile");
      return;
    }
    if (nextTab === "map") {
      navigate("/admin/map");
      return;
    }
    const path = isAdmin ? "/admin" : "/lgu";
    const query = new URLSearchParams({ tab: nextTab, ...extraParams }).toString();
    navigate(`${path}?${query}`);
  }

  function handleNotificationSelect(notification) {
    const path = isAdmin ? "/admin" : "/lgu";
    let tab = "rescue";
    if (notification.resource_type === "hazard_report") {
      tab = "reports";
    } else if (notification.resource_type === "resident_registration" || notification.resource_type === "resident_account") {
      tab = "registrations";
    }
    const params = new URLSearchParams({
      tab,
      notificationId: String(notification.id),
      resourceType: String(notification.resource_type || ""),
      resourceId: String(notification.resource_id ?? ""),
    });
    navigate(`${path}?${params.toString()}`);
  }

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  // Family Arrival Metrics
  const arrivedFamilies = Number(stats?.arrivedFamilies || 0);
  const partialFamilies = Number(stats?.partialFamilies || 0);
  const totalArrivedFamilies = Number(stats?.totalArrivedFamilies || arrivedFamilies + partialFamilies);
  const assignedFamilies = Number(stats?.assignedFamilies || 0);
  const pendingArrivalFamilies = Number(stats?.pendingArrivalFamilies || Math.max(0, assignedFamilies - totalArrivedFamilies));
  const unassignedFamilies = Number(stats?.unassignedFamilies || 0);
  const totalFamilies = Number(stats?.families || 0);

  // Resident Headcount Arrival Metrics
  const arrivedResidents = Number(stats?.arrivedResidents || 0);
  const assignedResidents = Number(stats?.assignedResidents || 0);
  const pendingResidents = Number(stats?.pendingResidents || Math.max(0, assignedResidents - arrivedResidents));

  // Key Arrival Rates
  const familyArrivalRate = percentage(totalArrivedFamilies, assignedFamilies);
  const residentArrivalRate = percentage(arrivedResidents, assignedResidents);
  const assignedFamiliesRate = percentage(assignedFamilies, totalFamilies);

  // Incidents
  const rescueList = useMemo(() => {
    return Array.isArray(rescueRequestsData) ? rescueRequestsData : [];
  }, [rescueRequestsData]);

  const hazardList = useMemo(() => {
    return Array.isArray(hazardReportsData) ? hazardReportsData : [];
  }, [hazardReportsData]);

  const openRescueCount = useMemo(() => {
    return rescueList.filter((r) => r.status !== "resolved").length;
  }, [rescueList]);

  const pendingHazardCount = useMemo(() => {
    return hazardList.filter((h) => h.status === "pending").length;
  }, [hazardList]);

  // Operational metrics
  const totalCapacity = Number(stats?.totalCapacity || 0);
  const totalRemainingCapacity = Math.max(0, totalCapacity - (stats?.totalOccupiedPeople || 0));
  const remainingPercent = totalCapacity > 0 ? Math.round((totalRemainingCapacity / totalCapacity) * 100) : 0;
  const capacityUsedPercent = totalCapacity > 0 ? Math.min(100, Math.round(((stats?.totalOccupiedPeople || 0) / totalCapacity) * 100)) : 0;

  // Overall readiness status
  const readiness = useMemo(() => {
    return getReadinessStatus({
      openRescueCount,
      totalCapacity,
      totalAssignedPeople: stats?.totalAssignedPeople || 0,
      unassignedFamilies,
      pendingHazardCount,
      pendingArrivalFamilies,
    });
  }, [openRescueCount, totalCapacity, stats, unassignedFamilies, pendingHazardCount, pendingArrivalFamilies]);

  // Center Check-In Map
  const checkInCenterMap = useMemo(() => {
    const map = new Map();
    (stats?.checkInCenters || []).forEach((c) => {
      map.set(String(c.id), c);
    });
    return map;
  }, [stats?.checkInCenters]);

  // Center Occupancy List
  const centersProcessed = useMemo(() => {
    const list = Array.isArray(stats?.centerRooms) ? [...stats.centerRooms] : [];
    return list
      .map((center) => {
        const checkInData = checkInCenterMap.get(String(center.id));
        const capacity = Number(center.capacity || checkInData?.capacity || 0);
        const checkedInCount = Number(checkInData?.checked_in ?? center.occupiedPeople ?? 0);
        const assignedCount = Number(checkInData?.assigned ?? center.assignedPeople ?? 0);
        const occupiedPercent = capacity > 0 ? Math.min(100, Math.round((checkedInCount / capacity) * 100)) : 0;
        const assignedPercent = capacity > 0 ? Math.min(100, Math.round((assignedCount / capacity) * 100)) : 0;
        const arrivalPercent = assignedCount > 0 ? Math.min(100, Math.round((checkedInCount / assignedCount) * 100)) : 0;

        return {
          ...center,
          capacity,
          checkedInCount,
          assignedCount,
          occupiedPercent,
          assignedPercent,
          arrivalPercent,
        };
      })
      .sort((a, b) => b.checkedInCount - a.checkedInCount || b.assignedPercent - a.assignedPercent || a.name.localeCompare(b.name));
  }, [stats, checkInCenterMap]);

  // All Barangays Demographic Data (Ranked & Filterable)
  const allBarangays = useMemo(() => {
    const list = Array.isArray(barangaysData) ? [...barangaysData] : [];
    if (!list.length) return [];
    const metricKey = barangayMetric === "residents" ? "resident_count" : "household_count";
    return list
      .map((b) => ({
        ...b,
        val: Number(b[metricKey] || 0),
      }))
      .sort((a, b) => b.val - a.val || a.name.localeCompare(b.name))
      .map((b, index) => ({
        ...b,
        rank: index + 1,
      }));
  }, [barangaysData, barangayMetric]);

  const filteredBarangays = useMemo(() => {
    if (!barangaySearch.trim()) return allBarangays;
    const q = barangaySearch.trim().toLowerCase();
    return allBarangays.filter((b) => b.name?.toLowerCase().includes(q));
  }, [allBarangays, barangaySearch]);

  const maxBarangayVal = useMemo(() => {
    if (!allBarangays.length) return 1;
    return Math.max(...allBarangays.map((b) => b.val || 0), 1);
  }, [allBarangays]);

  return (
    <div className="dashboard-layout">
      <Sidebar
        tab="dashboard"
        setTab={handleSectionChange}
        user={user}
        logout={logout}
        isMobile={isMobile}
        onSelectNotification={handleNotificationSelect}
        unmappedCentersCount={0}
      />

      <main className="dashboard-content dashboard-page">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-5">
          {/* Push Notification Activation Prompt (Hides once activated) */}
          {(pushStatus === "inactive" || pushSuccess) && !pushStripDismissed && (
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-xs font-semibold transition ${
              pushSuccess
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-blue-50/90 border-blue-200 text-blue-900 shadow-2xs"
            }`}>
              <div className="flex items-center gap-2.5">
                <FontAwesomeIcon
                  icon={pushSuccess ? faCircleCheck : faBell}
                  className={`text-sm ${pushSuccess ? "text-emerald-600" : "text-blue-600 animate-pulse"}`}
                />
                <span>
                  {pushSuccess
                    ? "✓ Push notifications activated! Real-time alerts are now enabled."
                    : "Push notifications are currently inactive on this device. Allow notifications to receive instant alerts for resident accounts and emergency rescues."}
                </span>
              </div>
              {!pushSuccess && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleActivatePushFromDashboard}
                    disabled={pushActivating}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {pushActivating ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin className="text-[11px]" />
                        <span>Activating...</span>
                      </>
                    ) : (
                      <span>Allow & Activate</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPushStripDismissed(true);
                      try { sessionStorage.setItem("evacway_push_strip_dismissed", "true"); } catch {}
                    }}
                    className="p-1.5 text-blue-400 hover:text-blue-700 rounded-lg transition cursor-pointer"
                    title="Dismiss"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 1. EXECUTIVE COMMAND HEADER */}
          <header className="dashboard-card p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <FontAwesomeIcon icon={faClock} className="text-slate-400 text-[11px]" />
                <span>{todayFormatted}</span>
                <span className="text-slate-300">•</span>
                <span className="text-blue-600 font-bold">Sogod Command Center</span>
              </div>
              <h1 className="dashboard-heading mt-1 text-2xl font-black text-slate-900 sm:text-3xl tracking-tight">
                Welcome back, {user?.name || "Officer"}
              </h1>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSectionChange("checkin")}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition shrink-0"
              >
                <FontAwesomeIcon icon={faUserCheck} />
                <span>Evacuee Check-In Desk</span>
              </button>

              <button
                type="button"
                onClick={() => handleSectionChange("map")}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-xs transition shrink-0"
              >
                <FontAwesomeIcon icon={faMapLocationDot} />
                <span>Map Operations</span>
              </button>

              <button
                type="button"
                onClick={handleRefreshAll}
                disabled={isRefreshing}
                title="Sync all metrics now"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs min-w-[96px] shrink-0"
              >
                <FontAwesomeIcon
                  icon={faArrowsRotate}
                  className={`text-slate-500 ${isRefreshing || isFetching ? "fa-spin text-blue-600" : ""}`}
                />
                <span>{isRefreshing || isFetching ? "Syncing..." : "Sync"}</span>
              </button>
            </div>
          </header>

          {/* ERROR ALERT */}
          {error && !isLoading && (
            <div
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800 shadow-xs"
              role="alert"
            >
              <div>
                <p className="font-bold flex items-center gap-2 text-sm">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  Failed to synchronize operational metrics
                </p>
                <p className="mt-1 text-xs text-red-700">{error?.message || String(error)}</p>
              </div>
              <button
                type="button"
                className="shrink-0 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition"
                onClick={handleRefreshAll}
              >
                Retry Sync
              </button>
            </div>
          )}

          {/* MAIN CONTENT AREA */}
          {stats ? (
            <>
              {/* 2. EVACUEE ARRIVAL & SHELTERING COMMAND HERO */}
              <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4" aria-label="Evacuation arrival and sheltering status">
                <div>
                  <h2 className="dashboard-heading text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Evacuee Arrival &amp; Shelter Check-In Status
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500 font-normal leading-relaxed m-0">
                    <span className="dashboard-mono font-medium text-slate-700">
                      {formatCount(totalArrivedFamilies)}
                    </span>{" "}
                    of{" "}
                    <span className="dashboard-mono font-medium text-slate-700">
                      {formatCount(assignedFamilies)}
                    </span>{" "}
                    assigned households have verified safe arrival across evacuation centers
                  </p>
                </div>

                {/* Progress Spectrum Bar */}
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="h-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${familyArrivalRate}%` }}
                      title={`Arrived: ${formatCount(totalArrivedFamilies)} families`}
                    />
                    <div
                      className="h-full bg-slate-200 transition-all duration-500"
                      style={{ width: `${Math.max(0, 100 - familyArrivalRate)}%` }}
                      title={`Pending: ${formatCount(pendingArrivalFamilies)} families`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>{formatCount(totalArrivedFamilies)} arrived</span>
                    <span>{formatCount(pendingArrivalFamilies)} pending</span>
                  </div>
                </div>
              </section>

              {/* 3. EXECUTIVE KPI METRICS (4 Actionable Command Tiles) */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" aria-label="Executive KPI tiles">
                {/* 1. Emergency Alerts & Incidents */}
                <ExecutiveKpiCard
                  title="Emergency Alerts"
                  value={openRescueCount + pendingHazardCount}
                  subtext={`${openRescueCount} rescues · ${pendingHazardCount} hazards`}
                  icon={faLifeRing}
                  isEmergency={true}
                  trendText={openRescueCount > 0 ? "Needs Rescue" : pendingHazardCount > 0 ? "Needs Review" : "All Clear"}
                  trendType={openRescueCount > 0 ? "danger" : pendingHazardCount > 0 ? "warning" : "success"}
                  onClick={() => handleSectionChange(openRescueCount > 0 ? "rescue" : "reports")}
                />

                {/* 2. Pending Arrival (En Route) */}
                <ExecutiveKpiCard
                  title="Pending Arrival"
                  value={pendingArrivalFamilies}
                  subtext={`${formatCount(pendingResidents)} residents`}
                  icon={faPersonWalking}
                  trendText={pendingArrivalFamilies > 0 ? "Awaiting Intake" : "None Pending"}
                  trendType={pendingArrivalFamilies > 0 ? "warning" : "success"}
                  onClick={() => handleSectionChange("checkin")}
                />

                {/* 3. Verified Arrived Families */}
                <ExecutiveKpiCard
                  title="Families Arrived"
                  value={totalArrivedFamilies}
                  subtext={`${formatCount(arrivedResidents)} residents on-site`}
                  icon={faUserCheck}
                  trendText={`${familyArrivalRate}% arrived`}
                  trendType={familyArrivalRate >= 70 ? "success" : "warning"}
                  onClick={() => handleSectionChange("checkin")}
                />

                {/* 4. Available Headroom */}
                <ExecutiveKpiCard
                  title="Available Headroom"
                  value={totalRemainingCapacity}
                  subtext={`of ${formatCount(totalCapacity)} capacity`}
                  icon={faDoorOpen}
                  trendText={`${remainingPercent}% free`}
                  trendType={remainingPercent < 15 ? "danger" : "success"}
                  onClick={() => handleSectionChange("centers")}
                />
              </section>

              {/* 4. CENTER ARRIVAL & CAPACITY MATRIX (Full-Width Simple Bars List) */}
              <CenterArrivalList
                centers={centersProcessed}
                onSelectCenter={(centerId) => handleSectionChange("checkin", { center_id: centerId })}
                onManageFacilities={() => handleSectionChange("centers")}
              />

              {/* 5. HAZARD REPORTS & RESCUE REQUESTS TRENDS (Side by Side) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
                <IncidentTrendsCard
                  title="Hazard Reports"
                  icon={faTriangleExclamation}
                  iconColor="text-amber-500"
                  items={hazardList}
                  dateExtractor={(item) => item?.submitted_at || item?.created_at}
                  statusExtractor={getHazardStatusGroup}
                  seriesConfig={[
                    { key: "active", label: "Active", color: "#ef4444" },
                    { key: "pending", label: "Pending", color: "#f59e0b" },
                    { key: "cleared", label: "Cleared", color: "#10b981" },
                  ]}
                  selectedYear={trendYearMonth.year}
                  selectedMonth={trendYearMonth.month}
                  monthLabel={trendMonthLabel}
                  isCurrentMonth={isCurrentTrendMonth}
                  onPrevMonth={handlePrevTrendMonth}
                  onNextMonth={handleNextTrendMonth}
                  emptyTitle="No reports yet"
                  ariaLabel="Hazard reports monthly trend line graph showing active, pending, and cleared reports"
                />

                <IncidentTrendsCard
                  title="Rescue Requests"
                  icon={faLifeRing}
                  iconColor="text-blue-600"
                  items={rescueList}
                  dateExtractor={(item) => item?.created_at || item?.submitted_at}
                  statusExtractor={getRescueStatusGroup}
                  seriesConfig={[
                    { key: "open", label: "Open", color: "#ef4444" },
                    { key: "in_progress", label: "In Progress", color: "#2563eb" },
                    { key: "resolved", label: "Resolved", color: "#10b981" },
                  ]}
                  selectedYear={trendYearMonth.year}
                  selectedMonth={trendYearMonth.month}
                  monthLabel={trendMonthLabel}
                  isCurrentMonth={isCurrentTrendMonth}
                  onPrevMonth={handlePrevTrendMonth}
                  onNextMonth={handleNextTrendMonth}
                  emptyTitle="No requests yet"
                  ariaLabel="Rescue requests monthly trend line graph showing open, in progress, and resolved requests"
                />
              </div>

              {/* 6. DEMOGRAPHICS BY BARANGAY COMPARATIVE ANALYTICS (ALL BARANGAYS) */}
              <section className="dashboard-card p-5 sm:p-6" aria-label="Demographic distribution">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faLocationDot} className="text-blue-600 text-sm" />
                      <h2 className="dashboard-heading text-lg font-black text-slate-900 tracking-tight">
                        Demographics & Evacuee Density by Barangay
                      </h2>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Live Search input */}
                    <div className="relative">
                      <FontAwesomeIcon
                        icon={faMagnifyingGlass}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"
                      />
                      <input
                        type="text"
                        value={barangaySearch}
                        onChange={(e) => setBarangaySearch(e.target.value)}
                        placeholder="Search barangay..."
                        className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white w-40 sm:w-48 transition"
                      />
                    </div>

                    {/* Metric Switch */}
                    <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/60 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setBarangayMetric("households")}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                          barangayMetric === "households"
                            ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Households
                      </button>
                      <button
                        type="button"
                        onClick={() => setBarangayMetric("residents")}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                          barangayMetric === "residents"
                            ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Residents
                      </button>
                    </div>
                  </div>
                </div>

                {filteredBarangays.length > 0 ? (
                  <div className="dashboard-scrollbar max-h-[520px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredBarangays.map((barangay) => {
                        const barWidth = Math.round((barangay.val / maxBarangayVal) * 100);

                        return (
                          <div
                            key={barangay.id || barangay.rank}
                            tabIndex={0}
                            role="button"
                            aria-label={`View demographic breakdown for ${barangay.name}`}
                            onMouseEnter={(e) => handleOpenPopover(barangay, e.currentTarget)}
                            onMouseLeave={() => setActiveBarangayPopover(null)}
                            onFocus={(e) => handleOpenPopover(barangay, e.currentTarget)}
                            onBlur={() => setActiveBarangayPopover(null)}
                            onClick={(e) => {
                              if (activeBarangayPopover?.barangay?.id === barangay.id) {
                                setActiveBarangayPopover(null);
                              } else {
                                handleOpenPopover(barangay, e.currentTarget);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleOpenPopover(barangay, e.currentTarget);
                              }
                            }}
                            className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50/90 hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-300 transition cursor-pointer"
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                              <span className="flex items-center gap-2 truncate">
                                <span className="dashboard-mono size-5 rounded-md bg-white border border-slate-200 grid place-items-center text-[10px] text-slate-600 font-black shrink-0">
                                  #{barangay.rank}
                                </span>
                                <span className="truncate" title={barangay.name}>{barangay.name}</span>
                              </span>
                              <span className="dashboard-mono text-slate-900 shrink-0 font-extrabold ml-1">
                                {formatCount(barangay.val)}{" "}
                                <span className="font-normal text-[10px] text-slate-400">
                                  {barangayMetric === "residents" ? "residents" : "households"}
                                </span>
                              </span>
                            </div>

                            <div className="mt-2 h-2 w-full rounded-full bg-slate-200/70 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-linear-to-r from-blue-600 to-indigo-600 transition-all duration-500"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-xs text-slate-500 font-medium">
                    {barangaySearch ? `No barangays found matching "${barangaySearch}".` : "No barangay census records registered yet."}
                  </p>
                )}

                {/* Floating Demographics Breakdown Popover */}
                {activeBarangayPopover && (
                  <div
                    role="tooltip"
                    className="dashboard-demographics-popover"
                    style={{
                      top: `${activeBarangayPopover.top}px`,
                      left: `${activeBarangayPopover.left}px`,
                    }}
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <span className="font-extrabold text-slate-900 text-xs truncate">
                        {activeBarangayPopover.barangay.name}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 dashboard-mono">
                        #{activeBarangayPopover.barangay.rank}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Total Households</span>
                        <span className="dashboard-mono font-bold text-slate-900">
                          {formatCount(activeBarangayPopover.demographics.households)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Total Residents</span>
                        <span className="dashboard-mono font-bold text-slate-900">
                          {formatCount(activeBarangayPopover.demographics.residents)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>PWD</span>
                        <span className="dashboard-mono font-bold text-slate-900">
                          {formatCount(activeBarangayPopover.demographics.pwd)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Pregnant</span>
                        <span className="dashboard-mono font-bold text-slate-900">
                          {formatCount(activeBarangayPopover.demographics.pregnant)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Senior</span>
                        <span className="dashboard-mono font-bold text-slate-900">
                          {formatCount(activeBarangayPopover.demographics.senior)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Solo Parent</span>
                        <span className="dashboard-mono font-bold text-slate-900">
                          {formatCount(activeBarangayPopover.demographics.soloParent)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Needs Assistance</span>
                        <span className="dashboard-mono font-bold text-slate-900">
                          {formatCount(activeBarangayPopover.demographics.needsAssistance)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {isAdmin && (
                  <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      <span>
                        LGU Personnel System:{" "}
                        <strong className="text-slate-800 font-bold">
                          {formatCount(stats.activeStaff)} active
                        </strong>{" "}
                        of {formatCount(stats.totalStaff)} total staff accounts
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSectionChange("users")}
                      className="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center gap-1.5 transition"
                    >
                      <span>Manage Personnel Accounts</span>
                      <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs my-6">
              <div className="size-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-xl" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Operational Metrics Unavailable</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md">
                {error?.message || "Could not retrieve live dashboard analytics. Please verify connectivity and retry."}
              </p>
              <button
                type="button"
                onClick={handleRefreshAll}
                className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition shadow-xs"
              >
                Retry Loading
              </button>
            </div>
          ) : (
            <div className="dashboard-loading-wrap">
              <LoadingState message="Loading command analytics…" size="lg" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
