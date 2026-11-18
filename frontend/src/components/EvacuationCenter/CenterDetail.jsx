import { useState, useCallback, useEffect, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBuilding,
  faMap,
  faPen,
  faPlus,
  faPhone,
  faTrash,
  faBuildingColumns,
  faUserPlus,
  faDoorOpen,
  faUsers,
  faPeopleGroup,
  faClockRotateLeft,
  faCircleCheck,
  faLocationDot,
  faArrowsRotate,
  faDrawPolygon,
  faChevronDown,
  faChevronRight,
  faSearch,
  faDownload,
  faList,
  faTableCellsLarge,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useCenterDetails } from '../../hooks/useEvacuationQueries'
import { formatRoomLabel } from '../../utils/formatRoomLabel'
import {
  centerStatus,
  CENTER_TABS,
  isCenterMapped,
  resolveCenterStructureMode,
} from './utils'
import { EmptyState } from './CenterList'
import { FloatingMenuTrigger } from './FloatingMenu'
import MappingBanner from './MappingBanner'
import ReadinessChecklist from './ReadinessChecklist'
import './CenterDetail.css'

const VALID_TABS = ['overview', 'structure', 'households', 'activity']

function getTabFromHash() {
  if (typeof window === 'undefined') return 'overview'
  const hash = window.location.hash.replace(/^#/, '').toLowerCase().trim()
  return VALID_TABS.includes(hash) ? hash : 'overview'
}

function ConfirmDialog({
  open = false,
  title = 'Confirm',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(function () {
    if (!open) return undefined
    function onKeyDown(ev) {
      if (ev.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return function () {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="ds-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.()
      }}
    >
      <section className="ds-modal ds-modal--confirm" onClick={(e) => e.stopPropagation()}>
        <header className="ds-modal__header">
          <h2 id="confirm-dialog-title" className="ds-modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="ds-btn ds-btn--icon ds-btn--ghost"
            onClick={onCancel}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} size="xs" />
          </button>
        </header>
        <div className="ds-modal__body">
          <p id="confirm-dialog-desc">{message}</p>
        </div>
        <footer className="ds-modal__footer">
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`ds-btn ds-btn--${danger ? 'danger' : 'primary'} ${loading ? 'is-loading' : ''}`}
            disabled={loading}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </footer>
      </section>
    </div>
  )
}

export default function CenterDetail({
  center,
  section,
  counts,
  rooms = [],
  buildings = [],
  centerCapacity,
  centerOccupied,
  centerAssigned,
  householdCapacity,
  householdAssigned,
  householdArrived,
  householdSpaceLeft,
  onBack,
  onSectionChange,
  onAssignHousehold,
  onViewMap,
  onEditCenter,
  onAddRooms,
  onAddBuilding,
  onOpenRoom,
  onEditBuilding,
  onDeleteBuilding,
  onAddRoomToBuilding,
  onAddRoom,
  onEditRoom,
  onViewBuildingMap,
  onPlaceBuilding,
  onMove,
  onUnassign,
  onDeactivate,
  canDeactivate,
  onPlaceOnMap,
}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const centerId = center?.id
  const detailsQuery = useCenterDetails(centerId)
  const centerFamilies = Array.isArray(detailsQuery.data?.assigned_families)
    ? detailsQuery.data.assigned_families
    : []

  const capacity = Number(centerCapacity || 0)
  const assigned = Number(centerAssigned || 0)
  const checkedIn = Number(centerOccupied || 0)
  const spaceLeft = Math.max(0, capacity - assigned)
  const status = centerStatus(center, checkedIn, assigned, capacity)
  const structureMode = resolveCenterStructureMode(center)
  const isOpenArea = structureMode === 'open_area'
  const visibleTabs = useMemo(
    () => (isOpenArea ? CENTER_TABS.filter((t) => t.key !== 'structure') : CENTER_TABS),
    [isOpenArea]
  )
  const visibleTabKeys = useMemo(() => visibleTabs.map((t) => t.key), [visibleTabs])

  // URL hash sync for active tab (defaults to 'overview')
  const [activeTab, setActiveTab] = useState(() => {
    const fromHash = getTabFromHash()
    if (fromHash !== 'overview' && (!isOpenArea || fromHash !== 'structure')) return fromHash
    if (section && VALID_TABS.includes(section) && (!isOpenArea || section !== 'structure')) return section
    return 'overview'
  })

  const effectiveActiveTab = isOpenArea && activeTab === 'structure' ? 'overview' : activeTab

  // Listen for hash changes (browser back/forward or direct hash updates)
  useEffect(() => {
    function handleHashChange() {
      const rawTab = getTabFromHash()
      const nextTab = isOpenArea && rawTab === 'structure' ? 'overview' : rawTab
      setActiveTab(nextTab)
      onSectionChange?.(nextTab)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [onSectionChange, isOpenArea])

  // Sync initial hash to parent on mount if not overview
  useEffect(() => {
    const initialTab = getTabFromHash()
    if (initialTab && initialTab !== 'overview' && (!isOpenArea || initialTab !== 'structure') && onSectionChange) {
      onSectionChange(initialTab)
    }
  }, [onSectionChange, isOpenArea])

  // Sync section prop if changed by parent
  useEffect(() => {
    if (section && visibleTabKeys.includes(section) && section !== activeTab) {
      setActiveTab(section)
      const currentHash = window.location.hash.replace(/^#/, '').toLowerCase().trim()
      if (currentHash !== section) {
        window.location.hash = section === 'overview' ? 'overview' : section
      }
    }
  }, [section, activeTab, visibleTabKeys])

  const handleSelectTab = useCallback(
    (tabKey) => {
      if (!visibleTabKeys.includes(tabKey)) return
      setActiveTab(tabKey)
      onSectionChange?.(tabKey)
      const currentHash = window.location.hash.replace(/^#/, '').toLowerCase().trim()
      if (currentHash !== tabKey) {
        window.location.hash = tabKey === 'overview' ? 'overview' : tabKey
      }
    },
    [onSectionChange, visibleTabKeys]
  )

  const handleBackWithHashClean = useCallback(() => {
    try {
      if (window.history?.replaceState) {
        const urlWithoutHash = window.location.href.split('#')[0]
        window.history.replaceState(null, '', urlWithoutHash)
      } else {
        window.location.hash = ''
      }
    } catch {
      // ignore
    }
    onBack?.()
  }, [onBack])

  return (
    <div className="ec-detail">
      {/* 1. Breadcrumb & Header */}
      <CenterHeader
        center={center}
        status={status}
        buildings={buildings}
        onBack={handleBackWithHashClean}
        onAssignHousehold={onAssignHousehold}
        onViewMap={onViewMap}
        onEditCenter={isAdmin ? onEditCenter : undefined}
        onAddRooms={structureMode === 'rooms_only' ? onAddRooms : undefined}
        onAddBuilding={isAdmin ? onAddBuilding : undefined}
        onDeactivate={isAdmin ? () => onDeactivate?.(center) : undefined}
        canDeactivate={canDeactivate}
        onPlaceOnMap={onPlaceOnMap}
      />

      {/* 2. Tab Bar: placed directly under header with 20px space, sticky on scroll */}
      <SectionTabs
        activeKey={effectiveActiveTab}
        tabs={visibleTabs}
        counts={counts}
        onSelect={handleSelectTab}
      />

      {/* 3. Tab Content below tab bar */}
      <div className="ec-detail-content">
        <section
          id="ec-tabpanel-overview"
          role="tabpanel"
          aria-labelledby="ec-tab-overview"
          className={`ec-tab-panel ${effectiveActiveTab === 'overview' ? 'is-active' : ''}`}
          aria-hidden={effectiveActiveTab !== 'overview'}
        >
          {/* Overview tab only: stat cards at the top in one row of 4, Center Info & Checklist side by side below */}
          <OverviewTab
            center={center}
            rooms={rooms}
            buildings={buildings}
            centerFamilies={centerFamilies}
            capacity={capacity}
            assigned={assigned}
            checkedIn={checkedIn}
            spaceLeft={spaceLeft}
            householdCapacity={householdCapacity}
            householdAssigned={householdAssigned}
            householdArrived={householdArrived}
            householdSpaceLeft={householdSpaceLeft}
            onEdit={isAdmin ? onEditCenter : undefined}
            onPlaceOnMap={onPlaceOnMap}
            onAddRooms={structureMode === 'rooms_only' ? onAddRooms : undefined}
            onAddBuilding={isAdmin ? onAddBuilding : undefined}
          />
        </section>

        {/* Structure tab only shown when center is not an open area */}
        {!isOpenArea && (
          <section
            id="ec-tabpanel-structure"
            role="tabpanel"
            aria-labelledby="ec-tab-structure"
            className={`ec-tab-panel ${effectiveActiveTab === 'structure' ? 'is-active' : ''}`}
            aria-hidden={effectiveActiveTab !== 'structure'}
          >
            <StructureTab
              center={center}
              rooms={rooms}
              buildings={buildings}
              centerFamilies={centerFamilies}
              onAddBuilding={isAdmin ? onAddBuilding : undefined}
              onOpenRoom={onOpenRoom}
              onEditBuilding={isAdmin ? onEditBuilding : undefined}
              onDeleteBuilding={isAdmin ? onDeleteBuilding : undefined}
              onAddRoomToBuilding={isAdmin ? onAddRoomToBuilding : undefined}
              onAddRoom={structureMode === 'rooms_only' ? onAddRoom : undefined}
              onAssignHousehold={onAssignHousehold}
              onEditCenter={onEditCenter}
              onEditRoom={onEditRoom}
              onViewBuildingMap={onViewBuildingMap}
              onPlaceBuilding={onPlaceBuilding}
            />
          </section>
        )}

        <section
          id="ec-tabpanel-households"
          role="tabpanel"
          aria-labelledby="ec-tab-households"
          className={`ec-tab-panel ${effectiveActiveTab === 'households' ? 'is-active' : ''}`}
          aria-hidden={effectiveActiveTab !== 'households'}
        >
          <HouseholdsTab
            center={center}
            centerFamilies={centerFamilies}
            rooms={rooms}
            buildings={buildings}
            onAssignHousehold={onAssignHousehold}
            onMove={onMove}
            onUnassign={onUnassign}
          />
        </section>

        <section
          id="ec-tabpanel-activity"
          role="tabpanel"
          aria-labelledby="ec-tab-activity"
          className={`ec-tab-panel ${effectiveActiveTab === 'activity' ? 'is-active' : ''}`}
          aria-hidden={effectiveActiveTab !== 'activity'}
        >
          <ActivityTab center={center} />
        </section>
      </div>
    </div>
  )
}

function HeaderStatusPill({ status }) {
  const s = status || 'Available'
  let tone = 'available'
  if (s === 'Full') tone = 'full'
  else if (s === 'Near Full') tone = 'near-full'
  else if (s === 'Inactive' || s === 'Closed') tone = 'inactive'

  return (
    <span className={`ec-header-status-pill is-${tone}`}>
      <span className={`ec-header-status-dot is-${tone}`} />
      <span>{s}</span>
    </span>
  )
}

export function CenterHeader({
  center,
  status,
  buildings = [],
  onBack,
  onAssignHousehold,
  onViewMap,
  onEditCenter,
  onAddRooms,
  onAddBuilding,
  onDeactivate,
  canDeactivate,
}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showAllBarangays, setShowAllBarangays] = useState(false)

  const name = center?.name || 'Unnamed Center'
  const rawBarangays = Array.isArray(center?.barangays) ? center.barangays : []
  const allBarangays = rawBarangays
    .map((b) => (typeof b === 'string' ? b : b?.name || ''))
    .filter(Boolean)
  const contact = center?.contact_number || null
  const isActive = Boolean(center?.is_active)

  // Conditional buttons logic
  const isMapped = Boolean(
    isCenterMapped(center) ||
    center?.has_map ||
    (center?.latitude != null && center?.longitude != null) ||
    (center?.lat != null && center?.lng != null)
  )

  const structureMode = resolveCenterStructureMode(center)
  const isSingleVenue = structureMode === 'open_area'
  const isPrivateProperty = structureMode === 'rooms_only'
  const hasBuildings = structureMode === 'buildings_and_rooms'
  const canAddBuilding = hasBuildings
  const canAddRoom = !isSingleVenue

  const kebabItems = []
  if (canAddRoom && onAddRooms) {
    kebabItems.push({ label: 'Add rooms', icon: faPlus, onClick: onAddRooms })
  }
  if (isAdmin && canAddBuilding && onAddBuilding) {
    kebabItems.push({ label: 'Add building', icon: faBuilding, onClick: onAddBuilding })
  }
  if (kebabItems.length > 0 && isAdmin && canDeactivate && onDeactivate) {
    kebabItems.push({ divider: true })
  }
  if (isAdmin && canDeactivate && onDeactivate) {
    kebabItems.push({
      label: isActive ? 'Deactivate' : 'Activate',
      icon: faTrash,
      danger: isActive,
      onClick: () => setConfirmOpen(true),
    })
  }

  const handleDeactivateConfirm = () => {
    setConfirmOpen(false)
    onDeactivate?.()
  }

  const confirmMessage = isActive
    ? `Deactivating “${name}” will hide it from the active centers list. Assigned households keep their records.`
    : `Activating “${name}” will return it to the active centers list.`

  const maxBarangays = 3
  const visibleBarangays = showAllBarangays
    ? allBarangays
    : allBarangays.slice(0, maxBarangays)
  const remainingCount = Math.max(0, allBarangays.length - maxBarangays)
  const remainingTooltip = allBarangays.slice(maxBarangays).join(', ')

  return (
    <>
      <header className="ec-detail-header">
        <nav className="ec-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="ec-breadcrumb-link" onClick={onBack}>
            <FontAwesomeIcon icon={faBuildingColumns} className="ec-breadcrumb-icon" />
            <span>Evacuation Centers</span>
          </button>
          <span className="ec-breadcrumb-separator">›</span>
          <span className="ec-breadcrumb-current">{name}</span>
        </nav>

        <div className="ec-title-row">
          <div className="ec-title-info">
            <div className="ec-title-line">
              <h1 className="ec-detail-title">{name}</h1>
              <HeaderStatusPill status={status} />
            </div>

            <div className="ec-title-meta-line">
              <div className="ec-barangay-pills">
                {visibleBarangays.map((b) => (
                  <span key={b} className="ec-barangay-pill">
                    {b}
                  </span>
                ))}
                {!showAllBarangays && remainingCount > 0 && (
                  <button
                    type="button"
                    className="ec-barangay-pill ec-barangay-pill--more"
                    onClick={() => setShowAllBarangays(true)}
                    title={`Click to show: ${remainingTooltip}`}
                    aria-label={`${remainingCount} more barangays: ${remainingTooltip}`}
                  >
                    +{remainingCount}
                  </button>
                )}
                {showAllBarangays && remainingCount > 0 && (
                  <button
                    type="button"
                    className="ec-barangay-pill ec-barangay-pill--more"
                    onClick={() => setShowAllBarangays(false)}
                    title="Click to collapse"
                  >
                    Show less
                  </button>
                )}
              </div>
              {contact && (
                <>
                  <span className="ec-meta-bullet" aria-hidden="true">·</span>
                  <a href={'tel:' + contact} className="ec-contact-line" title={'Call ' + contact}>
                    <FontAwesomeIcon icon={faPhone} className="ec-contact-icon" />
                    <span>{contact}</span>
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="ec-title-actions">
            <button
              type="button"
              className="ec-btn-primary-action"
              onClick={onAssignHousehold}
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>Assign Household</span>
            </button>
            {isMapped && onViewMap && (
              <button
                type="button"
                className="ec-btn-secondary-action"
                onClick={onViewMap}
              >
                <FontAwesomeIcon icon={faMap} />
                <span>View on map</span>
              </button>
            )}
            {isAdmin && onEditCenter && (
              <button
                type="button"
                className="ec-btn-secondary-action"
                onClick={onEditCenter}
              >
                <FontAwesomeIcon icon={faPen} />
                <span>Edit center</span>
              </button>
            )}
            {kebabItems.length > 0 && (
              <FloatingMenuTrigger
                items={kebabItems}
                label="More actions"
                align="right"
              />
            )}
          </div>
        </div>
      </header>

      <ConfirmDialog
        open={confirmOpen}
        title={isActive ? 'Deactivate center' : 'Activate center'}
        message={confirmMessage}
        confirmText={isActive ? 'Deactivate' : 'Activate'}
        cancelText="Cancel"
        danger={isActive}
        onConfirm={handleDeactivateConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}

export function KpiStrip({
  householdCapacity,
  householdAssigned,
  householdArrived,
  householdSpaceLeft,
  isOpenArea = false,
  onEditCapacity,
}) {
  const householdCap = Number(householdCapacity ?? householdAssigned ?? 0)
  const householdAsg = Number(householdAssigned ?? 0)
  const householdCheckIn = Number(householdArrived ?? 0)
  const householdLeft = Math.max(0, Number(householdSpaceLeft || 0))

  const pctAssigned = householdCap > 0 ? Math.min(100, Math.round((householdAsg / householdCap) * 100)) : 0
  const pctArrived = householdAsg > 0 ? Math.min(100, Math.round((householdCheckIn / householdAsg) * 100)) : 0

  return (
    <div className="ec-kpi-strip">
      <div className="ec-kpi-card">
        <div className="ec-kpi-card-header">
          <span className="ec-kpi-label">Capacity</span>
          {isOpenArea && onEditCapacity ? (
            <button
              type="button"
              className="ec-info-edit-btn"
              onClick={onEditCapacity}
              title="Edit center capacity"
            >
              <FontAwesomeIcon icon={faPen} size="xs" />
              <span>Edit</span>
            </button>
          ) : (
            <FontAwesomeIcon icon={faBuildingColumns} className="ec-kpi-icon-muted" />
          )}
        </div>
        <div className="ec-kpi-val">{householdCap > 0 ? householdCap : '—'}</div>
        <div className="ec-kpi-helper">
          {isOpenArea ? 'Estimated household capacity' : 'Estimated household capacity'}
        </div>
      </div>

      <div className="ec-kpi-card">
        <div className="ec-kpi-card-header">
          <span className="ec-kpi-label">Assigned</span>
          <FontAwesomeIcon icon={faUserPlus} className="ec-kpi-icon-muted" />
        </div>
        <div className="ec-kpi-val">{householdAsg}</div>
        <div className="ec-kpi-progress-track">
          <div className="ec-kpi-progress-fill" style={{ width: `${pctAssigned}%` }} />
        </div>
        <div className="ec-kpi-helper">{householdCap > 0 ? `${householdAsg} of ${householdCap} households assigned` : 'Total households assigned'}</div>
      </div>

      <div className="ec-kpi-card">
        <div className="ec-kpi-card-header">
          <span className="ec-kpi-label">Space Left</span>
          <FontAwesomeIcon icon={faDoorOpen} className="ec-kpi-icon-muted" />
        </div>
        <div className="ec-kpi-val">{householdLeft}</div>
        <div className="ec-kpi-helper">Households it can still take</div>
      </div>

      <div className="ec-kpi-card">
        <div className="ec-kpi-card-header">
          <span className="ec-kpi-label">Arrived</span>
          <FontAwesomeIcon icon={faCircleCheck} className="ec-kpi-icon-muted" />
        </div>
        <div className="ec-kpi-val">{householdCheckIn}</div>
        <div className="ec-kpi-progress-track">
          <div className="ec-kpi-progress-fill" style={{ width: `${pctArrived}%` }} />
        </div>
        <div className="ec-kpi-helper">{householdAsg > 0 ? `${householdCheckIn} of ${householdAsg} households arrived` : 'No households assigned yet'}</div>
      </div>
    </div>
  )
}

export function SectionTabs({ activeKey, tabs = CENTER_TABS, counts = {}, onSelect, className = '' }) {
  const keys = tabs.map((t) => t.key)

  const handleKeyDown = useCallback(
    (e) => {
      const index = keys.indexOf(activeKey)
      if (index < 0) return
      let next
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          next = keys[(index + 1) % keys.length]
          break
        case 'ArrowLeft':
          e.preventDefault()
          next = keys[(index - 1 + keys.length) % keys.length]
          break
        case 'Home':
          e.preventDefault()
          next = keys[0]
          break
        case 'End':
          e.preventDefault()
          next = keys[keys.length - 1]
          break
        default:
          return
      }
      onSelect(next)
      const el = document.getElementById(`ec-tab-${next}`)
      el?.focus({ preventScroll: true })
    },
    [activeKey, keys, onSelect]
  )

  return (
    <nav
      role="tablist"
      aria-label="Center detail sections"
      className={`ec-underline-tabs ${className}`.trim()}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = activeKey === tab.key
        const count = counts[tab.key]
        const tabId = `ec-tab-${tab.key}`
        return (
          <button
            key={tab.key}
            id={tabId}
            role="tab"
            aria-controls={`ec-tabpanel-${tab.key}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`ec-underline-tab ${isActive ? 'is-active' : ''}`}
            onClick={() => onSelect(tab.key)}
          >
            <span className="ec-underline-tab-label">{tab.label}</span>
            {count != null && (
              <span className="ec-underline-tab-count">{count}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

const TYPE_LABELS = {
  campus: 'Campus / Multi-building',
  single_venue: 'Single venue',
  private_property: 'Private property',
}

export function OverviewTab({
  center,
  rooms = [],
  buildings = [],
  centerFamilies = [],
  capacity = 0,
  assigned = 0,
  checkedIn = 0,
  spaceLeft = 0,
  householdCapacity,
  householdAssigned,
  householdArrived,
  householdSpaceLeft,
  onEdit,
  onPlaceOnMap,
  onAddRooms,
  onAddBuilding,
}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const barangays = Array.isArray(center?.barangays) ? center.barangays : []
  const addressParts = []
  if (center?.address) addressParts.push(center.address)
  if (barangays.length) {
    addressParts.push(
      barangays.map((b) => (typeof b === 'string' ? b : b.name || b)).join(', ')
    )
  }

  const infoRows = [
    {
      label: 'Type of place',
      value: center?.center_type_name || TYPE_LABELS[center?.center_type || 'campus'] || 'Center',
    },
    { label: 'Building material', value: center?.building_material || 'Concrete / Standard' },
    {
      label: 'Amenities',
      value:
        Array.isArray(center?.amenities) && center.amenities.length > 0
          ? center.amenities
            .map((a) => (typeof a === 'string' ? a : a.name || a.code))
            .filter(Boolean)
            .join(', ')
          : 'None added',
    },
    { label: 'Contact', value: center?.contact_number || 'Not provided' },
    {
      label: 'Barangays served',
      value: barangays.length
        ? barangays.map((b) => (typeof b === 'string' ? b : b.name || b)).join(', ')
        : 'Not set',
    },
    { label: 'Address', value: addressParts.length ? addressParts.join(' · ') : 'Not set' },
  ]

  const structureMode = resolveCenterStructureMode(center)
  const isOpenArea = structureMode === 'open_area'

  return (
    <div className="ec-overview-tab-content">
      {/* Mapping notice if center is unmapped */}
      <MappingBanner center={center} onPlaceOnMap={onPlaceOnMap} />

      {/* Four stat cards at the top of the Overview content */}
      <KpiStrip
        capacity={capacity}
        assigned={assigned}
        checkedIn={checkedIn}
        spaceLeft={spaceLeft}
        householdCapacity={householdCapacity}
        householdAssigned={householdAssigned}
        householdArrived={householdArrived}
        householdSpaceLeft={householdSpaceLeft}
        isOpenArea={isOpenArea}
        onEditCapacity={isAdmin && onEdit && isOpenArea ? () => onEdit(1) : undefined}
      />

      {/* Center Information and Readiness Checklist side by side below */}
      <div className="ec-overview ec-two-col">
        <div className="ec-info-card">
          <div className="ec-info-card-header">
            <h3 className="ec-info-card-title">Center Information</h3>
            {isAdmin && onEdit && (
              <button type="button" className="ec-info-edit-btn" onClick={onEdit}>
                <FontAwesomeIcon icon={faPen} size="xs" />
                <span>Edit</span>
              </button>
            )}
          </div>

          <dl className="ec-info-list">
            {infoRows.map((row) => (
              <div key={row.label} className="ec-info-row">
                <dt className="ec-info-label">{row.label}</dt>
                <dd className="ec-info-value">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <ReadinessChecklist
          center={{
            ...center,
            room_count: center?.room_count ?? center?.total_rooms ?? rooms.length,
            building_count: center?.building_count ?? buildings.length,
          }}
          onPlaceOnMap={onPlaceOnMap}
          onAddRooms={onAddRooms}
          onAddBuilding={onAddBuilding}
          onSetEntrance={onEdit}
          onEditContact={onEdit}
          onEditAccessibility={() => onEdit?.(4)}
        />
      </div>
    </div>
  )
}

const STRUCTURE_VIEW_STORAGE_KEY = 'evacway_structure_view_mode'

function getInitialStructureViewMode() {
  if (typeof window === 'undefined') return 'list'
  try {
    const saved = localStorage.getItem(STRUCTURE_VIEW_STORAGE_KEY)
    if (saved === 'list' || saved === 'grid') return saved
    if (window.innerWidth <= 768) return 'grid'
  } catch (err) {
    // ignore
  }
  return 'list'
}

function getRoomHouseholdCount(room, averageHouseholdSize = null) {
  const families = room?.families || room?.assigned_families
  if (Array.isArray(families)) {
    const householdKeys = families.map((family, index) =>
      family?.family_id ?? family?.id ?? family?.family_code ?? `household-${index}`
    )
    return new Set(householdKeys.map(String)).size
  }
  return averageHouseholdSize != null && averageHouseholdSize > 0
    ? Math.round(Number(room?.assigned || 0) / averageHouseholdSize)
    : 0
}

function getRoomArrivedHouseholdCount(room) {
  const families = room?.families || room?.assigned_families
  if (!Array.isArray(families)) return 0
  return families.filter((family) => family?.is_checked_in || family?.checked_in_at).length
}

function RoomCard({
  room,
  averageHouseholdSize = null,
  householdAssigned,
  householdArrived,
  index = 0,
  onOpenRoom,
  onEditRoom,
}) {
  const cap = room?.household_capacity != null
    ? Number(room.household_capacity)
    : averageHouseholdSize != null
      ? Math.floor(Number(room?.capacity || 0) / averageHouseholdSize)
      : null
  const asg = Number(householdAssigned ?? getRoomHouseholdCount(room, averageHouseholdSize))
  const occupied = Number(householdArrived ?? getRoomArrivedHouseholdCount(room))
  const status = cap != null && cap > 0 && asg >= cap ? 'full' : asg === 0 ? 'empty' : 'available'
  const isFull = status === 'full'
  const pct = cap == null ? 0 : cap > 0 ? Math.min(100, Math.round((asg / cap) * 100)) : asg > 0 ? 100 : 0
  const roomName = room?.room_number || `Room #${room?.id || ''}`

  return (
    <div
      className={`ec-room-card is-${status}`}
      role="listitem"
      tabIndex={0}
      style={{ animationDelay: `${Math.min(index, 9) * 20}ms` }}
      onClick={() => (onOpenRoom || onEditRoom)?.(room)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (onOpenRoom) onOpenRoom(room)
          else onEditRoom?.(room)
        }
      }}
      title={`Open ${roomName} details - ${status} (${asg}/${cap ?? '—'} households assigned)`}
    >
      <div className="ec-room-card-top">
        <div className={`ec-room-card-icon is-${status}`} aria-hidden="true">
          <FontAwesomeIcon icon={faDoorOpen} />
        </div>
        <span className={`ec-room-status-pill is-${status}`}>
          {status === 'available' ? 'Available' : status === 'full' ? 'Full' : 'Empty'}
        </span>
      </div>

      <h4 className="ec-room-card-name" title={roomName}>
        {roomName}
      </h4>

      <div className={`ec-room-bar-track ${isFull ? 'is-full-track' : ''}`}>
        <div
          className="ec-room-bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>

      <span className="ec-room-card-assigned">
        {asg} / {cap ?? '—'} households assigned
      </span>

      <div className="ec-room-card-footer">
        <span className="ec-room-card-arrived">Households arrived: {occupied}</span>

        <div className="ec-room-card-actions" onClick={(e) => e.stopPropagation()}>
          {onEditRoom && (
            <button
              type="button"
              className="ec-room-btn-action"
              onClick={(e) => {
                e.stopPropagation()
                onEditRoom(room)
              }}
              title="Edit room"
              aria-label={`Edit ${roomName}`}
            >
              <FontAwesomeIcon icon={faPen} />
            </button>
          )}

        </div>
      </div>
    </div>
  )
}

export function RoomDetailPage({
  center,
  room,
  buildingName,
  families = [],
  loading = false,
  error = null,
  onBack,
  onBackToList,
  onAddHousehold,
  onUnassignHousehold,
  onEditRoom,
  onRetry,
}) {
  const assignedPeople = Number(center?.assigned ?? center?.total_assigned ?? 0)
  const assignedHouseholds = Number(center?.household_assigned ?? families.length ?? 0)
  const averageHouseholdSize = assignedHouseholds > 0
    ? Math.max(1, assignedPeople / assignedHouseholds)
    : null
  const householdCapacity = room?.household_capacity != null
    ? Number(room.household_capacity)
    : averageHouseholdSize != null
      ? Math.floor(Number(room?.capacity || 0) / averageHouseholdSize)
      : null
  const householdAssigned = families.length
  const householdArrived = families.filter((family) => family?.is_checked_in).length
  const totalMembers = families.reduce(
    (total, family) => total + Number(family?.member_count || family?.family_members || family?.assigned_members || 1),
    0
  )
  const roomTitle = formatRoomLabel(room?.room_number)
  const isInactive = room?.is_active === false
  const isFull = householdCapacity > 0 && householdAssigned >= householdCapacity

  return (
    <main className="ec-room-detail-page">
      <div className="ec-room-detail-topbar">
        <nav className="ec-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="ec-breadcrumb-link" onClick={onBackToList}>
            <FontAwesomeIcon icon={faBuildingColumns} className="ec-breadcrumb-icon" />
            <span>Evacuation Centers</span>
          </button>
          <span className="ec-breadcrumb-separator">›</span>
          <button type="button" className="ec-breadcrumb-link" onClick={onBack}>
            {center?.name || 'Evacuation Center'}
          </button>
          <span className="ec-breadcrumb-separator">›</span>
          <span className="ec-breadcrumb-current">{roomTitle}</span>
        </nav>
      </div>

      <header className="ec-title-row ec-room-detail-header">
        <div className="ec-title-info">
          <div className="ec-title-line">
            <h1 id="ec-room-detail-title" className="ec-detail-title">{roomTitle}</h1>
            <HeaderStatusPill status={isInactive ? 'Inactive' : isFull ? 'Full' : 'Available'} />
          </div>
          <div className="ec-title-meta-line">
            <span>{buildingName || 'Unassigned building'}</span>
            {room?.floor && <span>Floor {room.floor}</span>}
          </div>
        </div>
        <div className="ec-title-actions ec-room-detail-actions">
          {onEditRoom && (
            <button type="button" className="ec-btn-secondary-action" onClick={() => onEditRoom(room)}>
              <FontAwesomeIcon icon={faPen} size="xs" />
              <span>Edit room</span>
            </button>
          )}
          {onAddHousehold && (
            <button type="button" className="ec-btn-primary-action" onClick={onAddHousehold}>
              <FontAwesomeIcon icon={faPlus} size="xs" />
              <span>Add household</span>
            </button>
          )}
        </div>
      </header>

      <div className="ec-kpi-strip ec-room-detail-stats">
        <div className="ec-kpi-card">
          <span className="ec-kpi-label">Estimated household capacity</span>
          <span className="ec-kpi-val">{householdCapacity ?? '—'}</span>
        </div>
        <div className="ec-kpi-card">
          <span className="ec-kpi-label">Assigned households</span>
          <span className="ec-kpi-val">{householdAssigned}</span>
        </div>
        <div className="ec-kpi-card">
          <span className="ec-kpi-label">Households arrived</span>
          <span className="ec-kpi-val">{householdArrived}</span>
        </div>
        <div className="ec-kpi-card">
          <span className="ec-kpi-label">Assigned members</span>
          <span className="ec-kpi-val">{totalMembers}</span>
        </div>
      </div>

      <section className="ec-households-card ec-room-households" aria-labelledby="ec-room-households-title">
        <div className="ec-households-card-header ec-room-households-header">
          <div className="ec-households-title-line">
            <h2 id="ec-room-households-title" className="ec-households-card-title">Households in this room</h2>
            <span className="ec-room-households-count">{families.length}</span>
          </div>
          <p>Manage the households assigned to {roomTitle}.</p>
        </div>

        {loading ? (
          <div className="ec-room-households-state" role="status">Loading assigned households…</div>
        ) : error ? (
          <div className="ec-room-households-state" role="alert">
            <span>Could not load this room’s households.</span>
            {onRetry && <button type="button" className="ec-btn-secondary-action" onClick={onRetry}>Try again</button>}
          </div>
        ) : families.length === 0 ? (
          <div className="ec-room-households-empty">
            <FontAwesomeIcon icon={faPeopleGroup} aria-hidden="true" />
            <h3>No households assigned yet</h3>
            <p>Add a household to begin managing this room’s occupants.</p>
            {onAddHousehold && (
              <button type="button" className="ec-btn-primary-action" onClick={onAddHousehold}>
                <FontAwesomeIcon icon={faPlus} size="xs" />
                <span>Add household</span>
              </button>
            )}
          </div>
        ) : (
          <div className="ec-room-households-list">
            {families.map((family, index) => {
              const id = family.family_id ?? family.id ?? `household-${index}`
              const name = family.household_head_name || family.head_name || 'Unnamed household'
              const members = Number(family.member_count || family.family_members || family.assigned_members || 1)
              const arrived = Boolean(family.is_checked_in)
              return (
                <article className="ec-room-household-row" key={id}>
                  <div className="ec-room-household-avatar" aria-hidden="true">
                    {name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'HH'}
                  </div>
                  <div className="ec-room-household-info">
                    <strong>{name}</strong>
                    <span>{members} {members === 1 ? 'member' : 'members'} · {arrived ? 'Arrived' : 'Not arrived'}</span>
                  </div>
                  {arrived && <span className="ec-room-household-arrived">Arrived</span>}
                  {onUnassignHousehold && (
                    <button
                      type="button"
                      className="ec-room-household-remove"
                      onClick={() => onUnassignHousehold(family)}
                      aria-label={`Unassign ${name} from ${roomTitle}`}
                    >
                      Unassign
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

export function StructureTab({
  center,
  rooms = [],
  buildings = [],
  centerFamilies = [],
  onAddBuilding,
  onEditBuilding,
  onDeleteBuilding,
  onAddRoomToBuilding,
  onAddRoom,
  onOpenRoom,
  onEditRoom,
  onViewBuildingMap,
  onPlaceBuilding,
  onAssignHousehold,
  onEditCenter,
}) {
  const structureMode = resolveCenterStructureMode(center)
  const isSingleVenue = structureMode === 'open_area'
  const isPrivateProperty = structureMode === 'rooms_only'
  const canAddBuilding = structureMode === 'buildings_and_rooms'
  const canAddRoom = !isSingleVenue

  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [viewMode, setViewModeState] = useState(getInitialStructureViewMode)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'available' | 'full'
  const [buildingFilter, setBuildingFilter] = useState('all')

  const setViewMode = useCallback((mode) => {
    setViewModeState(mode)
    try {
      localStorage.setItem(STRUCTURE_VIEW_STORAGE_KEY, mode)
    } catch (err) {
      // ignore
    }
  }, [])

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const centerAssigned = Number(
    center?.assigned ?? center?.total_assigned ?? center?.occupied ?? 0
  )
  const centerCapacity = Number(center?.capacity || 0)
  const centerAvailable = Math.max(centerCapacity - centerAssigned, 0)
  const roomFamilyCount = centerFamilies.length || rooms.reduce((count, room) => {
    const families = room?.families || room?.assigned_families
    return count + (Array.isArray(families) ? families.length : 0)
  }, 0)
  const assignedHouseholds = Number(center?.household_assigned ?? roomFamilyCount)
  const averageHouseholdSize = assignedHouseholds > 0
    ? Math.max(1, centerAssigned / assignedHouseholds)
    : null
  const roomHouseholdCapacity = (room) => {
    if (room?.household_capacity != null) return Number(room.household_capacity)
    return averageHouseholdSize != null
      ? Math.floor(Number(room?.capacity || 0) / averageHouseholdSize)
      : null
  }
  const familiesByRoom = useMemo(() => {
    const map = new Map()
    centerFamilies.forEach((family) => {
      if (family?.room_id == null) return
      const roomId = String(family.room_id)
      const key = String(family.family_id ?? family.id ?? family.family_code ?? family.head_name)
      if (!map.has(roomId)) map.set(roomId, new Map())
      map.get(roomId).set(key, family)
    })
    return map
  }, [centerFamilies])
  const roomFamilyRecords = (room) => familiesByRoom.get(String(room?.id))
  const roomHouseholdAssigned = (room) => {
    const familyRecords = roomFamilyRecords(room)
    return familyRecords
      ? familyRecords.size
      : getRoomHouseholdCount(room, averageHouseholdSize)
  }
  const roomHouseholdArrived = (room) => {
    const familyRecords = roomFamilyRecords(room)
    return familyRecords
      ? Array.from(familyRecords.values()).filter((family) => family?.is_checked_in).length
      : getRoomArrivedHouseholdCount(room)
  }

  // Filter helper
  const isRoomMatching = useCallback(
    (room) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const name = String(room?.room_number || `Room #${room?.id || ''}`).toLowerCase()
        if (!name.includes(q)) return false
      }
      if (statusFilter !== 'all') {
        const capacity = roomHouseholdCapacity(room)
        const familyRecords = familiesByRoom.get(String(room?.id))
        const assigned = familyRecords
          ? familyRecords.size
          : getRoomHouseholdCount(room, averageHouseholdSize)
        const st = capacity > 0 && assigned >= capacity ? 'full' : assigned === 0 ? 'empty' : 'available'
        if (statusFilter === 'available' && st === 'full') return false
        if (statusFilter === 'full' && st !== 'full') return false
      }
      return true
    },
    [searchQuery, statusFilter, averageHouseholdSize, familiesByRoom]
  )

  const groups = useMemo(() => {
    if (isSingleVenue) return []

    if (isPrivateProperty || buildings.length === 0) {
      return [{ building: null, rooms }]
    }

    const buildingMap = new Map()
    buildings.forEach((b) =>
      buildingMap.set(String(b.id), { building: b, rooms: [] })
    )
    buildingMap.set('unassigned', { building: null, rooms: [] })

    rooms.forEach((room) => {
      const bid = room.building_id != null ? String(room.building_id) : 'unassigned'
      const group = buildingMap.get(bid) || buildingMap.get('unassigned')
      group.rooms.push(room)
    })

    return Array.from(buildingMap.entries())
      .filter(([, v]) => v.building || v.rooms.length > 0)
      .sort((a, b) => {
        if (a[0] === 'unassigned') return 1
        if (b[0] === 'unassigned') return -1
        const nameA = a[1].building?.name || ''
        const nameB = b[1].building?.name || ''
        return nameA.localeCompare(nameB)
      })
      .map(([, v]) => v)
  }, [isSingleVenue, isPrivateProperty, rooms, buildings])

  const filteredGroups = useMemo(() => {
    if (buildingFilter === 'all') return groups
    return groups.filter(({ building }) =>
      String(building?.id ?? 'unassigned') === buildingFilter
    )
  }, [groups, buildingFilter])
  const selectedRooms = buildingFilter === 'all'
    ? rooms
    : filteredGroups.flatMap((group) => group.rooms)
  const roomCapacityEstimates = selectedRooms.map(roomHouseholdCapacity)
  const displayedCapacity = roomCapacityEstimates.some((capacity) => capacity == null)
    ? null
    : roomCapacityEstimates.reduce((sum, capacity) => sum + capacity, 0)
  const displayedAssigned = selectedRooms.reduce((sum, room) => sum + roomHouseholdAssigned(room), 0)
  const householdCapacityForView = buildingFilter === 'all' && center?.household_capacity != null
    ? Number(center.household_capacity)
    : displayedCapacity
  const householdAssignedForView = buildingFilter === 'all' && center?.household_assigned != null
    ? Number(center.household_assigned)
    : displayedAssigned
  const householdsAvailableForView = buildingFilter === 'all' && center?.household_space_left != null
    ? Number(center.household_space_left)
    : householdCapacityForView == null
      ? null
      : Math.max(0, householdCapacityForView - householdAssignedForView)
  const roomStatus = (room) => {
    const capacity = roomHouseholdCapacity(room)
    const assigned = roomHouseholdAssigned(room)
    if (capacity > 0 && assigned >= capacity) return 'full'
    return assigned === 0 ? 'empty' : 'available'
  }
  const availableCount = selectedRooms.filter((room) => roomStatus(room) !== 'full').length
  const fullCount = selectedRooms.filter((room) => roomStatus(room) === 'full').length
  const totalMatchingRooms = selectedRooms.filter(isRoomMatching).length

  if (isSingleVenue) {
    return (
      <div className="ec-structure-card">
        <div className="ec-structure-header">
          <h3 className="ec-structure-title">Center Structure</h3>
        </div>

        <div className="ec-single-venue-content">
          <div className="ec-single-venue-hero">
            <div className="ec-single-venue-icon-circle">
              <FontAwesomeIcon icon={faBuildingColumns} />
            </div>
            <div className="ec-single-venue-hero-text">
              <h4 className="ec-single-venue-name">{center?.name || 'Open Unified Facility'}</h4>
              <p className="ec-single-venue-desc">
                This center is configured as a single open venue. No individual rooms or separate buildings are required. Households are assigned and managed directly to the center.
              </p>
            </div>
          </div>

          <div className="ec-single-venue-metrics">
            <div className="ec-svm-card">
              <span className="ec-svm-label">Venue Capacity</span>
              <span className="ec-svm-value">{centerCapacity}</span>
            </div>
            <div className="ec-svm-card">
              <span className="ec-svm-label">Assigned Evacuees</span>
              <span className="ec-svm-value">{centerAssigned}</span>
            </div>
            <div className="ec-svm-card">
              <span className="ec-svm-label">Available Capacity</span>
              <span className="ec-svm-value is-available">{centerAvailable}</span>
            </div>
          </div>

          <div className="ec-single-venue-actions">
            {onAssignHousehold && (
              <button type="button" className="ec-btn-primary" onClick={onAssignHousehold}>
                <FontAwesomeIcon icon={faPlus} size="xs" />
                <span>Assign Household</span>
              </button>
            )}
            {onEditCenter && (
              <button type="button" className="ec-btn-secondary" onClick={onEditCenter}>
                <FontAwesomeIcon icon={faPen} size="xs" />
                <span>Edit Center Details</span>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ec-structure-card">
      <div className="ec-structure-header">
        <h3 className="ec-structure-title">Center Structure</h3>

        <div className="ec-structure-actions">
          {canAddBuilding && onAddBuilding && (
            <button type="button" className="ec-btn-secondary" onClick={onAddBuilding}>
              <FontAwesomeIcon icon={faBuilding} size="xs" />
              <span>Add building</span>
            </button>
          )}
          {isPrivateProperty && onAddRoom && (
            <button type="button" className="ec-btn-primary" onClick={onAddRoom}>
              <FontAwesomeIcon icon={faPlus} size="xs" />
              <span>Add room</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Tiles */}
      <div className="ec-structure-summary-strip">
        <div className="ec-ss-tile">
          <span className="ec-ss-label">Total Rooms</span>
          <span className="ec-ss-value">{selectedRooms.length}</span>
        </div>
        <div className="ec-ss-tile">
          <span className="ec-ss-label">Estimated Household Capacity</span>
          <span className="ec-ss-value">{householdCapacityForView ?? '—'}</span>
          {householdCapacityForView == null && (
            <span className="ec-ss-hint">Estimate needs assigned household sizes</span>
          )}
        </div>
        <div className="ec-ss-tile">
          <span className="ec-ss-label">Assigned Households</span>
          <span className="ec-ss-value">{householdAssignedForView}</span>
        </div>
        <div className="ec-ss-tile">
          <span className="ec-ss-label">Available Households</span>
          <span className="ec-ss-value is-available">
            {householdsAvailableForView ?? '—'}
          </span>
        </div>
      </div>

      {/* Toolbar: Search, Filters, and List/Grid Toggle */}
      <div className="ec-structure-toolbar">
        <div className="ec-toolbar-left">
          <div className="ec-search-box">
            <FontAwesomeIcon icon={faSearch} className="ec-search-icon" />
            <input
              type="text"
              className="ec-search-input"
              placeholder="Search room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search room"
            />
            {searchQuery && (
              <button
                type="button"
                className="ec-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          {buildings.length > 0 && (
            <label className="ec-building-filter">
              <span>Building</span>
              <select
                value={buildingFilter}
                onChange={(event) => setBuildingFilter(event.target.value)}
                aria-label="Filter by building"
              >
                <option value="all">All buildings</option>
                {buildings.map((building) => (
                  <option key={building.id} value={String(building.id)}>{building.name}</option>
                ))}
                {rooms.some((room) => room.building_id == null) && (
                  <option value="unassigned">Unassigned rooms</option>
                )}
              </select>
            </label>
          )}

          <div className="ec-status-filter-group" role="group" aria-label="Filter by room status">
            <button
              type="button"
              className={`ec-filter-pill ${statusFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('all')}
              aria-pressed={statusFilter === 'all'}
            >
              All <span className="ec-filter-count">{selectedRooms.length}</span>
            </button>
            <button
              type="button"
              className={`ec-filter-pill ${statusFilter === 'available' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('available')}
              aria-pressed={statusFilter === 'available'}
            >
              Available <span className="ec-filter-count">{availableCount}</span>
            </button>
            <button
              type="button"
              className={`ec-filter-pill ${statusFilter === 'full' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('full')}
              aria-pressed={statusFilter === 'full'}
            >
              Full <span className="ec-filter-count">{fullCount}</span>
            </button>
          </div>
        </div>

        <div className="ec-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`ec-view-toggle-btn ${viewMode === 'list' ? 'is-active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
          >
            <FontAwesomeIcon icon={faList} />
          </button>
          <button
            type="button"
            className={`ec-view-toggle-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <FontAwesomeIcon icon={faTableCellsLarge} />
          </button>
        </div>
      </div>

          {selectedRooms.length === 0 ? (
        <EmptyState
          icon={faDoorOpen}
          title="No rooms yet"
          text={canAddBuilding
            ? 'Add a building first, then add rooms from that building.'
            : canAddRoom
              ? "Click 'Add room' above to add your first room."
              : 'No rooms configured.'}
        />
          ) : totalMatchingRooms === 0 ? (
        <EmptyState
          icon={faSearch}
          title="No rooms found."
          text="No rooms match your search query or filter."
        />
      ) : buildings.length === 0 ? (
        /* Flat list or grid when there are no buildings */
        <div key={viewMode} className="ec-view-animated">
          {viewMode === 'list' ? (
            <table className="ec-structure-table">
              <thead>
                <tr>
                  <th scope="col" className="ec-col-room" style={{ width: '25%', textAlign: 'left' }}>Room</th>
                  <th scope="col" className="ec-col-capacity" style={{ width: '25%', textAlign: 'center' }}>Household capacity</th>
                  <th scope="col" className="ec-col-assigned" style={{ width: '25%', textAlign: 'center' }}>Households assigned</th>
                  <th scope="col" className="ec-col-arrived" style={{ width: '25%', textAlign: 'center' }}>Households arrived</th>
                </tr>
              </thead>
              <tbody>
                {selectedRooms.filter(isRoomMatching).map((room) => (
                  <tr
                    key={room.id}
                    className="ec-room-row"
                    tabIndex={0}
                    role="row"
                    onClick={() => (onOpenRoom || onEditRoom)?.(room)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (onOpenRoom) onOpenRoom(room)
                        else onEditRoom?.(room)
                      }
                    }}
                    style={{ cursor: onOpenRoom || onEditRoom ? 'pointer' : 'default' }}
                  >
                    <td className="ec-col-room" data-label="Room" style={{ textAlign: 'left' }}>{room.room_number || 'Room #' + (room.id || '')}</td>
                    <td className="ec-num ec-col-capacity" data-label="Household capacity" style={{ textAlign: 'center' }} title={roomHouseholdCapacity(room) == null ? 'Estimate needs assigned household sizes' : undefined}>{roomHouseholdCapacity(room) ?? '—'}</td>
                    <td className="ec-num ec-col-assigned" data-label="Households assigned" style={{ textAlign: 'center' }}>{roomHouseholdAssigned(room)}</td>
                    <td className="ec-num ec-col-arrived" data-label="Households arrived" style={{ textAlign: 'center' }}>{roomHouseholdArrived(room)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="ec-rooms-grid" role="list">
              {selectedRooms.filter(isRoomMatching).map((room, idx) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  averageHouseholdSize={averageHouseholdSize}
                  householdAssigned={roomHouseholdAssigned(room)}
                  householdArrived={roomHouseholdArrived(room)}
                  index={idx}
                  onEditRoom={onEditRoom}
                  onOpenRoom={onOpenRoom}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Building groups */
        <div key={viewMode} className="ec-structure-groups ec-view-animated">
          {filteredGroups.map(({ building, rooms: groupRooms }) => {
            const isUnassigned = !building || !building.id
            const groupKey = building?.id != null ? String(building.id) : 'unassigned'
            const isCollapsed = Boolean(collapsedGroups[groupKey])
            const isMapped =
              !isUnassigned &&
              Boolean(
                building.is_mapped ||
                building.properties?.is_mapped ||
                (building.geometry &&
                  building.geometry.coordinates &&
                  building.geometry.coordinates.length > 0)
              )
            const groupAssigned = groupRooms.reduce(
              (sum, room) => sum + roomHouseholdAssigned(room),
              0
            )
            const groupCapacityEstimates = groupRooms.map(roomHouseholdCapacity)
            const groupCapacity = groupCapacityEstimates.some((capacity) => capacity == null)
              ? null
              : groupCapacityEstimates.reduce((sum, capacity) => sum + capacity, 0)
            const groupPct = groupCapacity > 0 ? Math.min(100, Math.round((groupAssigned / groupCapacity) * 100)) : 0

            const filteredGroupRooms = groupRooms.filter(isRoomMatching)

            // If searching or filtering and no rooms match this group, hide group
            if (filteredGroupRooms.length === 0 && (searchQuery.trim() || statusFilter !== 'all')) {
              return null
            }

            return (
              <div key={groupKey} className="ec-structure-group">
                <div
                  className="ec-structure-building-header"
                  onClick={() => toggleGroup(groupKey)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleGroup(groupKey)
                    }
                  }}
                >
                  <div className="ec-sb-header-left">
                    <FontAwesomeIcon
                      icon={isCollapsed ? faChevronRight : faChevronDown}
                      className="ec-sb-chevron"
                    />
                    <h3 className="ec-sb-title">{building?.name || 'Unassigned rooms'}</h3>
                    <span className="ec-sb-meta">
                      {groupRooms.length} {groupRooms.length === 1 ? 'room' : 'rooms'} · {groupAssigned} households assigned
                    </span>
                    {groupCapacity > 0 && (
                      <div
                        className="ec-sb-bar-wrap"
                        title={`${groupAssigned} / ${groupCapacity} households assigned (${groupPct}%)`}
                        aria-label={`${groupAssigned} of ${groupCapacity} households assigned`}
                      >
                        <div
                          className="ec-sb-bar-fill"
                          style={{ width: `${groupPct}%` }}
                        />
                      </div>
                    )}
                    {!isUnassigned && isMapped && (
                      <span className="ec-sb-mapped-pill">Mapped</span>
                    )}
                  </div>

                  {!isUnassigned && (
                    <div
                      className="ec-sb-header-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onAddRoomToBuilding && (
                        <button
                          type="button"
                          className="ec-btn-building-action"
                          onClick={() => onAddRoomToBuilding(building)}
                          title={`Add room to ${building.name}`}
                        >
                          <FontAwesomeIcon icon={faPlus} size="xs" />
                          <span>Add room</span>
                        </button>
                      )}
                      {onEditBuilding && (
                        <button
                          type="button"
                          className="ec-btn-building-action"
                          onClick={() => onEditBuilding(building)}
                          title={`Edit ${building.name}`}
                        >
                          <FontAwesomeIcon icon={faPen} size="xs" />
                          <span>Edit</span>
                        </button>
                      )}
                      {isMapped ? (
                        <>
                          {onViewBuildingMap && (
                            <button
                              type="button"
                              className="ec-btn-building-action"
                              onClick={() => onViewBuildingMap(building)}
                              title={`View ${building.name} on the map`}
                            >
                              <FontAwesomeIcon icon={faLocationDot} size="xs" />
                              <span>View on map</span>
                            </button>
                          )}
                          {onPlaceBuilding && (
                            <button
                              type="button"
                              className="ec-btn-building-action"
                              onClick={() => onPlaceBuilding(building, 'remap')}
                              title={`Remap polygon for ${building.name}`}
                            >
                              <FontAwesomeIcon icon={faArrowsRotate} size="xs" />
                              <span>Remap</span>
                            </button>
                          )}
                        </>
                      ) : (
                        onPlaceBuilding && (
                          <button
                            type="button"
                            className="ec-btn-building-action"
                            onClick={() => onPlaceBuilding(building, 'place_building')}
                            title={`Place ${building.name} footprint on map`}
                          >
                            <FontAwesomeIcon icon={faDrawPolygon} size="xs" />
                            <span>Place building</span>
                          </button>
                        )
                      )}
                      {onDeleteBuilding && (
                        <button
                          type="button"
                          className="ec-btn-building-action is-delete"
                          onClick={() => onDeleteBuilding(building)}
                          title={`Delete ${building.name}`}
                        >
                          <FontAwesomeIcon icon={faTrash} size="xs" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!isCollapsed && (
                  filteredGroupRooms.length === 0 ? (
                    <p className="ec-empty-note">
                      {groupRooms.length === 0
                        ? 'No rooms in this building yet.'
                        : 'No matching rooms found in this building.'}
                    </p>
                  ) : viewMode === 'list' ? (
                    <table className="ec-structure-table">
                      <thead>
                        <tr>
                          <th scope="col" className="ec-col-room" style={{ width: '25%', textAlign: 'left' }}>Room</th>
                          <th scope="col" className="ec-col-capacity" style={{ width: '25%', textAlign: 'center' }}>Household capacity</th>
                          <th scope="col" className="ec-col-assigned" style={{ width: '25%', textAlign: 'center' }}>Households assigned</th>
                          <th scope="col" className="ec-col-arrived" style={{ width: '25%', textAlign: 'center' }}>Households arrived</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGroupRooms.map((room) => (
                          <tr
                            key={room.id}
                            className="ec-room-row"
                            tabIndex={0}
                            role="row"
                            onClick={() => (onOpenRoom || onEditRoom)?.(room)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                if (onOpenRoom) onOpenRoom(room)
                                else onEditRoom?.(room)
                              }
                            }}
                            style={{ cursor: onOpenRoom || onEditRoom ? 'pointer' : 'default' }}
                          >
                            <td className="ec-col-room" data-label="Room" style={{ textAlign: 'left' }}>{room.room_number || 'Room #' + (room.id || '')}</td>
                            <td className="ec-num ec-col-capacity" data-label="Household capacity" style={{ textAlign: 'center' }} title={roomHouseholdCapacity(room) == null ? 'Estimate needs assigned household sizes' : undefined}>{roomHouseholdCapacity(room) ?? '—'}</td>
                            <td className="ec-num ec-col-assigned" data-label="Households assigned" style={{ textAlign: 'center' }}>{roomHouseholdAssigned(room)}</td>
                            <td className="ec-num ec-col-arrived" data-label="Households arrived" style={{ textAlign: 'center' }}>{roomHouseholdArrived(room)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="ec-rooms-grid ec-rooms-grid-grouped" role="list">
                      {filteredGroupRooms.map((room, idx) => (
                        <RoomCard
                          key={room.id}
                          room={room}
                          averageHouseholdSize={averageHouseholdSize}
                          householdAssigned={roomHouseholdAssigned(room)}
                          householdArrived={roomHouseholdArrived(room)}
                          index={idx}
                          onEditRoom={onEditRoom}
                          onOpenRoom={onOpenRoom}
                        />
                      ))}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function HouseholdsTab({
  center,
  centerFamilies = [],
  rooms = [],
  buildings = [],
}) {
  const structureMode = resolveCenterStructureMode(center)
  const isOpenArea = structureMode === 'open_area'
  const showBuildingSub = structureMode === 'buildings_and_rooms'
  const [searchTerm, setSearchTerm] = useState('')

  const buildingById = useMemo(() => {
    const map = new Map()
    buildings.forEach((b) => map.set(String(b.id), b.name))
    return map
  }, [buildings])

  const roomBuildingMap = useMemo(() => {
    const map = new Map()
    rooms.forEach((r) => {
      const bName =
        r.building?.name ||
        (r.building_id != null ? buildingById.get(String(r.building_id)) : null)
      if (bName) {
        if (r.id != null) map.set(String(r.id), bName)
        if (r.room_number) map.set(String(r.room_number).toLowerCase(), bName)
      }
    })
    return map
  }, [rooms, buildingById])

  const totalMembers = centerFamilies.reduce(
    (sum, f) => sum + Number(f.member_count || f.family_members || 1),
    0
  )
  const arrivedCount = centerFamilies.filter((f) => f.is_checked_in).length

  const filteredFamilies = useMemo(() => {
    if (!searchTerm.trim()) return centerFamilies
    const q = searchTerm.toLowerCase().trim()
    return centerFamilies.filter((fam) => {
      const headName = fam.household_head_name || fam.head_name || ''
      return headName.toLowerCase().includes(q)
    })
  }, [centerFamilies, searchTerm])

  return (
    <div className="ec-households-card">
      <div className="ec-households-card-header">
        <div className="ec-households-title-line">
          <h2 className="ec-households-card-title">Households</h2>
          <span className="ec-households-meta-line">
            {totalMembers} individuals · {centerFamilies.length} {centerFamilies.length === 1 ? 'household' : 'households'} · {arrivedCount} arrived
          </span>
        </div>

        <div className="ec-search-box">
          <FontAwesomeIcon icon={faSearch} className="ec-search-icon" />
          <input
            type="text"
            className="ec-search-input"
            placeholder="Search household..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredFamilies.length === 0 ? (
        <EmptyState
          icon={faPeopleGroup}
          title={centerFamilies.length === 0 ? 'No households assigned' : 'No matching households'}
          text={
            centerFamilies.length === 0
              ? 'Households assigned to this evacuation center will appear here.'
              : 'Try searching with a different household head name.'
          }
        />
      ) : (
        <table className="ec-modern-table">
          <thead>
            <tr>
              <th scope="col" style={{ width: '38%' }}>HOUSEHOLD</th>
              <th scope="col" style={{ width: '22%' }}>{isOpenArea ? 'CENTER' : 'ROOM'}</th>
              <th scope="col" style={{ width: '18%' }}>MEMBERS</th>
              <th scope="col" style={{ width: '22%' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {filteredFamilies.map((fam, idx) => {
              const famKey =
                fam.id ?? fam.family_id ?? fam.family_code ?? fam.resident_id ?? `fam-${idx}`
              const headName = fam.household_head_name || fam.head_name || 'Unnamed'
              const initials =
                headName
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0].toUpperCase())
                  .join('') || 'HH'
              const memberCount = fam.member_count || fam.family_members || 1
              const isCheckedIn = Boolean(fam.is_checked_in)
              const roomRaw = !isOpenArea ? (fam.room_number || (fam.room_id ? `Room ${fam.room_id}` : null)) : null
              const hasRoom = Boolean(roomRaw && roomRaw !== 'Not assigned')

              let buildingName = null
              if (hasRoom && showBuildingSub) {
                if (fam.room_id != null && roomBuildingMap.has(String(fam.room_id))) {
                  buildingName = roomBuildingMap.get(String(fam.room_id))
                } else if (roomBuildingMap.has(String(roomRaw).toLowerCase())) {
                  buildingName = roomBuildingMap.get(String(roomRaw).toLowerCase())
                }
              }

              return (
                <tr key={famKey} className="ec-table-row">
                  <td data-label="HOUSEHOLD">
                    <div className="ec-household-user-cell">
                      <div className="ec-avatar-circle" aria-hidden="true">
                        {initials}
                      </div>
                      <div className="ec-household-text">
                        <span className="ec-household-name">{headName}</span>
                        <span className="ec-household-role">Household Head</span>
                      </div>
                    </div>
                  </td>
                  <td data-label={isOpenArea ? 'CENTER' : 'ROOM'}>
                    {isOpenArea ? (
                      <span className="ec-hh-room-name">{center?.name || 'Evacuation Center'}</span>
                    ) : hasRoom ? (
                      <div className="ec-hh-room-cell">
                        <span className="ec-hh-room-name">{roomRaw}</span>
                        {buildingName && (
                          <span className="ec-hh-building-sub">{buildingName}</span>
                        )}
                      </div>
                    ) : (
                      <span className="ec-room-pill is-unassigned">Not assigned</span>
                    )}
                  </td>
                  <td data-label="MEMBERS">
                    <span className="ec-members-chip">
                      <FontAwesomeIcon icon={faUsers} />
                      <span>{memberCount}</span>
                    </span>
                  </td>
                  <td data-label="STATUS">
                    {isCheckedIn ? (
                      <span className="ec-status-pill is-arrived">
                        <span className="ec-status-dot is-arrived" />
                        <span>Arrived</span>
                      </span>
                    ) : (
                      <span className="ec-status-pill is-not-arrived">
                        <span className="ec-status-dot is-not-arrived" />
                        <span>Not arrived</span>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function cleanActivityDescription(action = '') {
  let cleaned = String(action)
    .replace(/\s*\([A-Z0-9_-]{5,}\)/gi, '')
    .replace(/\bChecked in\b/g, 'Arrived')
    .replace(/\bchecked in\b/g, 'arrived')
    .replace(/\bCheck in\b/g, 'Arrive')
    .replace(/\bcheck in\b/g, 'arrive')
  return cleaned.trim()
}

function formatDayHeading(dateString) {
  if (!dateString) return 'Recent'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Recent'

  const today = new Date()
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  if (isToday) return 'Today'

  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  if (isYesterday) return 'Yesterday'

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getWhoDidIt(log) {
  if (log.user_name) {
    const role = log.user_role
      ? log.user_role === 'lgu_personnel'
        ? 'Staff'
        : log.user_role.charAt(0).toUpperCase() + log.user_role.slice(1)
      : 'Staff'
    return `by ${log.user_name} · ${role}`
  }
  return 'by System'
}

export function ActivityTab({ center }) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [centerLogs, setCenterLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(20)

  useEffect(() => {
    let mounted = true
    async function fetchLogs() {
      try {
        setLoading(true)
        const allLogs = await api.getLogs()
        if (!mounted) return
        if (Array.isArray(allLogs)) {
          const cName = (center?.name || '').toLowerCase()
          const matched = allLogs.filter((l) => {
            if (!l.action) return false
            const act = l.action.toLowerCase()
            return (
              act.includes(cName) ||
              act.includes('evacuation center') ||
              act.includes('assigned family') ||
              act.includes('unassigned')
            )
          })
          setCenterLogs(matched.length > 0 ? matched : allLogs.slice(0, 30))
        }
      } catch (err) {
        console.error('Failed to load center activity logs:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchLogs()
    return () => {
      mounted = false
    }
  }, [center?.id, center?.name])

  const assignmentsCount = useMemo(() => {
    return centerLogs.filter((l) => (l.action || '').toLowerCase().includes('assign')).length
  }, [centerLogs])

  const updatesCount = useMemo(() => {
    return centerLogs.filter((l) => !(l.action || '').toLowerCase().includes('assign')).length
  }, [centerLogs])

  const filteredLogs = useMemo(() => {
    if (typeFilter === 'assignments') {
      return centerLogs.filter((l) => (l.action || '').toLowerCase().includes('assign'))
    }
    if (typeFilter === 'updates') {
      return centerLogs.filter((l) => !(l.action || '').toLowerCase().includes('assign'))
    }
    return centerLogs
  }, [centerLogs, typeFilter])

  const visibleLogs = useMemo(() => {
    return filteredLogs.slice(0, visibleCount)
  }, [filteredLogs, visibleCount])

  const groupedLogs = useMemo(() => {
    const groups = []
    let currentGroup = null

    visibleLogs.forEach((log) => {
      const heading = formatDayHeading(log.timestamp)
      if (!currentGroup || currentGroup.heading !== heading) {
        currentGroup = { heading, logs: [log] }
        groups.push(currentGroup)
      } else {
        currentGroup.logs.push(log)
      }
    })

    return groups
  }, [visibleLogs])

  const handleExportCsv = () => {
    if (!filteredLogs || filteredLogs.length === 0) return

    const headers = ['Date & time', 'Type', 'Description', 'Done by', 'Role']

    const escapeCsv = (val) => {
      if (val == null) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    const rows = filteredLogs.map((log) => {
      const dt = log.timestamp
        ? new Date(log.timestamp).toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
        : 'Recent'
      const isAssign = (log.action || '').toLowerCase().includes('assign')
      const type = isAssign ? 'Assignment' : 'Update'
      const desc = cleanActivityDescription(log.action || '')
      const staffName = log.user_name || (log.user_id ? 'Staff' : 'System')
      const role = log.user_role
        ? log.user_role === 'lgu_personnel'
          ? 'Staff'
          : log.user_role.charAt(0).toUpperCase() + log.user_role.slice(1)
        : log.user_name
          ? 'Staff'
          : 'System'

      return [
        escapeCsv(dt),
        escapeCsv(type),
        escapeCsv(desc),
        escapeCsv(staffName),
        escapeCsv(role),
      ].join(',')
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const centerSlug = (center?.name || 'center')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    const dateSlug = new Date().toISOString().split('T')[0]
    a.href = url
    a.download = `activity-log-${centerSlug}-${dateSlug}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="ec-activity-card">
      <div className="ec-activity-card-header">
        <h3 className="ec-activity-card-title">Activity & Audit Log</h3>

        <div className="ec-activity-controls">
          <div className="ec-segmented-control" role="radiogroup">
            <button
              type="button"
              role="radio"
              aria-checked={typeFilter === 'all'}
              className={`ec-segment-btn ${typeFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => {
                setTypeFilter('all')
                setVisibleCount(20)
              }}
            >
              <span>All</span>
              <span className="ec-segment-count">{centerLogs.length}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={typeFilter === 'assignments'}
              className={`ec-segment-btn ${typeFilter === 'assignments' ? 'is-active' : ''}`}
              onClick={() => {
                setTypeFilter('assignments')
                setVisibleCount(20)
              }}
            >
              <span>Assignments</span>
              <span className="ec-segment-count">{assignmentsCount}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={typeFilter === 'updates'}
              className={`ec-segment-btn ${typeFilter === 'updates' ? 'is-active' : ''}`}
              onClick={() => {
                setTypeFilter('updates')
                setVisibleCount(20)
              }}
            >
              <span>Updates</span>
              <span className="ec-segment-count">{updatesCount}</span>
            </button>
          </div>

          <button
            type="button"
            className="ec-btn-export-csv"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            title={filteredLogs.length === 0 ? 'No activity to export' : 'Export shown logs to CSV'}
          >
            <FontAwesomeIcon icon={faDownload} size="xs" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="ec-activity-content">
        {loading ? (
          <div className="ec-activity-loading">
            <div className="ec-activity-spinner" />
            <p>Loading activity history...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="ec-activity-empty">
            <h4 className="ec-activity-empty-title">No Activity Recorded Yet</h4>
            <p className="ec-activity-empty-text">
              Household allocations, transfers, and detail updates for <strong>{center?.name || 'this center'}</strong> will appear here.
            </p>
          </div>
        ) : (
          <div className="ec-activity-timeline-wrap">
            {groupedLogs.map((group) => (
              <div key={group.heading} className="ec-activity-day-group">
                <div className="ec-activity-day-heading">{group.heading}</div>
                <div className="ec-activity-list" role="list">
                  {group.logs.map((log) => {
                    const desc = cleanActivityDescription(log.action || '')
                    const when = log.timestamp
                      ? new Date(log.timestamp).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      : 'Recent'
                    const isAssign = (log.action || '').toLowerCase().includes('assign')
                    const isDanger =
                      (log.action || '').toLowerCase().includes('delete') ||
                      (log.action || '').toLowerCase().includes('remov')

                    return (
                      <div key={log.id} className="ec-activity-item" role="listitem">
                        <div
                          className={`ec-activity-bullet ${isAssign ? 'is-assign' : isDanger ? 'is-danger' : 'is-info'}`}
                          aria-hidden="true"
                        >
                          <FontAwesomeIcon icon={isAssign ? faUsers : faClockRotateLeft} />
                        </div>
                        <div className="ec-activity-item-content">
                          <div className="ec-activity-item-top">
                            <span className="ec-activity-desc">{desc}</span>
                            <span className="ec-activity-time">{when}</span>
                          </div>
                          <span className="ec-activity-by">{getWhoDidIt(log)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {filteredLogs.length > visibleCount && (
              <div className="ec-activity-load-more-wrap">
                <button
                  type="button"
                  className="ec-btn-load-more"
                  onClick={() => setVisibleCount((prev) => prev + 20)}
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
