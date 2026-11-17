import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faUserCheck,
  faUserSlash,
  faUserShield,
  faEllipsisVertical,
  faPlus,
  faSearch,
  faRotateLeft,
  faXmark,
  faEye,
  faPen,
  faKey,
  faBan,
  faCheck,
  faTriangleExclamation,
  faEnvelope,
  faPhone,
} from "@fortawesome/free-solid-svg-icons";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { queryKeys, useUsers } from "../../hooks/useEvacuationQueries";
import "./UserManagement.css";

const ROLE_LABELS = {
  admin: "Admin",
  lgu_personnel: "LGU Personnel",
};

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

function UserManagement() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const usersQuery = useUsers();
  const users = useMemo(() => usersQuery.data || [], [usersQuery.data]);

  // Filter and search states
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [totalCardSelected, setTotalCardSelected] = useState(false);

  // Dropdown action menu state ({ userId, top, bottom, right, openAbove } | null)
  const [openActionMenu, setOpenActionMenu] = useState(null);

  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalMode, setModalMode] = useState("overview"); // "overview" | "edit"
  const [deactivatingUser, setDeactivatingUser] = useState(null);

  // Form states
  const [form, setForm] = useState({
    name: "",
    email: "",
    contact_number: "",
    role: "lgu_personnel",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    contact_number: "",
    role: "lgu_personnel",
  });

  // Action / error states
  const [actionError, setActionError] = useState("");
  const [formError, setFormError] = useState("");
  const [editError, setEditError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailAvailable, setEmailAvailable] = useState(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  function invalidateUsersAndLogs() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.users }),
      queryClient.invalidateQueries({ queryKey: queryKeys.logs }),
    ]);
  }

  // Count active administrators to protect the last active admin
  const activeAdminCount = useMemo(
    () => users.filter((u) => u.role === "admin" && u.is_active).length,
    [users]
  );

  // Stat calculations
  const totalCount = users.length;
  const activeCount = users.filter((u) => u.is_active).length;
  const inactiveCount = users.filter((u) => !u.is_active).length;
  const adminCount = users.filter((u) => u.role === "admin").length;

  const selectedStatCard = useMemo(() => {
    if (roleFilter === "admin" && !statusFilter) {
      return "admins";
    }
    if (statusFilter === "active" && !roleFilter) {
      return "active";
    }
    if (statusFilter === "inactive" && !roleFilter) {
      return "inactive";
    }
    if (!roleFilter && !statusFilter && totalCardSelected) {
      return "total";
    }
    return null;
  }, [roleFilter, statusFilter, totalCardSelected]);

  // Stat card clicking logic (toggles the filter; clicking selected card clears it)
  function handleStatCardClick(cardKey) {
    if (selectedStatCard === cardKey) {
      setTotalCardSelected(false);
      if (cardKey === "active" || cardKey === "inactive") {
        setStatusFilter("");
      } else if (cardKey === "admins") {
        setRoleFilter("");
      }
      return;
    }

    setTotalCardSelected(cardKey === "total");
    if (cardKey === "total") {
      setRoleFilter("");
      setStatusFilter("");
    } else if (cardKey === "active") {
      setStatusFilter("active");
    } else if (cardKey === "inactive") {
      setStatusFilter("inactive");
    } else if (cardKey === "admins") {
      setRoleFilter("admin");
    }
  }

  const isAnyFilterActive = Boolean(
    searchQuery.trim() || roleFilter || statusFilter || selectedStatCard
  );

  function clearAllFilters() {
    setSearchQuery("");
    setRoleFilter("");
    setStatusFilter("");
    setTotalCardSelected(false);
  }

  // Filtered users list
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return users.filter((u) => {
      // Role filter
      if (roleFilter && u.role !== roleFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === "active" && !u.is_active) {
        return false;
      }
      if (statusFilter === "inactive" && u.is_active) {
        return false;
      }

      // Search filter (name, email, phone)
      if (q) {
        const nameMatch = (u.name || "").toLowerCase().includes(q);
        const emailMatch = (u.email || "").toLowerCase().includes(q);
        const phoneMatch = (u.contact_number || "").toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !phoneMatch) {
          return false;
        }
      }

      return true;
    });
  }, [users, roleFilter, statusFilter, searchQuery]);

  // Click outside / scroll / resize listener for the row action menu
  useEffect(() => {
    if (!openActionMenu) return undefined;
    function handleClickOutside(e) {
      if (
        !e.target.closest(".um-action-cell") &&
        !e.target.closest("[data-um-menu='true']")
      ) {
        setOpenActionMenu(null);
      }
    }
    function handleCloseOnViewportChange() {
      setOpenActionMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("scroll", handleCloseOnViewportChange, true);
    window.addEventListener("resize", handleCloseOnViewportChange);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("scroll", handleCloseOnViewportChange, true);
      window.removeEventListener("resize", handleCloseOnViewportChange);
    };
  }, [openActionMenu]);

  const closeModal = useCallback(() => {
    setShowForm(false);
    setFormError("");
    setEmailError("");
    setEmailAvailable(null);
  }, []);

  const closeUserModal = useCallback(() => {
    setSelectedUser(null);
    setModalMode("overview");
    setEditError("");
  }, []);

  // Global escape key handler to close menus/modals
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (openActionMenu) {
          setOpenActionMenu(null);
        } else if (deactivatingUser) {
          setDeactivatingUser(null);
        } else if (selectedUser) {
          closeUserModal();
        } else if (showForm) {
          closeModal();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openActionMenu, deactivatingUser, selectedUser, showForm, closeUserModal, closeModal]);

  function toggleRowActionMenu(userRecord, triggerEl) {
    setOpenActionMenu((prev) => {
      if (prev?.userId === userRecord.id) return null;
      const rect = triggerEl.getBoundingClientRect();
      const estimatedMenuHeight = 148;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openAbove = spaceBelow < estimatedMenuHeight + 12 && spaceAbove > spaceBelow;
      return {
        userId: userRecord.id,
        right: Math.max(12, window.innerWidth - rect.right),
        top: openAbove ? null : rect.bottom + 4,
        bottom: openAbove ? window.innerHeight - rect.top + 4 : null,
        openAbove,
      };
    });
  }

  // Check if deactivation is disallowed
  function getDeactivateRestriction(targetUser) {
    if (currentUser && String(targetUser.id) === String(currentUser.id)) {
      return {
        isSelf: true,
        disabled: true,
        tooltip: "You cannot deactivate your own account",
      };
    }
    if (
      targetUser.role === "admin" &&
      targetUser.is_active &&
      activeAdminCount <= 1
    ) {
      return {
        isSelf: false,
        disabled: true,
        tooltip: "Cannot deactivate the last active administrator",
      };
    }
    return {
      isSelf: false,
      disabled: false,
      tooltip: "",
    };
  }

  async function confirmDeactivate() {
    if (!deactivatingUser) return;
    setTogglingId(deactivatingUser.id);
    setActionError("");
    try {
      await api.toggleUserActive(deactivatingUser.id);
      setDeactivatingUser(null);
      await invalidateUsersAndLogs();
    } catch (err) {
      setActionError(err?.message || String(err));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleReactivate(targetUser) {
    setTogglingId(targetUser.id);
    setActionError("");
    try {
      await api.toggleUserActive(targetUser.id);
      await invalidateUsersAndLogs();
    } catch (err) {
      setActionError(err?.message || String(err));
    } finally {
      setTogglingId(null);
    }
  }

  async function checkEmailAvailability(value) {
    const email = value.trim().toLowerCase();
    if (!email) {
      setEmailError("");
      setEmailAvailable(null);
      return false;
    }

    setEmailChecking(true);
    try {
      const result = await api.checkUserEmailAvailability(email);
      const exists = Boolean(result.exists);
      setEmailAvailable(!exists);
      setEmailError(exists ? "This email is already registered." : "");
      return !exists;
    } catch (err) {
      setEmailAvailable(null);
      setEmailError(err?.message || String(err) || "Could not verify this email address.");
      return false;
    } finally {
      setEmailChecking(false);
    }
  }

  async function handleResetPassword(targetUser) {
    if (!targetUser || !confirm(`Send password reset email to ${targetUser.name}?`)) return;

    setResettingPassword(true);
    try {
      const result = await api.resetUserPassword(targetUser.id);
      await invalidateUsersAndLogs();
      alert(result.message || `Password setup email sent to ${targetUser.email}.`);
    } catch (err) {
      alert(err?.message || String(err) || "Unable to reset password right now.");
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const email = form.email.trim().toLowerCase();
      const isAvailable = await checkEmailAvailability(email);
      if (!isAvailable) {
        setFormError("Use an email address that is not already registered.");
        return;
      }

      const result = await api.createUser({
        ...form,
        name: form.name.trim(),
        email,
      });
      setForm({
        name: "",
        email: "",
        contact_number: "",
        role: "lgu_personnel",
      });
      setShowForm(false);
      await invalidateUsersAndLogs();
      alert(result.message || `Account setup email sent to ${email}.`);
    } catch (err) {
      setFormError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  function openDetailsModal(user, mode = "overview") {
    setSelectedUser(user);
    setModalMode(mode);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      contact_number: user.contact_number || "",
      role: user.role || "lgu_personnel",
    });
    setEditError("");
  }

  async function handleUpdateUser(event) {
    event.preventDefault();
    if (!selectedUser) return;
    setSavingUser(true);
    setEditError("");
    try {
      const updated = await api.updateUser(selectedUser.id, {
        ...editForm,
        name: editForm.name.trim(),
        email: editForm.email.trim().toLowerCase(),
        contact_number: editForm.contact_number.trim(),
      });
      setSelectedUser(updated);
      setModalMode("overview");
      await invalidateUsersAndLogs();
    } catch (requestError) {
      setEditError(
        requestError?.message ||
          String(requestError) ||
          "Account details could not be updated."
      );
    } finally {
      setSavingUser(false);
    }
  }

  const displayError = usersQuery.error || actionError;
  const activeMenuUser = openActionMenu
    ? filteredUsers.find((u) => u.id === openActionMenu.userId) || null
    : null;
  const activeMenuRestriction = activeMenuUser ? getDeactivateRestriction(activeMenuUser) : null;

  return (
    <div className="um-page">
      <div className="um-root">
        {/* PAGE HEADER */}
        <div className="um-header">
          <div className="um-header-copy">
            <h1 className="um-title">Users</h1>
            <p className="um-subtitle">
              Manage LGU personnel and administrator accounts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="um-add-btn"
            aria-label="Add new user account"
          >
            <FontAwesomeIcon icon={faPlus} className="um-add-icon" />
            <span>Add User</span>
          </button>
        </div>

        {/* ERROR BANNER */}
        {displayError && (
          <div className="um-error-banner" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span>{displayError.message || String(displayError)}</span>
          </div>
        )}

        {/* 1. STAT CARDS: CLICKABLE FILTERS */}
        <section className="stat-card-grid cols-4" aria-label="User account filters">
          <button
            type="button"
            className={`stat-card is-clickable is-neutral ${selectedStatCard === "total" ? "is-selected" : ""}`}
            onClick={() => handleStatCardClick("total")}
            aria-pressed={selectedStatCard === "total"}
            title="Filter by all accounts"
          >
            <div className="stat-card-content">
              <span className="stat-card-label">Total</span>
              <strong className="stat-card-value">{totalCount}</strong>
              <span className="stat-card-hint">All user accounts</span>
            </div>
            <span className="stat-card-icon stat-card-icon--neutral" aria-hidden="true">
              <FontAwesomeIcon icon={faUsers} />
            </span>
          </button>

          <button
            type="button"
            className={`stat-card is-clickable is-resolved ${selectedStatCard === "active" ? "is-selected" : ""}`}
            onClick={() => handleStatCardClick("active")}
            aria-pressed={selectedStatCard === "active"}
            title="Filter by active accounts"
          >
            <div className="stat-card-content">
              <span className="stat-card-label">Active</span>
              <strong className="stat-card-value">{activeCount}</strong>
              <span className="stat-card-hint">Active user accounts</span>
            </div>
            <span className="stat-card-icon stat-card-icon--resolved" aria-hidden="true">
              <FontAwesomeIcon icon={faUserCheck} />
            </span>
          </button>

          <button
            type="button"
            className={`stat-card is-clickable is-closed ${selectedStatCard === "inactive" ? "is-selected" : ""}`}
            onClick={() => handleStatCardClick("inactive")}
            aria-pressed={selectedStatCard === "inactive"}
            title="Filter by inactive accounts"
          >
            <div className="stat-card-content">
              <span className="stat-card-label">Inactive</span>
              <strong className="stat-card-value">{inactiveCount}</strong>
              <span className="stat-card-hint">Inactive user accounts</span>
            </div>
            <span className="stat-card-icon stat-card-icon--closed" aria-hidden="true">
              <FontAwesomeIcon icon={faUserSlash} />
            </span>
          </button>

          <button
            type="button"
            className={`stat-card is-clickable is-pending ${selectedStatCard === "admins" ? "is-selected" : ""}`}
            onClick={() => handleStatCardClick("admins")}
            aria-pressed={selectedStatCard === "admins"}
            title="Filter by administrator accounts"
          >
            <div className="stat-card-content">
              <span className="stat-card-label">Admins</span>
              <strong className="stat-card-value">{adminCount}</strong>
              <span className="stat-card-hint">Administrator accounts</span>
            </div>
            <span className="stat-card-icon stat-card-icon--pending" aria-hidden="true">
              <FontAwesomeIcon icon={faUserShield} />
            </span>
          </button>
        </section>

        {/* 2. FILTERS TOOLBAR WITH LABELS & CLEAR BUTTON */}
        <div className="um-toolbar">
          <div className="um-filter-control um-filter-control--search">
            <label htmlFor="um-search-input" className="um-control-label">
              Search users
            </label>
            <div className="um-search-wrap">
              <FontAwesomeIcon icon={faSearch} className="um-search-icon" aria-hidden="true" />
              <input
                id="um-search-input"
                type="search"
                placeholder="Search by name, email, or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="um-input um-search-input"
              />
            </div>
          </div>

          <div className="um-filter-control">
            <label htmlFor="um-role-select" className="um-control-label">
              Role
            </label>
            <select
              id="um-role-select"
              value={roleFilter}
              onChange={(e) => {
                setTotalCardSelected(false);
                setRoleFilter(e.target.value);
              }}
              className="um-input um-select-filter"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="lgu_personnel">LGU Personnel</option>
            </select>
          </div>

          <div className="um-filter-control">
            <label htmlFor="um-status-select" className="um-control-label">
              Status
            </label>
            <select
              id="um-status-select"
              value={statusFilter}
              onChange={(e) => {
                setTotalCardSelected(false);
                setStatusFilter(e.target.value);
              }}
              className="um-input um-select-filter"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {isAnyFilterActive && (
            <div className="um-filter-clear-wrap">
              <button
                type="button"
                onClick={clearAllFilters}
                className="um-clear-btn"
                aria-label="Clear all active filters"
              >
                <FontAwesomeIcon icon={faRotateLeft} />
                <span>Clear filters</span>
              </button>
            </div>
          )}
        </div>

        {/* RESULT COUNT */}
        <div className="um-result-bar">
          <span className="um-result-count">
            {isAnyFilterActive ? (
              <>Showing <strong>{filteredUsers.length}</strong> of {totalCount} users</>
            ) : (
              <><strong>{filteredUsers.length}</strong> {filteredUsers.length === 1 ? "user" : "users"} registered</>
            )}
          </span>
        </div>

        {/* 3. CONTENT AREA: SKELETON / EMPTY / TABLE + CARDS */}
        {usersQuery.isLoading ? (
          <div className="um-table-wrapper" aria-busy="true" aria-label="Loading users list">
            <table className="um-table">
              <thead>
                <tr>
                  <th scope="col" className="um-th-user">User</th>
                  <th scope="col" className="um-th-role">Role</th>
                  <th scope="col" className="um-th-phone">Phone</th>
                  <th scope="col" className="um-th-status">STATUS</th>
                  <th scope="col" className="um-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <tr key={idx} className="um-table-row um-skeleton-row">
                    <td>
                      <div className="um-skeleton-user">
                        <div className="um-skeleton um-skeleton-avatar" />
                        <div className="um-skeleton-copy">
                          <div className="um-skeleton um-skeleton-line um-skeleton-line--long" />
                          <div className="um-skeleton um-skeleton-line um-skeleton-line--short" />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="um-skeleton um-skeleton-badge" />
                    </td>
                    <td>
                      <div className="um-skeleton um-skeleton-line um-skeleton-line--medium" />
                    </td>
                    <td>
                      <div className="um-skeleton um-skeleton-pill" />
                    </td>
                    <td className="um-td-actions">
                      <div className="um-skeleton um-skeleton-btn" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : users.length === 0 ? (
          <div className="um-empty-state">
            <div className="um-empty-icon-wrap">
              <FontAwesomeIcon icon={faUsers} />
            </div>
            <h2 className="um-empty-title">No accounts yet</h2>
            <p className="um-empty-text">
              Add an LGU personnel or administrator account to get started.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="um-add-btn"
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>Add First User</span>
            </button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="um-empty-state">
            <div className="um-empty-icon-wrap">
              <FontAwesomeIcon icon={faSearch} />
            </div>
            <h2 className="um-empty-title">No users match your filters</h2>
            <p className="um-empty-text">
              Try adjusting your search query or reset your role and status filters.
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="um-clear-btn um-empty-clear-btn"
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              <span>Clear filters</span>
            </button>
          </div>
        ) : (
          <div className="um-list-container">
            {/* DESKTOP TABLE VIEW (Visible > 768px) */}
            <div className="um-table-wrapper">
              <table className="um-table">
                <thead>
                  <tr>
                    <th scope="col" className="um-th-user">User</th>
                    <th scope="col" className="um-th-role">Role</th>
                    <th scope="col" className="um-th-phone">Phone</th>
                    <th scope="col" className="um-th-status">STATUS</th>
                    <th scope="col" className="um-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const isMuted = !u.is_active;
                    const isMenuOpen = openActionMenu?.userId === u.id;

                    return (
                      <tr
                        key={u.id}
                        className={`um-table-row ${isMuted ? "is-muted" : ""}`}
                      >
                        {/* USER CELL */}
                        <td className="um-td-user">
                          <button
                            type="button"
                            className="um-user-cell-btn"
                            onClick={() => openDetailsModal(u, "overview")}
                            aria-label={`View account details for ${u.name}`}
                          >
                            <div
                              className={`um-avatar ${
                                u.role === "admin" ? "is-admin" : "is-personnel"
                              }`}
                              aria-hidden="true"
                            >
                              {initials(u.name)}
                            </div>
                            <div className="um-user-cell-info">
                              <span className="um-user-name">{u.name}</span>
                              <span className="um-user-email">{u.email}</span>
                            </div>
                          </button>
                        </td>

                        {/* ROLE BADGE */}
                        <td className="um-td-role">
                          <span
                            className={`um-role-badge ${
                              u.role === "admin" ? "is-admin" : "is-personnel"
                            }`}
                          >
                            {ROLE_LABELS[u.role] || u.role.replace("_", " ")}
                          </span>
                        </td>

                        {/* PHONE */}
                        <td className="um-td-phone">
                          <span className="um-phone-text">
                            {u.contact_number || "—"}
                          </span>
                        </td>

                        {/* STATUS PILL */}
                        <td className="um-td-status">
                          <span className={`um-status-pill ${
                            u.is_active ? "um-status-pill--available" : "um-status-pill--closed"
                          }`}>
                            <span className="um-status-dot" aria-hidden="true" />
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {/* ROW ACTION MENU ("⋯") */}
                        <td className="um-td-actions um-action-cell">
                          <div className="um-action-menu-wrap">
                            <button
                              type="button"
                              className={`um-action-trigger-btn ${isMenuOpen ? "is-open" : ""}`}
                              onClick={(e) => toggleRowActionMenu(u, e.currentTarget)}
                              aria-label={`Actions for ${u.name}`}
                              aria-haspopup="true"
                              aria-expanded={isMenuOpen}
                              title="More options"
                            >
                              <FontAwesomeIcon icon={faEllipsisVertical} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {openActionMenu && activeMenuUser && activeMenuRestriction &&
              createPortal(
                <div
                  data-um-menu="true"
                  className={`um-action-menu-dropdown um-action-menu-dropdown--portal ${
                    openActionMenu.openAbove ? "is-upward" : ""
                  }`}
                  style={{
                    right: `${openActionMenu.right}px`,
                    ...(openActionMenu.openAbove
                      ? { bottom: `${openActionMenu.bottom}px` }
                      : { top: `${openActionMenu.top}px` }),
                  }}
                  role="menu"
                  aria-label={`Actions for ${activeMenuUser.name}`}
                >
                  <button
                    type="button"
                    className="um-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenActionMenu(null);
                      openDetailsModal(activeMenuUser, "edit");
                    }}
                  >
                    <FontAwesomeIcon icon={faPen} className="um-menu-icon" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    className="um-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenActionMenu(null);
                      handleResetPassword(activeMenuUser);
                    }}
                  >
                    <FontAwesomeIcon icon={faKey} className="um-menu-icon" />
                    <span>Email password reset</span>
                  </button>

                  {activeMenuUser.is_active ? (
                    !activeMenuRestriction.isSelf && (
                      <button
                        type="button"
                        className="um-menu-item is-danger"
                        role="menuitem"
                        disabled={
                          activeMenuRestriction.disabled ||
                          togglingId === activeMenuUser.id
                        }
                        title={activeMenuRestriction.tooltip || undefined}
                        onClick={() => {
                          setOpenActionMenu(null);
                          setDeactivatingUser(activeMenuUser);
                        }}
                      >
                        <FontAwesomeIcon icon={faBan} className="um-menu-icon" />
                        <span>Deactivate</span>
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      className="um-menu-item is-success"
                      role="menuitem"
                      disabled={togglingId === activeMenuUser.id}
                      onClick={() => {
                        setOpenActionMenu(null);
                        handleReactivate(activeMenuUser);
                      }}
                    >
                      <FontAwesomeIcon icon={faCheck} className="um-menu-icon" />
                      <span>Reactivate</span>
                    </button>
                  )}
                </div>,
                document.body
              )}

            {/* MOBILE STACKED CARDS VIEW (Visible <= 768px) */}
            <div className="um-cards-wrapper">
              {filteredUsers.map((u) => {
                const isMuted = !u.is_active;
                const isMenuOpen = openActionMenu?.userId === u.id;

                return (
                  <article
                    key={u.id}
                    className={`um-user-card ${isMuted ? "is-muted" : ""}`}
                  >
                    <div className="um-card-header">
                      <button
                        type="button"
                        className="um-card-user-btn"
                        onClick={() => openDetailsModal(u, "overview")}
                        aria-label={`View account details for ${u.name}`}
                      >
                        <div
                          className={`um-avatar ${
                            u.role === "admin" ? "is-admin" : "is-personnel"
                          }`}
                          aria-hidden="true"
                        >
                          {initials(u.name)}
                        </div>

                        <div className="um-card-header-meta">
                          <div className="um-card-title-row">
                            <h2 className="um-card-name">{u.name}</h2>
                            <span className={`um-status-pill ${
                              u.is_active ? "um-status-pill--available" : "um-status-pill--closed"
                            }`}>
                              <span className="um-status-dot" aria-hidden="true" />
                              {u.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <p className="um-card-email">{u.email}</p>
                        </div>
                      </button>

                      <div className="um-action-cell um-card-action-cell">
                        <button
                          type="button"
                          className={`um-action-trigger-btn ${isMenuOpen ? "is-open" : ""}`}
                          onClick={(e) => toggleRowActionMenu(u, e.currentTarget)}
                          aria-label={`Actions for ${u.name}`}
                          aria-haspopup="true"
                          aria-expanded={isMenuOpen}
                        >
                          <FontAwesomeIcon icon={faEllipsisVertical} />
                        </button>
                      </div>
                    </div>

                    <div className="um-card-body">
                      <div className="um-card-meta-line">
                        <span className="um-meta-label">Role</span>
                        <span
                          className={`um-role-badge ${
                            u.role === "admin" ? "is-admin" : "is-personnel"
                          }`}
                        >
                          {ROLE_LABELS[u.role] || u.role.replace("_", " ")}
                        </span>
                      </div>

                      <div className="um-card-meta-line">
                        <span className="um-meta-label">Phone</span>
                        <span className="um-phone-text">
                          {u.contact_number || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="um-card-footer">
                      <button
                        type="button"
                        onClick={() => openDetailsModal(u, "overview")}
                        className="um-card-quick-btn"
                      >
                        <FontAwesomeIcon icon={faEye} />
                        <span>View Details</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. CONFIRM DEACTIVATE MODAL */}
      {deactivatingUser && (
        <div
          className="um-overlay um-confirm-overlay"
          onClick={() => setDeactivatingUser(null)}
          role="presentation"
        >
          <div
            className="um-modal um-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-deactivate-title"
          >
            <div className="um-modal-header">
              <h2 className="um-modal-title" id="um-deactivate-title">
                Deactivate Account
              </h2>
              <button
                type="button"
                onClick={() => setDeactivatingUser(null)}
                className="um-modal-close"
                aria-label="Close dialog"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="um-confirm-body">
              <p className="um-confirm-message">
                Are you sure you want to deactivate <strong>{deactivatingUser.name}</strong>?
                They will immediately lose access to the system and cannot log in until reactivated.
              </p>
            </div>

            <div className="um-modal-footer">
              <button
                type="button"
                onClick={() => setDeactivatingUser(null)}
                className="um-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeactivate}
                disabled={togglingId === deactivatingUser.id}
                className="um-danger-btn"
              >
                {togglingId === deactivatingUser.id
                  ? "Deactivating…"
                  : "Deactivate Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD ACCOUNT MODAL */}
      {showForm && (
        <div className="um-overlay" onClick={closeModal} role="presentation">
          <div
            className="um-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-add-title"
          >
            <div className="um-modal-header">
              <div>
                <h2 className="um-modal-title" id="um-add-title">
                  Add Account
                </h2>
                <p className="um-modal-subtitle">
                  Create a personnel or admin account and dispatch a setup link.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="um-modal-close"
                aria-label="Close modal"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="um-modal-form">
              {formError && (
                <div className="um-form-error" role="alert">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="um-form-fields">
                <div className="um-form-group">
                  <label htmlFor="add-name" className="um-label">
                    Full name
                  </label>
                  <input
                    id="add-name"
                    placeholder="Juan Dela Cruz"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="um-input"
                    required
                    autoFocus
                  />
                </div>

                <div className="um-form-group">
                  <label htmlFor="add-role" className="um-label">
                    Role
                  </label>
                  <select
                    id="add-role"
                    value={form.role}
                    onChange={(e) =>
                      setForm({ ...form, role: e.target.value })
                    }
                    className="um-input"
                  >
                    <option value="lgu_personnel">LGU Personnel</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div className="um-form-group">
                  <label htmlFor="add-email" className="um-label">
                    Email address
                  </label>
                  <input
                    id="add-email"
                    type="email"
                    placeholder="name@lgu.gov.ph"
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      setEmailError("");
                      setEmailAvailable(null);
                    }}
                    onBlur={(e) => checkEmailAvailability(e.target.value)}
                    className="um-input"
                    required
                  />
                  <small
                    className={`um-email-hint ${
                      emailError
                        ? "is-error"
                        : emailAvailable
                        ? "is-available"
                        : ""
                    }`}
                  >
                    {emailChecking
                      ? "Verifying email availability..."
                      : emailError ||
                        (emailAvailable
                          ? "Email is available. A setup link will be emailed."
                          : "We will email a secure password setup link to this address.")}
                  </small>
                </div>

                <div className="um-form-group">
                  <label htmlFor="add-phone" className="um-label">
                    Contact number
                  </label>
                  <input
                    id="add-phone"
                    placeholder="09xx xxx xxxx"
                    value={form.contact_number}
                    onChange={(e) =>
                      setForm({ ...form, contact_number: e.target.value })
                    }
                    className="um-input"
                  />
                </div>
              </div>

              <div className="um-modal-footer">
                <button
                  type="button"
                  onClick={closeModal}
                  className="um-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="um-save-btn"
                >
                  {saving ? "Creating account…" : "Create & email setup link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. ACCOUNT PROFILE & EDIT MODAL (SINGLE SURFACE, NO TABS) */}
      {selectedUser && (
        <div
          className="um-overlay um-overlay--details"
          onClick={closeUserModal}
          role="presentation"
        >
          <div
            className="um-modal um-modal--details"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-details-title"
          >
            {/* MODAL HEADER */}
            <div className="um-modal-header">
              <div className="um-modal-header-copy">
                <h2 className="um-modal-title" id="um-details-title">
                  {modalMode === "edit" ? "Edit Account" : "Account Profile"}
                </h2>
              </div>
              <div className="um-modal-header-actions">
                {modalMode !== "edit" && (
                  <button
                    type="button"
                    onClick={() => setModalMode("edit")}
                    className="um-inline-edit-btn"
                  >
                    <FontAwesomeIcon icon={faPen} />
                    <span>Edit details</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeUserModal}
                  className="um-modal-close"
                  aria-label="Close modal"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>

            {/* IF IN EDIT MODE: DISPLAY IN-PLACE EDIT FORM */}
            {modalMode === "edit" ? (
              <form onSubmit={handleUpdateUser} className="um-modal-form">
                {editError && (
                  <div className="um-form-error" role="alert">
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="um-form-fields">
                  <div className="um-form-group">
                    <label htmlFor="edit-name" className="um-label">
                      Full name
                    </label>
                    <input
                      id="edit-name"
                      className="um-input"
                      value={editForm.name}
                      required
                      maxLength={100}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      autoFocus
                    />
                  </div>

                  <div className="um-form-group">
                    <label htmlFor="edit-role" className="um-label">
                      Role
                    </label>
                    <select
                      id="edit-role"
                      className="um-input"
                      value={editForm.role}
                      onChange={(e) =>
                        setEditForm({ ...editForm, role: e.target.value })
                      }
                    >
                      <option value="lgu_personnel">LGU Personnel</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>

                  <div className="um-form-group">
                    <label htmlFor="edit-email" className="um-label">
                      Email address
                    </label>
                    <input
                      id="edit-email"
                      className="um-input"
                      type="email"
                      value={editForm.email}
                      required
                      onChange={(e) =>
                        setEditForm({ ...editForm, email: e.target.value })
                      }
                    />
                  </div>

                  <div className="um-form-group">
                    <label htmlFor="edit-phone" className="um-label">
                      Contact number
                    </label>
                    <input
                      id="edit-phone"
                      className="um-input"
                      value={editForm.contact_number}
                      maxLength={20}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          contact_number: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="um-modal-footer">
                  <button
                    type="button"
                    onClick={() => {
                      setModalMode("overview");
                      setEditError("");
                    }}
                    className="um-cancel-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="um-save-btn"
                    disabled={savingUser}
                  >
                    {savingUser ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            ) : (
              /* VIEW MODE: DETAILS ONLY (NO TABS / NO ACTIVITY) */
              <div className="um-modal-content">
                <div className="um-profile-body">
                  <div className="um-profile-banner">
                    <div
                      className={`um-avatar is-large ${
                        selectedUser.role === "admin" ? "is-admin" : "is-personnel"
                      }`}
                      aria-hidden="true"
                    >
                      {initials(selectedUser.name)}
                    </div>

                    <div className="um-profile-meta">
                      <h3 className="um-profile-name">{selectedUser.name}</h3>
                      <div className="um-profile-badge-row">
                        <span
                          className={`um-role-badge ${
                            selectedUser.role === "admin" ? "is-admin" : "is-personnel"
                          }`}
                        >
                          {ROLE_LABELS[selectedUser.role] ||
                            selectedUser.role.replace("_", " ")}
                        </span>
                        <span className={`um-status-pill ${
                            selectedUser.is_active ? "um-status-pill--available" : "um-status-pill--closed"
                          }`}>
                          <span className="um-status-dot" aria-hidden="true" />
                          {selectedUser.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="um-detail-grid">
                    <div className="um-detail-card">
                      <div className="um-detail-label">
                        <FontAwesomeIcon icon={faEnvelope} />
                        <span>Email address</span>
                      </div>
                      <div className="um-detail-value">{selectedUser.email}</div>
                    </div>

                    <div className="um-detail-card">
                      <div className="um-detail-label">
                        <FontAwesomeIcon icon={faPhone} />
                        <span>Contact number</span>
                      </div>
                      <div className="um-detail-value">
                        {selectedUser.contact_number || "Not specified"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* MODAL FOOTER WITH PASSWORD RESET ON LEFT & CLOSE ON RIGHT */}
                <div className="um-modal-footer um-modal-footer--split">
                  <button
                    type="button"
                    className="um-secondary-btn"
                    onClick={() => handleResetPassword(selectedUser)}
                    disabled={resettingPassword}
                  >
                    <FontAwesomeIcon icon={faKey} />
                    <span>
                      {resettingPassword ? "Sending reset email…" : "Email password reset"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={closeUserModal}
                    className="um-primary-action-btn"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;