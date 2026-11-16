import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faCube,
  faWheelchair,
  faPlus,
  faPenToSquare,
  faTrash,
  faMagnifyingGlass,
  faRotate,
  faCircleNotch,
  faXmark,
  faTriangleExclamation,
  faEllipsisVertical,
  faDoorOpen,
  faDrawPolygon,
  faChevronLeft,
  faChevronRight,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { api } from "../../services/api";

const PAGE_SIZE = 10;

const TABLES = {
  center_types: {
    key: "center_types",
    title: "Center Types",
    singular: "Center Type",
    addLabel: "Add Center Type",
    icon: faBuilding,
    getter: api.getCenterTypes,
    creator: api.createCenterType,
    updater: api.updateCenterType,
    deleter: api.deleteCenterType,
  },
  building_materials: {
    key: "building_materials",
    title: "Building Materials",
    singular: "Building Material",
    addLabel: "Add Building Material",
    icon: faCube,
    getter: api.getBuildingMaterials,
    creator: api.createBuildingMaterial,
    updater: api.updateBuildingMaterial,
    deleter: api.deleteBuildingMaterial,
  },
  amenities: {
    key: "amenities",
    title: "Amenities & Facilities",
    singular: "Amenity",
    addLabel: "Add Amenity",
    icon: faWheelchair,
    getter: api.getAmenities,
    creator: api.createAmenity,
    updater: api.updateAmenity,
    deleter: api.deleteAmenity,
  },
};

const STRUCTURE_OPTIONS = [
  {
    value: "open_area",
    label: "Open area (no rooms)",
    shortLabel: "Open area",
    description: "One open space without rooms or buildings (e.g., gym or covered court).",
    icon: faDrawPolygon,
  },
  {
    value: "rooms_only",
    label: "Rooms only",
    shortLabel: "Rooms only",
    description: "Single building or house divided directly into rooms.",
    icon: faDoorOpen,
  },
  {
    value: "buildings_and_rooms",
    label: "Buildings and rooms",
    shortLabel: "Buildings & rooms",
    description: "Multiple buildings with rooms grouped inside each building.",
    icon: faBuilding,
  },
];

const STRUCTURE_BY_VALUE = Object.fromEntries(
  STRUCTURE_OPTIONS.map((opt) => [opt.value, opt])
);

function slugifyCode(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getStructureOption(value, fallbackCode = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (STRUCTURE_BY_VALUE[normalized]) return STRUCTURE_BY_VALUE[normalized];
  const code = String(fallbackCode || "").trim().toLowerCase();
  if (code === "single_venue") return STRUCTURE_BY_VALUE.open_area;
  if (code === "private_property") return STRUCTURE_BY_VALUE.rooms_only;
  return STRUCTURE_BY_VALUE.buildings_and_rooms;
}

export default function ShelterMetadataTab({ onNotify }) {
  const [activeTab, setActiveTab] = useState("center_types");
  const [data, setData] = useState({
    center_types: [],
    building_materials: [],
    amenities: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [togglingId, setTogglingId] = useState(null);

  // Three-dot action menu (portal)
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);
  const tableScrollRef = useRef(null);

  // Add / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    structure_mode: "",
    is_active: true,
  });
  const [codeCustomized, setCodeCustomized] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [confirmStructureChange, setConfirmStructureChange] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const tableConfig = TABLES[activeTab];

  const loadAll = useCallback(async () => {
    setRefreshing(true);

    try {
      const [cts, mats, ams] = await Promise.all([
        api.getCenterTypes(),
        api.getBuildingMaterials(),
        api.getAmenities(),
      ]);
      setData({
        center_types: Array.isArray(cts) ? cts : [],
        building_materials: Array.isArray(mats) ? mats : [],
        amenities: Array.isArray(ams) ? ams : [],
      });
    } catch (err) {
      if (onNotify) onNotify(err.message || "Failed to load shelter metadata", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onNotify]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.getCenterTypes(),
      api.getBuildingMaterials(),
      api.getAmenities(),
    ])
      .then(([cts, mats, ams]) => {
        if (!active) return;
        setData({
          center_types: Array.isArray(cts) ? cts : [],
          building_materials: Array.isArray(mats) ? mats : [],
          amenities: Array.isArray(ams) ? ams : [],
        });
      })
      .catch((err) => {
        if (active && onNotify) {
          onNotify(err.message || "Failed to load shelter metadata", "error");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onNotify]);

  function handleTabSelect(nextTab) {
    setActiveTab(nextTab);
    setPage(1);
    setOpenMenu(null);
  }

  function handleSearchChange(val) {
    setSearchQuery(val);
    setPage(1);
    setOpenMenu(null);
  }

  function handleStatusFilterChange(val) {
    setStatusFilter(val);
    setPage(1);
    setOpenMenu(null);
  }

  const currentItems = useMemo(() => data[activeTab] || [], [data, activeTab]);

  const filteredItems = useMemo(() => {
    let list = [...currentItems];
    if (statusFilter === "active") {
      list = list.filter((item) => item.is_active);
    } else if (statusFilter === "inactive") {
      list = list.filter((item) => !item.is_active);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          (item.name || "").toLowerCase().includes(q) ||
          (item.code || "").toLowerCase().includes(q) ||
          (item.description || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [currentItems, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const showingFrom = filteredItems.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, filteredItems.length);

  // Close three-dot menu on outside click, Escape, scroll, or resize
  useEffect(() => {
    if (!openMenu) return undefined;

    function handleOutside(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (openMenu.triggerEl && openMenu.triggerEl.contains(e.target)) return;
      setOpenMenu(null);
    }
    function handleKey(e) {
      if (e.key === "Escape") {
        const trigger = openMenu.triggerEl;
        setOpenMenu(null);
        trigger?.focus();
      }
    }
    function handleScrollOrResize() {
      setOpenMenu(null);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [openMenu]);

  // Escape key closes Add/Edit or Delete modal
  useEffect(() => {
    if (!modalOpen && !deleteTarget) return undefined;
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      if (deleteTarget && !deleting) {
        setDeleteTarget(null);
        setDeleteError("");
      } else if (modalOpen && !saving) {
        setModalOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, deleteTarget, saving, deleting]);

  function openRowMenu(e, item) {
    e.stopPropagation();
    if (openMenu?.item?.id === item.id) {
      setOpenMenu(null);
      return;
    }
    const triggerEl = e.currentTarget;
    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 92;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 12 && rect.top >= menuHeight + 12;
    const top = openUp ? rect.top - menuHeight - 6 : rect.bottom + 6;
    const left = Math.max(
      12,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)
    );
    setOpenMenu({ item, top, left, openUp, triggerEl });
  }

  function openAddModal() {
    setModalMode("add");
    setEditingItem(null);
    setFormData({
      name: "",
      code: "",
      description: "",
      structure_mode: "",
      is_active: true,
    });
    setCodeCustomized(false);
    setShowCodeEditor(false);
    setConfirmStructureChange(false);
    setFieldErrors({});
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(item) {
    setOpenMenu(null);
    setModalMode("edit");
    setEditingItem(item);
    setFormData({
      name: item.name || "",
      code: item.code || "",
      description: item.description || "",
      structure_mode:
        activeTab === "center_types"
          ? getStructureOption(item.structure_mode, item.code).value
          : "",
      is_active: item.is_active !== false,
    });
    setCodeCustomized(true);
    setShowCodeEditor(false);
    setConfirmStructureChange(false);
    setFieldErrors({});
    setFormError("");
    setModalOpen(true);
  }

  const initialStructure = useMemo(() => {
    if (modalMode !== "edit" || !editingItem || activeTab !== "center_types") return "";
    return getStructureOption(editingItem.structure_mode, editingItem.code).value;
  }, [modalMode, editingItem, activeTab]);

  const inUseCount = Number(editingItem?.in_use_count || 0);
  const structureChangedOnInUseCenterType =
    activeTab === "center_types" &&
    modalMode === "edit" &&
    inUseCount > 0 &&
    Boolean(formData.structure_mode) &&
    formData.structure_mode !== initialStructure;

  const computedAutoCode = slugifyCode(formData.name);
  const effectiveCode = codeCustomized ? slugifyCode(formData.code) : computedAutoCode;

  function clearFieldError(field) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (formError) setFormError("");
  }

  function handleNameChange(val) {
    clearFieldError("name");
    if (!codeCustomized) clearFieldError("code");
    setFormData((prev) => ({
      ...prev,
      name: val,
      code: codeCustomized ? prev.code : slugifyCode(val),
    }));
  }

  function validateForm() {
    const errors = {};
    const trimmedName = formData.name.trim();
    const excludeId = modalMode === "edit" ? editingItem?.id : null;

    if (!trimmedName) {
      errors.name = `${tableConfig.singular} name is required.`;
    } else {
      const duplicateName = currentItems.find(
        (item) =>
          item.id !== excludeId &&
          (item.name || "").trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicateName) {
        errors.name = `${tableConfig.singular} named "${trimmedName}" already exists.`;
      }
    }

    if (!effectiveCode) {
      errors.code = "Enter a valid identifier code (letters or numbers).";
    } else {
      const duplicateCode = currentItems.find(
        (item) =>
          item.id !== excludeId &&
          (item.code || "").trim().toLowerCase() === effectiveCode.toLowerCase()
      );
      if (duplicateCode) {
        errors.code = `Code "${effectiveCode}" is already used by "${duplicateCode.name}".`;
      }
    }

    if (activeTab === "center_types") {
      if (!formData.structure_mode) {
        errors.structure_mode = "Select how centers of this type are structured.";
      } else if (structureChangedOnInUseCenterType && !confirmStructureChange) {
        errors.structure_confirm = `Confirm updating Structure for ${inUseCount} existing center(s).`;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: formData.name.trim(),
        code: effectiveCode,
        description: formData.description.trim(),
        is_active: Boolean(formData.is_active),
        ...(activeTab === "center_types"
          ? { structure_mode: formData.structure_mode }
          : {}),
      };

      if (modalMode === "add") {
        await tableConfig.creator(payload);
        if (onNotify) {
          onNotify(`${tableConfig.singular} "${payload.name}" added.`, "success");
        }
      } else {
        await tableConfig.updater(editingItem.id, payload);
        if (onNotify) {
          onNotify(`${tableConfig.singular} "${payload.name}" updated.`, "success");
        }
      }

      setModalOpen(false);
      await loadAll(true);
    } catch (err) {
      const field = err?.data?.field;
      const msg = err.message || "Failed to save changes.";
      if (field === "name" || field === "code" || field === "structure_mode") {
        setFieldErrors((prev) => ({ ...prev, [field]: msg }));
        if (field === "code") setShowCodeEditor(true);
      } else {
        setFormError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(item) {
    if (togglingId === item.id) return;
    const nextStatus = !item.is_active;
    setTogglingId(item.id);
    try {
      await tableConfig.updater(item.id, { is_active: nextStatus });
      setData((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].map((r) =>
          r.id === item.id ? { ...r, is_active: nextStatus } : r
        ),
      }));
      if (onNotify) {
        onNotify(
          `${tableConfig.singular} "${item.name}" ${nextStatus ? "activated" : "deactivated"}.`,
          "success"
        );
      }
    } catch (err) {
      if (onNotify) onNotify(err.message || "Failed to update status", "error");
    } finally {
      setTogglingId(null);
    }
  }

  function requestDelete(item) {
    setOpenMenu(null);
    setDeleteError("");
    setDeleteTarget(item);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await tableConfig.deleter(deleteTarget.id);
      if (onNotify) {
        onNotify(
          res?.message || `${tableConfig.singular} "${deleteTarget.name}" deleted.`,
          "success"
        );
      }
      setDeleteTarget(null);
      await loadAll(true);
    } catch (err) {
      setDeleteError(
        err.message ||
        `Unable to delete "${deleteTarget.name}".`
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="dm-meta-section">
      {/* Single unified table card */}
      <section className="dm-meta-table-card" aria-label={tableConfig.title}>
        {/* Toolbar: sub-tabs, search, status filter, refresh, Add button */}
        <div className="dm-meta-toolbar">
          <div className="dm-meta-toolbar-top">
            <div className="dm-meta-subtabs" role="tablist" aria-label="Shelter option categories">
              {Object.values(TABLES).map((tbl) => {
                const isActive = activeTab === tbl.key;
                const count = (data[tbl.key] || []).length;
                return (
                  <button
                    key={tbl.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`dm-meta-subtab ${isActive ? "is-active" : ""}`}
                    onClick={() => handleTabSelect(tbl.key)}
                  >
                    <FontAwesomeIcon icon={tbl.icon} className="dm-meta-subtab-icon" />
                    <span>{tbl.title}</span>
                    <span className="dm-meta-subtab-badge">{count}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="dm-btn dm-btn-primary dm-meta-add-btn"
              onClick={openAddModal}
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>{tableConfig.addLabel}</span>
            </button>
          </div>

          <div className="dm-meta-toolbar-filters">
            <div className="dm-search-wrap dm-meta-search-wrap">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="dm-search-icon" />
              <input
                type="text"
                className="dm-search-input"
                placeholder={`Search ${tableConfig.title.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                aria-label={`Search ${tableConfig.title}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="dm-search-clear"
                  onClick={() => handleSearchChange("")}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>

            <div className="dm-meta-filter-right">
              <select
                className="dm-select-filter dm-meta-status-select"
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>

              <button
                type="button"
                className="dm-btn dm-btn-ghost dm-btn-sm dm-meta-refresh-btn"
                onClick={() => loadAll()}
                disabled={refreshing}
                title="Refresh list"
                aria-label="Refresh list"
              >
                <FontAwesomeIcon icon={faRotate} spin={refreshing} />
                <span className="dm-meta-refresh-text">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body (rows only scroll; header stays sticky) */}
        <div className="dm-meta-card-body" ref={tableScrollRef}>
          {loading ? (
            <div className="dm-meta-empty-state">
              <FontAwesomeIcon icon={faCircleNotch} spin style={{ fontSize: "24px", color: "#2563eb" }} />
              <span>Loading {tableConfig.title.toLowerCase()}...</span>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="dm-meta-empty-state">
              <FontAwesomeIcon icon={tableConfig.icon} style={{ fontSize: "28px", opacity: 0.35 }} />
              <strong>No {tableConfig.title.toLowerCase()} found</strong>
              <span>
                {searchQuery || statusFilter !== "all"
                  ? "No items match your current search or filter."
                  : `Add your first ${tableConfig.singular.toLowerCase()} using the button above.`}
              </span>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <table className="dm-table dm-meta-table dm-desktop-table">
                <thead>
                  <tr>
                    <th style={{ width: activeTab === "center_types" ? "26%" : "30%" }}>Name</th>
                    {activeTab === "center_types" && (
                      <th style={{ width: "20%" }}>Structure</th>
                    )}
                    <th style={{ width: activeTab === "center_types" ? "32%" : "46%" }}>Description</th>
                    <th style={{ width: "14%" }}>Status</th>
                    <th style={{ width: "8%", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => {
                    const structureOpt =
                      activeTab === "center_types"
                        ? getStructureOption(item.structure_mode, item.code)
                        : null;
                    const menuOpen = openMenu?.item?.id === item.id;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="dm-meta-name-cell">
                            <span className="dm-meta-name">{item.name}</span>
                            <span className="dm-meta-code-inline" title={item.code}>
                              {item.code}
                            </span>
                          </div>
                        </td>
                        {activeTab === "center_types" && (
                          <td>
                            <span className={`dm-structure-badge is-${structureOpt.value}`}>
                              <FontAwesomeIcon icon={structureOpt.icon} />
                              <span>{structureOpt.shortLabel}</span>
                            </span>
                          </td>
                        )}
                        <td>
                          <div className="dm-meta-desc">
                            {item.description || (
                              <span style={{ color: "#94a3b8" }}>No description</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(item.is_active)}
                            className={`dm-meta-row-toggle ${item.is_active ? "is-active" : "is-inactive"}`}
                            onClick={() => handleToggleStatus(item)}
                            disabled={togglingId === item.id}
                            title={item.is_active ? "Click to deactivate" : "Click to activate"}
                          >
                            <span className="dm-meta-row-toggle-track" aria-hidden="true">
                              <span className="dm-meta-row-toggle-thumb" />
                            </span>
                            <span>{item.is_active ? "Active" : "Inactive"}</span>
                          </button>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className={`dm-meta-kebab-btn ${menuOpen ? "is-open" : ""}`}
                            onClick={(e) => openRowMenu(e, item)}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-label={`Actions for ${item.name}`}
                          >
                            <FontAwesomeIcon icon={faEllipsisVertical} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile Compact Cards (<= 768px) */}
              <div className="dm-meta-mobile-list">
                {paginatedItems.map((item) => {
                  const structureOpt =
                    activeTab === "center_types"
                      ? getStructureOption(item.structure_mode, item.code)
                      : null;
                  const menuOpen = openMenu?.item?.id === item.id;
                  return (
                    <article key={item.id} className="dm-meta-mobile-card">
                      <div className="dm-meta-mobile-card-top">
                        <div className="dm-meta-mobile-card-title-wrap">
                          <span className="dm-meta-name">{item.name}</span>
                          <span className="dm-meta-code-inline">{item.code}</span>
                        </div>
                        <button
                          type="button"
                          className={`dm-meta-kebab-btn ${menuOpen ? "is-open" : ""}`}
                          onClick={(e) => openRowMenu(e, item)}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-label={`Actions for ${item.name}`}
                        >
                          <FontAwesomeIcon icon={faEllipsisVertical} />
                        </button>
                      </div>

                      {item.description && (
                        <p className="dm-meta-mobile-desc">{item.description}</p>
                      )}

                      <div className="dm-meta-mobile-card-footer">
                        {structureOpt ? (
                          <span className={`dm-structure-badge is-${structureOpt.value}`}>
                            <FontAwesomeIcon icon={structureOpt.icon} />
                            <span>{structureOpt.shortLabel}</span>
                          </span>
                        ) : (
                          <span />
                        )}

                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(item.is_active)}
                          className={`dm-meta-row-toggle ${item.is_active ? "is-active" : "is-inactive"}`}
                          onClick={() => handleToggleStatus(item)}
                          disabled={togglingId === item.id}
                        >
                          <span className="dm-meta-row-toggle-track" aria-hidden="true">
                            <span className="dm-meta-row-toggle-thumb" />
                          </span>
                          <span>{item.is_active ? "Active" : "Inactive"}</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Bottom Pagination Bar */}
        <div className="dm-meta-pagination-bar">
          <div className="dm-pagination-info">
            Showing <strong>{showingFrom}–{showingTo}</strong> of{" "}
            <strong>{filteredItems.length}</strong>{" "}
            {tableConfig.title.toLowerCase()}
          </div>
          <div className="dm-pagination-controls">
            <button
              type="button"
              className="dm-pagination-btn"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
            >
              <FontAwesomeIcon icon={faChevronLeft} size="xs" /> Previous
            </button>
            <span className="dm-meta-page-indicator">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              className="dm-pagination-btn"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
            >
              Next <FontAwesomeIcon icon={faChevronRight} size="xs" />
            </button>
          </div>
        </div>
      </section>

      {/* Portal Three-dot Action Menu */}
      {openMenu &&
        createPortal(
          <div
            ref={menuRef}
            className={`dm-meta-menu-portal ${openMenu.openUp ? "is-up" : ""}`}
            role="menu"
            style={{ top: `${openMenu.top}px`, left: `${openMenu.left}px` }}
          >
            <button
              type="button"
              role="menuitem"
              className="dm-meta-menu-item"
              onClick={() => openEditModal(openMenu.item)}
            >
              <FontAwesomeIcon icon={faPenToSquare} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="dm-meta-menu-item is-danger"
              onClick={() => requestDelete(openMenu.item)}
            >
              <FontAwesomeIcon icon={faTrash} />
              <span>Delete</span>
            </button>
          </div>,
          document.body
        )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          className="dm-modal-overlay dm-meta-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setModalOpen(false);
          }}
        >
          <div
            className="dm-modal-card dm-meta-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-meta-modal-title"
          >
            <div className="dm-modal-header">
              <h3 id="dm-meta-modal-title" className="dm-modal-title">
                {modalMode === "add"
                  ? `Add ${tableConfig.singular}`
                  : `Edit ${tableConfig.singular}`}
              </h3>
              <button
                type="button"
                className="dm-modal-close"
                onClick={() => !saving && setModalOpen(false)}
                aria-label="Close modal"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form className="dm-meta-modal-form" onSubmit={handleSave} noValidate>
              <div className="dm-modal-body dm-meta-modal-body">
                {formError && (
                  <div className="dm-meta-inline-alert is-error" role="alert">
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Name + Auto-generated Code */}
                <div className="dm-form-group">
                  <label htmlFor="dm-meta-name-input">
                    Name <span className="dm-req">*</span>
                  </label>
                  <input
                    id="dm-meta-name-input"
                    type="text"
                    autoFocus
                    className={fieldErrors.name ? "is-invalid" : ""}
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={
                      activeTab === "center_types"
                        ? "e.g., Covered Court"
                        : activeTab === "building_materials"
                          ? "e.g., Reinforced Concrete"
                          : "e.g., Wheelchair Ramps"
                    }
                    aria-invalid={Boolean(fieldErrors.name)}
                  />
                  {fieldErrors.name && (
                    <p className="dm-field-error" role="alert">
                      {fieldErrors.name}
                    </p>
                  )}

                  {/* Small generated code line with "Customize code" */}
                  <div className="dm-meta-code-meta">
                    {!showCodeEditor ? (
                      <>
                        <span className="dm-meta-code-preview">
                          Code: <code>{effectiveCode || "auto_generated"}</code>
                        </span>
                        <button
                          type="button"
                          className="dm-meta-customize-code-btn"
                          onClick={() => {
                            setShowCodeEditor(true);
                            if (!codeCustomized) {
                              setFormData((prev) => ({
                                ...prev,
                                code: slugifyCode(prev.name),
                              }));
                            }
                          }}
                        >
                          Customize code
                        </button>
                      </>
                    ) : (
                      <div className="dm-meta-code-editor-box">
                        <div className="dm-meta-code-editor-row">
                          <input
                            type="text"
                            className={`dm-code-input ${fieldErrors.code ? "is-invalid" : ""}`}
                            value={formData.code}
                            onChange={(e) => {
                              clearFieldError("code");
                              setCodeCustomized(true);
                              setFormData((prev) => ({ ...prev, code: e.target.value }));
                            }}
                            placeholder="e.g., covered_court"
                            aria-label="Identifier code"
                            aria-invalid={Boolean(fieldErrors.code)}
                          />
                          {modalMode === "add" && (
                            <button
                              type="button"
                              className="dm-meta-code-link-btn"
                              onClick={() => {
                                clearFieldError("code");
                                setCodeCustomized(false);
                                setShowCodeEditor(false);
                                setFormData((prev) => ({
                                  ...prev,
                                  code: slugifyCode(prev.name),
                                }));
                              }}
                            >
                              Auto
                            </button>
                          )}
                          <button
                            type="button"
                            className="dm-meta-code-link-btn"
                            onClick={() => setShowCodeEditor(false)}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {fieldErrors.code && (
                    <p className="dm-field-error" role="alert">
                      {fieldErrors.code}
                    </p>
                  )}
                </div>

                {/* Structure option cards (Center Types only) */}
                {activeTab === "center_types" && (
                  <div className="dm-form-group">
                    <span className="dm-form-label" id="dm-structure-label">
                      Structure <span className="dm-req">*</span>
                    </span>
                    <div
                      className="dm-structure-options"
                      role="radiogroup"
                      aria-labelledby="dm-structure-label"
                    >
                      {STRUCTURE_OPTIONS.map((opt) => {
                        const selected = formData.structure_mode === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={`dm-structure-card ${selected ? "is-selected" : ""} ${fieldErrors.structure_mode ? "is-invalid" : ""
                              }`}
                            onClick={() => {
                              clearFieldError("structure_mode");
                              clearFieldError("structure_confirm");
                              setConfirmStructureChange(false);
                              setFormData((prev) => ({
                                ...prev,
                                structure_mode: opt.value,
                              }));
                            }}
                          >
                            <div className="dm-structure-card-icon">
                              <FontAwesomeIcon icon={opt.icon} />
                            </div>
                            <div className="dm-structure-card-text">
                              <span className="dm-structure-card-title">{opt.label}</span>
                              <span className="dm-structure-card-desc">{opt.description}</span>
                            </div>
                            <span
                              className={`dm-structure-card-radio ${selected ? "is-selected" : ""}`}
                              aria-hidden="true"
                            >
                              {selected && <FontAwesomeIcon icon={faCheck} size="xs" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {fieldErrors.structure_mode && (
                      <p className="dm-field-error" role="alert">
                        {fieldErrors.structure_mode}
                      </p>
                    )}

                    {/* Warning when changing Structure for existing centers */}
                    {structureChangedOnInUseCenterType && (
                      <div className="dm-structure-warning" role="alert">
                        <div className="dm-structure-warning-head">
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                          <span>
                            <strong>{inUseCount} evacuation center(s)</strong> currently use{" "}
                            <strong>{editingItem?.name}</strong>. Changing Structure updates
                            whether the Structure tab and Building field appear on those centers.
                          </span>
                        </div>
                        <label className="dm-structure-warning-confirm">
                          <input
                            type="checkbox"
                            checked={confirmStructureChange}
                            onChange={(e) => {
                              clearFieldError("structure_confirm");
                              setConfirmStructureChange(e.target.checked);
                            }}
                          />
                          <span>
                            Yes, change Structure for these {inUseCount} existing center(s)
                          </span>
                        </label>
                        {fieldErrors.structure_confirm && (
                          <p className="dm-field-error" role="alert">
                            {fieldErrors.structure_confirm}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                <div className="dm-form-group">
                  <label htmlFor="dm-meta-desc-input">Description</label>
                  <textarea
                    id="dm-meta-desc-input"
                    rows={2}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Optional guidance or notes shown to admins..."
                  />
                </div>

                {/* Status toggle inside modal */}
                <div className="dm-meta-modal-status-row">
                  <div className="dm-meta-modal-status-text">
                    <span className="dm-meta-modal-status-title">Status</span>
                    <span className="dm-meta-modal-status-hint">
                      {formData.is_active
                        ? "Available in evacuation center dropdowns"
                        : "Hidden from new center dropdowns"}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(formData.is_active)}
                    className={`dm-meta-row-toggle ${formData.is_active ? "is-active" : "is-inactive"}`}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, is_active: !prev.is_active }))
                    }
                  >
                    <span className="dm-meta-row-toggle-track" aria-hidden="true">
                      <span className="dm-meta-row-toggle-thumb" />
                    </span>
                    <span>{formData.is_active ? "Active" : "Inactive"}</span>
                  </button>
                </div>
              </div>

              <div className="dm-modal-footer dm-meta-modal-footer">
                <button
                  type="button"
                  className="dm-btn dm-btn-ghost"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dm-btn dm-btn-primary"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} spin /> Saving...
                    </>
                  ) : modalMode === "add" ? (
                    `Add ${tableConfig.singular}`
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="dm-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setDeleteTarget(null);
              setDeleteError("");
            }
          }}
        >
          <div
            className="dm-modal-card dm-meta-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-meta-delete-title"
          >
            <div className="dm-modal-header">
              <h3 id="dm-meta-delete-title" className="dm-modal-title">
                Delete {tableConfig.singular}
              </h3>
              <button
                type="button"
                className="dm-modal-close"
                onClick={() => {
                  if (deleting) return;
                  setDeleteTarget(null);
                  setDeleteError("");
                }}
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="dm-modal-body">
              <p className="dm-meta-delete-copy">
                Are you sure you want to delete <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>?
                This action cannot be undone.
              </p>

              {Number(deleteTarget.in_use_count || 0) > 0 && !deleteError && (
                <div className="dm-meta-inline-alert is-warning" role="status">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <span>
                    This {tableConfig.singular.toLowerCase()} is currently used by{" "}
                    <strong>{deleteTarget.in_use_count}</strong> evacuation center(s) and
                    cannot be deleted until those centers no longer use it.
                  </span>
                </div>
              )}

              {deleteError && (
                <div className="dm-meta-inline-alert is-error" role="alert">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>
            <div className="dm-modal-footer">
              <button
                type="button"
                className="dm-btn dm-btn-ghost"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError("");
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dm-btn dm-btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <FontAwesomeIcon icon={faCircleNotch} spin /> Deleting...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faTrash} /> Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
