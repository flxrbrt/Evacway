import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPlus, faBuilding, faCircleCheck, faTriangleExclamation,
  faCircleStop, faMapPin, faBan, faPen, faLocationDot,
  faFilter, faXmark, faSearch, faHome, faWarehouse,
  faCircleXmark, faDrawPolygon, faChevronRight, faCheck,
} from '@fortawesome/free-solid-svg-icons'

import { useAuth } from '../../context/AuthContext'
import { centerStatus, isCenterMapped } from './utils'
import { statusVariant } from './evacuationStatus'
import { FloatingMenuTrigger } from './FloatingMenu'
import './CenterList.css'

export function AnimatedCount({ value, duration = 400 }) {
  const [displayValue, setDisplayValue] = useState(0)
  const prevValueRef = useRef(0)

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const target = Number(value || 0)

    if (prefersReduced) {
      setDisplayValue(target)
      prevValueRef.current = target
      return
    }

    const start = prevValueRef.current
    if (start === target && displayValue === target) {
      return
    }

    const startTime = performance.now()
    let frameId

    const update = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeProgress = progress * (2 - progress)
      const current = Math.round(start + (target - start) * easeProgress)
      setDisplayValue(current)

      if (progress < 1) {
        frameId = requestAnimationFrame(update)
      } else {
        setDisplayValue(target)
        prevValueRef.current = target
      }
    }

    frameId = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(frameId)
      prevValueRef.current = target
    }
  }, [value, duration])

  return <span>{displayValue}</span>
}

const FILTER_CARDS = [
  {
    key: 'all',
    label: 'All',
    helper: 'Total centers',
    colorToken: 'blue',
    renderIcon: () => (
      <FontAwesomeIcon icon={faBuilding} style={{ width: '18px', height: '18px' }} />
    ),
  },
  {
    key: 'mapped',
    label: 'Mapped',
    helper: 'On the map',
    colorToken: 'green',
    renderIcon: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <polyline points="9 9 11 11 15 7" />
      </svg>
    ),
  },
  {
    key: 'unmapped',
    label: 'Unmapped',
    helper: 'Needs a location',
    colorToken: 'gray',
    renderIcon: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" />
      </svg>
    ),
  },
]

export default function CenterList({
  centers,
  barangays = [],
  onRefresh,
  onAddCenter,
  onEdit,
  onViewMap,
  onAddRooms,
  onDeactivate,
  canDeactivate,
  onRowOpen,
  onBarangayChange,
  onPlaceOnMap,
  loading = false,
  error = '',
  className = '',
}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [searchQuery, setSearchQuery] = useState('')
  const [barangayFilter, setBarangayFilter] = useState('')
  const [barangaySearchText, setBarangaySearchText] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  )
  const [mobileBrgySheetOpen, setMobileBrgySheetOpen] = useState(false)
  const [draftBarangayFilter, setDraftBarangayFilter] = useState('')
  const [mobileSheetSearch, setMobileSheetSearch] = useState('')
  const [mobilePage, setMobilePage] = useState(1)
  const MOBILE_PAGE_SIZE = 10

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia('(max-width: 768px)')
    const syncViewport = (e) => setIsMobileViewport(e.matches)
    mql.addEventListener('change', syncViewport)
    return () => mql.removeEventListener('change', syncViewport)
  }, [])

  const dropdownContainerRef = useRef(null)
  const triggerRef = useRef(null)
  const searchInputRef = useRef(null)
  const listboxRef = useRef(null)

  const selectedBarangayObj = useMemo(() => {
    if (!barangayFilter) return null
    return (
      barangays.find((b) => {
        const id = typeof b === 'object' && b !== null ? b.id : b
        return String(id) === String(barangayFilter)
      }) || null
    )
  }, [barangays, barangayFilter])

  const selectedBarangayName = useMemo(() => {
    if (!selectedBarangayObj) return ''
    return typeof selectedBarangayObj === 'object'
      ? selectedBarangayObj.name || selectedBarangayObj.title || String(selectedBarangayObj.id)
      : String(selectedBarangayObj)
  }, [selectedBarangayObj])

  const filteredBarangayOptions = useMemo(() => {
    const q = barangaySearchText.trim().toLowerCase()
    const allOption = { id: '', name: 'All Barangays' }

    if (!q) {
      const items = barangays.map((b) => ({
        id: String(typeof b === 'object' && b !== null ? b.id : b),
        name: typeof b === 'object' && b !== null ? b.name || b.title || String(b.id) : String(b),
      }))
      return [allOption, ...items]
    }

    const matches = []
    if ('all barangays'.includes(q)) {
      matches.push(allOption)
    }
    barangays.forEach((b) => {
      const id = String(typeof b === 'object' && b !== null ? b.id : b)
      const name = typeof b === 'object' && b !== null ? b.name || b.title || String(b.id) : String(b)
      if (name.toLowerCase().includes(q)) {
        matches.push({ id, name })
      }
    })
    return matches
  }, [barangays, barangaySearchText])

  const handleSelectBarangay = useCallback(
    (id) => {
      const val = id ? String(id) : ''
      setBarangayFilter(val)
      onBarangayChange?.(val)
      setBarangaySearchText('')
      setDropdownOpen(false)
      setMobilePage(1)
      triggerRef.current?.focus()
    },
    [onBarangayChange]
  )

  useEffect(() => {
    if (dropdownOpen) {
      setBarangaySearchText('')
      const selIdx = filteredBarangayOptions.findIndex((opt) => opt.id === barangayFilter)
      const targetIdx = selIdx >= 0 ? selIdx : 0
      setActiveIndex(targetIdx)

      requestAnimationFrame(() => {
        searchInputRef.current?.focus()
        const selectedEl = listboxRef.current?.querySelector('[aria-selected="true"]')
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: 'nearest' })
        }
      })
    } else {
      setBarangaySearchText('')
      setActiveIndex(-1)
    }
  }, [dropdownOpen])

  useEffect(() => {
    if (!dropdownOpen) return
    const handleClickOutside = (e) => {
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target)) {
        setDropdownOpen(false)
        setBarangaySearchText('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [dropdownOpen])

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filteredBarangayOptions.length > 0) {
        setActiveIndex((prev) => {
          const next = prev < filteredBarangayOptions.length - 1 ? prev + 1 : 0
          const activeEl = listboxRef.current?.querySelector(`[data-index="${next}"]`)
          if (activeEl) activeEl.scrollIntoView({ block: 'nearest' })
          return next
        })
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filteredBarangayOptions.length > 0) {
        setActiveIndex((prev) => {
          const next = prev > 0 ? prev - 1 : filteredBarangayOptions.length - 1
          const activeEl = listboxRef.current?.querySelector(`[data-index="${next}"]`)
          if (activeEl) activeEl.scrollIntoView({ block: 'nearest' })
          return next
        })
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < filteredBarangayOptions.length) {
        handleSelectBarangay(filteredBarangayOptions[activeIndex].id)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDropdownOpen(false)
      setBarangaySearchText('')
      triggerRef.current?.focus()
    }
  }

  const handleTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setDropdownOpen(true)
    }
  }

  const activeOptionId =
    dropdownOpen && activeIndex >= 0 && activeIndex < filteredBarangayOptions.length
      ? `ec-barangay-opt-${filteredBarangayOptions[activeIndex].id || 'all'}`
      : undefined

  const allCenters = useMemo(() => {
    const features = Array.isArray(centers?.features) ? centers.features : Array.isArray(centers) ? centers : []
    return features.map((f) => f.properties || f)
  }, [centers])

  const counts = useMemo(() => {
    let mapped = 0
    let unmapped = 0
    allCenters.forEach((cen) => {
      const props = cen.properties || cen
      const isMapped = isCenterMapped(props) || Boolean(props.has_map)
      if (isMapped) {
        mapped += 1
      } else {
        unmapped += 1
      }
    })
    return {
      all: allCenters.length,
      mapped,
      unmapped,
    }
  }, [allCenters])

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (barangayFilter ? 1 : 0) +
    (quickFilter !== 'all' ? 1 : 0)

  const isLoading = loading || centers == null

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return allCenters.filter((cen) => {
      const props = cen.properties || cen
      const name = String(props.name || '').toLowerCase()
      const brgyNames = (Array.isArray(props.barangays) ? props.barangays : [])
        .map((b) => (typeof b === 'string' ? b : b.name || b))
        .join(' ')
        .toLowerCase()
      if (q && !name.includes(q) && !brgyNames.includes(q)) return false
      if (barangayFilter) {
        const brgyList = Array.isArray(props.barangays) ? props.barangays : []
        const matched = brgyList.some((b) => {
          if (typeof b === 'object' && b !== null) {
            return (
              String(b.id) === String(barangayFilter) ||
              (selectedBarangayName && String(b.name || '').toLowerCase() === selectedBarangayName.toLowerCase())
            )
          }
          return (
            String(b) === String(barangayFilter) ||
            (selectedBarangayName && String(b).toLowerCase() === selectedBarangayName.toLowerCase())
          )
        })
        if (!matched && String(props.barangay_id) !== String(barangayFilter)) return false
      }
      const mapped = isCenterMapped(props) || Boolean(props.has_map)
      if (quickFilter === 'mapped' && !mapped) return false
      if (quickFilter === 'unmapped' && mapped) return false
      return true
    })
  }, [allCenters, searchQuery, barangayFilter, selectedBarangayName, quickFilter])

  const handleRefresh = useCallback(() => {
    onRefresh?.()
  }, [onRefresh])

  const handleClearFilters = useCallback(() => {
    setSearchQuery('')
    setBarangayFilter('')
    setBarangaySearchText('')
    onBarangayChange?.('')
    setQuickFilter('all')
    setMobilePage(1)
  }, [onBarangayChange])

  useEffect(() => {
    if (!mobileBrgySheetOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileBrgySheetOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileBrgySheetOpen])

  const mobileSheetOptions = useMemo(() => {
    const q = mobileSheetSearch.trim().toLowerCase()
    const allOpt = { id: '', name: 'All Barangays' }
    const mapped = barangays.map((b) => ({
      id: String(typeof b === 'object' && b !== null ? b.id : b),
      name: typeof b === 'object' && b !== null ? b.name || b.title || String(b.id) : String(b),
    }))
    if (!q) return [allOpt, ...mapped]
    const out = []
    if ('all barangays'.includes(q)) out.push(allOpt)
    mapped.forEach((opt) => {
      if (opt.name.toLowerCase().includes(q)) out.push(opt)
    })
    return out
  }, [barangays, mobileSheetSearch])

  const openMobileBrgySheet = useCallback(() => {
    setDraftBarangayFilter(barangayFilter)
    setMobileSheetSearch('')
    setMobileBrgySheetOpen(true)
  }, [barangayFilter])

  const applyMobileBrgySheet = useCallback(() => {
    const val = draftBarangayFilter ? String(draftBarangayFilter) : ''
    setBarangayFilter(val)
    onBarangayChange?.(val)
    setMobileBrgySheetOpen(false)
    setMobilePage(1)
  }, [draftBarangayFilter, onBarangayChange])

  const resetMobileBrgySheet = useCallback(() => {
    setDraftBarangayFilter('')
    setBarangayFilter('')
    onBarangayChange?.('')
    setMobileSheetSearch('')
    setMobileBrgySheetOpen(false)
    setMobilePage(1)
  }, [onBarangayChange])

  const totalMobilePages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE))
  const safeMobilePage = Math.min(mobilePage, totalMobilePages)
  const mobilePaginated = useMemo(() => {
    const start = (safeMobilePage - 1) * MOBILE_PAGE_SIZE
    return filtered.slice(start, start + MOBILE_PAGE_SIZE)
  }, [filtered, safeMobilePage])

  const handleRetry = useCallback(() => {
    onRefresh?.()
  }, [onRefresh])

  const handleRowOpen = useCallback(
    (feature) => {
      onRowOpen?.(feature)
    },
    [onRowOpen]
  )

  const handleRowKeyDown = useCallback(
    (e, feature) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleRowOpen(feature)
      }
    },
    [handleRowOpen]
  )

  const structureText = useCallback((cen) => {
    const buildingCount = Number(cen.building_count || 0)
    const roomCount = Number(cen.room_count || cen.total_rooms || 0)
    if (buildingCount <= 1) {
      return roomCount > 0 ? `${roomCount} room${roomCount !== 1 ? 's' : ''}` : 'Single venue'
    }
    return `${buildingCount} building${buildingCount !== 1 ? 's' : ''} · ${roomCount} room${roomCount !== 1 ? 's' : ''}`
  }, [])

  const getStatusInfo = useCallback((props, arrived, assigned, cap) => {
    const mapped = isCenterMapped(props) || Boolean(props.has_map)
    if (!mapped) {
      return {
        key: 'unmapped',
        label: 'Unmapped',
      }
    }
    const st = centerStatus(props, arrived, assigned, cap)
    const key = st === 'Near full' ? 'near-full' : st.toLowerCase()
    return {
      key,
      label: st === 'Full' ? 'Shelter full' : st,
    }
  }, [])

  const kebabItems = useCallback(
    (feature) => {
      const props = feature.properties || feature
      const mapped = isCenterMapped(props) || Boolean(props.has_map)
      const items = [
        { label: 'View on map', icon: faLocationDot, onClick: () => onViewMap?.(props) },
      ]
      if (!mapped) {
        items.push({ label: 'Place on map', icon: faDrawPolygon, onClick: () => onPlaceOnMap?.(props) })
      }
      if (isAdmin) {
        items.unshift({ label: 'Edit', icon: faPen, onClick: () => onEdit?.(props) })
        items.splice(1, 0, { label: 'Add rooms', onClick: () => onAddRooms?.(props) })
        if (canDeactivate) {
          items.push({
            label: 'Deactivate center',
            danger: true,
            onClick: () => onDeactivate?.(props),
          })
        }
      }
      return items
    },
    [isAdmin, canDeactivate, onEdit, onViewMap, onAddRooms, onDeactivate, onPlaceOnMap]
  )

  return (
    <section className={`ec-list-page ${className}`.trim()}>
      <header className="ec-list-header">
        <div className="ec-list-title-group">
          <h2 className="ec-list-title">Evacuation Centers</h2>
          <p className="ec-list-subtitle">
            Check shelter capacity, building readiness, and live arrivals across the municipality.
          </p>
        </div>
        <div className="ec-list-controls">
          {isAdmin && onAddCenter && (
            <button
              type="button"
              className="ds-btn ds-btn--primary ec-add-center-btn"
              onClick={onAddCenter}
              aria-label="Add center"
            >
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
              <span className="ec-add-btn-label">Add Center</span>
            </button>
          )}
        </div>
      </header>

      {/* 3 filter cards: All, Mapped, Unmapped */}
      <div className="stat-card-grid cols-3 ec-center-filter-grid" role="group" aria-label="Center filters">
        {FILTER_CARDS.map((card) => {
          const count = counts[card.key]
          const active = quickFilter === card.key
          const iconVariant = card.colorToken === 'blue' ? 'pending' : card.colorToken === 'green' ? 'cleared' : 'neutral'
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={active}
              className={`stat-card is-clickable ${active ? 'is-selected' : ''}`}
              onClick={() => {
                setQuickFilter(card.key)
                setMobilePage(1)
              }}
            >
              <div className="stat-card-content">
                <span className="stat-card-label">{card.label}</span>
                <strong className="stat-card-value"><AnimatedCount value={count} duration={400} /></strong>
                <small className="stat-card-hint">{card.helper}</small>
              </div>
              <span className={`stat-card-icon stat-card-icon--${iconVariant}`} aria-hidden="true">
                {card.renderIcon()}
              </span>
            </button>
          )
        })}
      </div>

      <div className="ec-table-card">
        <div className="ec-table-toolbar" role="toolbar" aria-label="Center list toolbar">
          <div className="ec-toolbar-search">
            <SearchInput
              value={searchQuery}
              onChange={(val) => {
                setSearchQuery(val)
                setMobilePage(1)
              }}
              placeholder={isMobileViewport ? 'Search centers' : 'Search center or barangay…'}
              ariaLabel="Search centers"
            />
          </div>

          <button
            type="button"
            className={`ec-mobile-filter-btn ${barangayFilter ? 'has-active' : ''}`}
            onClick={openMobileBrgySheet}
            aria-label={selectedBarangayName ? `Filter by barangay (${selectedBarangayName})` : 'Filter by barangay'}
            title={selectedBarangayName ? `Barangay: ${selectedBarangayName}` : 'Filter by barangay'}
          >
            <FontAwesomeIcon icon={faFilter} aria-hidden="true" />
            {barangayFilter && <span className="ec-mfilter-dot" aria-hidden="true" />}
          </button>

          <div className="ec-toolbar-select" ref={dropdownContainerRef}>
            <div
              ref={triggerRef}
              id="ec-barangay-select-button"
              className="ds-select ec-barangay-select"
              onClick={() => {
                setDropdownOpen((prev) => !prev)
              }}
              role="combobox"
              tabIndex={0}
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              aria-controls="ec-barangay-listbox"
              aria-label="Barangay filter"
              onKeyDown={handleTriggerKeyDown}
            >
              <span className="ec-barangay-select-text">
                {selectedBarangayName || 'All Barangays'}
              </span>
              {barangayFilter ? (
                <button
                  type="button"
                  className="ec-barangay-clear-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectBarangay('')
                  }}
                  aria-label="Clear barangay filter"
                  title="Clear barangay filter"
                >
                  <FontAwesomeIcon icon={faXmark} size="xs" />
                </button>
              ) : null}
              <FontAwesomeIcon
                icon={faFilter}
                size="xs"
                className="ec-barangay-filter-icon"
                aria-hidden="true"
              />
            </div>

            {dropdownOpen && (
              <div className="ec-dropdown ec-dropdown--open">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="ds-input"
                  placeholder="Search barangays…"
                  value={barangaySearchText}
                  onChange={(e) => {
                    setBarangaySearchText(e.target.value)
                    setActiveIndex(0)
                  }}
                  onKeyDown={handleSearchKeyDown}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls="ec-barangay-listbox"
                  aria-activedescendant={activeOptionId}
                  aria-label="Search barangays"
                />
                <ul id="ec-barangay-listbox" role="listbox" ref={listboxRef}>
                  {filteredBarangayOptions.length === 0 ? (
                    <li className="ec-dropdown-empty" role="status" aria-live="polite">
                      No barangays found
                    </li>
                  ) : (
                    filteredBarangayOptions.map((opt, idx) => {
                      const isSelected = opt.id === barangayFilter
                      const isActive = idx === activeIndex
                      return (
                        <li
                          key={opt.id || 'all'}
                          id={`ec-barangay-opt-${opt.id || 'all'}`}
                          role="option"
                          data-index={idx}
                          aria-selected={isSelected}
                          className={`ec-dropdown-option ${isSelected ? 'is-selected' : ''} ${isActive ? 'is-active' : ''}`}
                          onClick={() => handleSelectBarangay(opt.id)}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          {opt.name}
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm"
              onClick={handleClearFilters}
              aria-label="Clear all filters"
            >
              <FontAwesomeIcon icon={faXmark} size="xs" /> Clear filters
            </button>
          )}
        </div>

        {isLoading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <div className="ec-table-wrapper">
            <div className="ds-empty" role="alert" aria-live="polite">
              <FontAwesomeIcon icon={faBuilding} className="ds-empty__icon" aria-hidden="true" />
              <h2 className="ds-empty__title">Couldn't load centers</h2>
              <p className="ds-empty__text">Check your connection and try again.</p>
              <button type="button" className="ds-btn ds-btn--primary" onClick={handleRetry}>
                Retry
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="ec-table-wrapper">
            <EmptyState
              icon={faBuilding}
              title="No centers match your filters"
              text="Try clearing your filters or adjust your search."
              action={handleClearFilters}
              actionLabel="Clear filters"
            />
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="ec-table-wrapper ec-desktop-table-wrap">
              <table className="ds-table ec-center-table">
                <thead>
                  <tr>
                    <th style={{ width: '32%' }} scope="col">Center</th>
                    <th style={{ width: '24%' }} scope="col">Barangay</th>
                    <th style={{ width: '26%' }} scope="col">Occupancy</th>
                    <th style={{ width: '14%' }} scope="col">Status</th>
                    <th style={{ width: '4%' }} scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((feature) => {
                    const props = feature.properties || feature
                    const id = props.id
                    const name = props.name || 'Unnamed Center'
                    const brgyList = Array.isArray(props.barangays) ? props.barangays : []
                    const brgyShown = brgyList.slice(0, 2).map((b) => ({
                      id: typeof b === 'string' ? b : b.id || b,
                      name: typeof b === 'string' ? b : b.name || b,
                    }))
                    const extraBrgy = Math.max(0, brgyList.length - 2)
                    const allBrgyNames = brgyList.map((b) => (typeof b === 'string' ? b : b.name || b)).join(', ')
                    const cap = Number(props.capacity || 0)
                    const assigned = Number(props.assigned || 0)
                    const arrived = Number(props.occupied || 0)
                    const occupancyPct = cap > 0 ? Math.min(100, Math.round((arrived / cap) * 100)) : 0
                    const { key: statusKey, label: statusLabel } = getStatusInfo(props, arrived, assigned, cap)

                    return (
                      <tr
                        key={id}
                        className="ec-center-row"
                        role="button"
                        tabIndex={0}
                        aria-label={`Open ${name}`}
                        onClick={() => handleRowOpen(feature)}
                        onKeyDown={(e) => handleRowKeyDown(e, feature)}
                      >
                        <td className="ec-cell-center" data-label="Center">
                          <div className="ec-center-name" title={name}>
                            {name}
                          </div>
                          <div className="ec-center-structure">
                            {structureText(props)}
                          </div>
                        </td>
                        <td className="ec-cell-barangay" data-label="Barangay">
                          <div className="ec-barangay-badges">
                            {brgyShown.map((b) => (
                              <span
                                key={b.id}
                                className="ec-barangay-pill"
                                title={b.name}
                              >
                                {b.name}
                              </span>
                            ))}
                            {extraBrgy > 0 && (
                              <span className="ec-barangay-pill ec-barangay-pill--more" title={allBrgyNames}>
                                +{extraBrgy}
                              </span>
                            )}
                            {brgyShown.length === 0 && (
                              <span className="ec-barangay-empty">—</span>
                            )}
                          </div>
                        </td>
                        <td className="ec-cell-occupancy" data-label="Occupancy">
                          <div className="ec-occupancy-cell">
                            <div className="ec-occupancy-bar-track">
                              <div
                                className="ec-occupancy-bar-fill"
                                style={{ width: `${occupancyPct}%` }}
                              />
                            </div>
                            <div className="ec-occupancy-text">
                              <span className="ec-occupancy-assigned">
                                <strong>{arrived}</strong> of {cap} on-site
                              </span>
                              <span className="ec-occupancy-arrived">
                                {assigned} assigned
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="ec-cell-status" data-label="Status">
                          <span className={`ec-status-pill ec-status-pill--${statusKey}`}>
                            <span className="ec-status-dot" aria-hidden="true" />
                            {statusLabel}
                          </span>
                        </td>
                        <td className="ec-cell-actions" data-label="Actions" onClick={(e) => e.stopPropagation()}>
                          <div className="ec-actions-wrap">
                            <FloatingMenuTrigger
                              items={kebabItems(feature)}
                              label={`Actions for ${name}`}
                              align="right"
                            />
                            <FontAwesomeIcon icon={faChevronRight} className="ec-row-chevron" aria-hidden="true" />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (<= 768px) */}
            <div className="ec-mobile-cards">
              {mobilePaginated.map((feature) => {
                const props = feature.properties || feature
                const id = props.id
                const name = props.name || 'Unnamed Center'
                const brgyList = Array.isArray(props.barangays) ? props.barangays : []
                const brgyShown = brgyList.slice(0, 2).map((b) => ({
                  id: typeof b === 'string' ? b : b.id || b,
                  name: typeof b === 'string' ? b : b.name || b,
                }))
                const extraBrgy = Math.max(0, brgyList.length - 2)
                const allBrgyNames = brgyList.map((b) => (typeof b === 'string' ? b : b.name || b)).join(', ')
                const brgyLineText = brgyShown.length > 0
                  ? `${brgyShown.map((b) => b.name).join(', ')}${extraBrgy > 0 ? ` +${extraBrgy}` : ''}`
                  : '—'
                const cap = Number(props.capacity || 0)
                const assigned = Number(props.assigned || 0)
                const arrived = Number(props.occupied || 0)
                const occupancyPct = cap > 0 ? Math.min(100, Math.round((arrived / cap) * 100)) : 0
                const { key: statusKey, label: statusLabel } = getStatusInfo(props, arrived, assigned, cap)

                return (
                  <div
                    key={id}
                    className="ec-mobile-card"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${name}`}
                    onClick={() => handleRowOpen(feature)}
                    onKeyDown={(e) => handleRowKeyDown(e, feature)}
                  >
                    {/* Row 1: Center name (wraps cleanly) + 3-dot button on right */}
                    <div className="ec-mcard-line1">
                      <span className="ec-mcard-name">{name}</span>
                      <div className="ec-mcard-line1-right" onClick={(e) => e.stopPropagation()}>
                        <FloatingMenuTrigger
                          items={kebabItems(feature)}
                          label={`Actions for ${name}`}
                          align="right"
                        />
                      </div>
                    </div>

                    {/* Row 2: Type/rooms + Status pill with dot */}
                    <div className="ec-mcard-line2">
                      <span className="ec-mcard-structure">{structureText(props)}</span>
                      <span className={`ec-status-pill ec-status-pill--${statusKey}`}>
                        <span className="ec-status-dot" aria-hidden="true" />
                        {statusLabel}
                      </span>
                    </div>

                    {/* Row 3: Occupancy bar + assigned / arrived */}
                    <div className="ec-mcard-line3">
                      <div className="ec-occupancy-bar-track">
                        <div
                          className="ec-occupancy-bar-fill"
                          style={{ width: `${occupancyPct}%` }}
                        />
                      </div>
                      <div className="ec-occupancy-text">
                        <span className="ec-occupancy-assigned">
                          <strong>{arrived}</strong> of {cap} on-site
                        </span>
                        <span className="ec-occupancy-arrived">
                          {assigned} assigned
                        </span>
                      </div>
                    </div>

                    {/* Row 4: Plain muted barangays text */}
                    <div className="ec-mcard-line4">
                      <span className="ec-mcard-barangays" title={allBrgyNames || undefined}>
                        {brgyLineText}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <footer className="ec-table-footer">
          Showing <strong>{filtered.length}</strong> of <strong>{allCenters.length}</strong> centers
        </footer>

        {!isLoading && !error && filtered.length > 0 && (
          <nav className="ec-mobile-pagination" aria-label="Center list pagination">
            <button
              type="button"
              className="ec-mpage-btn"
              disabled={safeMobilePage <= 1}
              onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="ec-mpage-indicator">
              Page {safeMobilePage} of {totalMobilePages}
            </span>
            <button
              type="button"
              className="ec-mpage-btn"
              disabled={safeMobilePage >= totalMobilePages}
              onClick={() => setMobilePage((p) => Math.min(totalMobilePages, p + 1))}
            >
              Next
            </button>
          </nav>
        )}
      </div>

      {mobileBrgySheetOpen && (
        <div
          className="ec-mobile-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Filter by barangay"
          onClick={() => setMobileBrgySheetOpen(false)}
        >
          <div className="ec-mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ec-mobile-sheet-header">
              <h3>Barangay</h3>
              <button
                type="button"
                className="ec-mobile-sheet-close"
                onClick={() => setMobileBrgySheetOpen(false)}
                aria-label="Close barangay filter"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="ec-mobile-sheet-search">
              <SearchInput
                value={mobileSheetSearch}
                onChange={setMobileSheetSearch}
                placeholder="Search barangays…"
                ariaLabel="Search barangays"
              />
            </div>
            <div className="ec-mobile-sheet-body" role="listbox" aria-label="Barangays">
              {mobileSheetOptions.length === 0 ? (
                <div className="ec-mobile-sheet-empty">No barangays found</div>
              ) : (
                mobileSheetOptions.map((opt) => {
                  const selected = String(draftBarangayFilter) === String(opt.id)
                  return (
                    <button
                      key={opt.id || 'all'}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`ec-mobile-sheet-option ${selected ? 'is-selected' : ''}`}
                      onClick={() => setDraftBarangayFilter(opt.id)}
                    >
                      <span className="ec-mobile-sheet-option-label">{opt.name}</span>
                      {selected && <FontAwesomeIcon icon={faCheck} className="ec-mobile-sheet-check" aria-hidden="true" />}
                    </button>
                  )
                })
              )}
            </div>
            <div className="ec-mobile-sheet-footer">
              <button
                type="button"
                className="ec-msheet-btn ec-msheet-btn--secondary"
                onClick={resetMobileBrgySheet}
              >
                Reset
              </button>
              <button
                type="button"
                className="ec-msheet-btn ec-msheet-btn--primary"
                onClick={applyMobileBrgySheet}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export function SearchInput({ value, onChange, placeholder, ariaLabel }) {
  const handleChange = (e) => onChange(e.target.value)
  const handleClear = () => onChange('')
  return (
    <div className="si-wrap" role="search" aria-label={ariaLabel}>
      <span className="si-icon" aria-hidden="true"><FontAwesomeIcon icon={faSearch} size="xs" /></span>
      <input className="si-input" type="search" value={value} onChange={handleChange} placeholder={placeholder} aria-label={ariaLabel} spellCheck={false} autoComplete="off" />
      {value && (
        <button type="button" className="si-clear" onClick={handleClear} aria-label="Clear search" title="Clear search">
          <FontAwesomeIcon icon={faXmark} size="xs" />
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon, title = 'No data available', text, action, actionLabel, className = '' }) {
  return (
    <div
      className={`es-empty ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        gap: '12px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {icon && (
        <div
          className="es-icon-box"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'var(--brand-soft, #e8f0fe)',
            color: 'var(--brand, #1B56C4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            marginBottom: '4px',
          }}
        >
          <FontAwesomeIcon icon={icon} className="es-icon" aria-hidden="true" />
        </div>
      )}
      <h2
        className="es-title"
        style={{
          margin: 0,
          fontFamily: 'var(--font-display, inherit)',
          fontSize: 'var(--text-base, 1.125rem)',
          fontWeight: 'var(--weight-semibold, 600)',
          color: 'var(--ink, #0f172a)',
        }}
      >
        {title}
      </h2>
      {text && (
        <p
          className="es-text"
          style={{
            margin: 0,
            fontSize: 'var(--text-sm, 0.875rem)',
            color: 'var(--muted, #64748b)',
            maxWidth: '420px',
            lineHeight: 'var(--line-height-body, 1.5)',
          }}
        >
          {text}
        </p>
      )}
      {action && actionLabel && (
        <button
          type="button"
          className="ds-btn ds-btn--primary es-action"
          onClick={action}
          style={{
            marginTop: '8px',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function OccupancyBar({ assigned = 0, capacity = 0, showLabel = true, className = '' }) {
  const cap = Math.max(0, capacity || 0)
  const as = Math.max(0, Math.min(assigned || 0, cap))
  const occupancy = cap > 0 ? as / cap : 0
  const pctAssigned = cap > 0 ? Math.round(occupancy * 100) : 0
  const hasData = cap > 0
  if (!hasData) {
    return (<div className={`ob-empty ${className}`.trim()} role="text" aria-label="Occupancy: no capacity set">—</div>)
  }
  const label = showLabel ? `${as} of ${cap} assigned, ${pctAssigned}%` : `${as} of ${cap} assigned`
  return (
    <div className={`ob-wrap ${className}`.trim()} role="group" aria-label={label}>
      {showLabel && <span className="ob-label">{label}</span>}
      <div className="ob-bar"><div className="ob-fill" style={{ width: `${pctAssigned}%` }} /></div>
    </div>
  )
}

export function Skeleton({ variant = 'line', count = 3, width, className = '' }) {
  if (variant === 'card') {
    return (<div className={`sk-card ${className}`.trim()} aria-hidden="true"><div className="ds-skeleton ds-skeleton--card" /></div>)
  }
  if (variant === 'table-row') {
    return (
      <div className={`sk-table ${className}`.trim()} role="table" aria-label="Loading rows" aria-busy="true">
        <div className="sk-row" role="rowgroup">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="sk-row-line" role="row">
              {[0, 1, 2].map((j) => (<div key={j} className="sk-cell" role="cell"><div className="ds-skeleton ds-skeleton--text" /></div>))}
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (<div className={`sk-line ${className}`.trim()} aria-hidden="true"><div className="ds-skeleton" style={{ height: 'var(--text-xs)', width: width ?? '100%' }} /></div>)
}

export function SkeletonRows({ count = 4 }) {
  return (
    <div className="ec-table-wrapper">
      <table className="ds-table ec-center-table">
        <thead>
          <tr>
            <th style={{ width: '32%' }}>Center</th>
            <th style={{ width: '24%' }}>Barangay</th>
            <th style={{ width: '26%' }}>Occupancy</th>
            <th style={{ width: '14%' }}>Status</th>
            <th style={{ width: '4%' }} />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count }).map((_, i) => (
            <tr key={i} className="ec-center-row">
              <td style={{ padding: '16px 20px' }}>
                <div className="ds-skeleton ds-skeleton--title" style={{ width: '55%' }} />
                <div className="ds-skeleton" style={{ width: '35%', height: '12px', marginTop: '4px' }} />
              </td>
              <td style={{ padding: '16px 20px' }}>
                <div className="ds-skeleton ds-skeleton--text" style={{ width: '60%' }} />
              </td>
              <td style={{ padding: '16px 20px' }}>
                <div className="ds-skeleton" style={{ height: '6px', borderRadius: '9999px', width: '100%', marginBottom: '6px' }} />
                <div className="ds-skeleton ds-skeleton--text" style={{ width: '50%' }} />
              </td>
              <td style={{ padding: '16px 20px' }}>
                <div className="ds-skeleton" style={{ height: '24px', width: '70px', borderRadius: '9999px' }} />
              </td>
              <td style={{ padding: '16px 20px' }}>
                <div className="ds-skeleton ds-skeleton--btn" style={{ width: '24px', height: '24px' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ICONS = { Available: faCircleCheck, 'Near full': faTriangleExclamation, Full: faCircleStop, Closed: faCircleXmark }
export function StatusBadge({ status = 'Available', className = '' }) {
  const variant = statusVariant(status)
  const Icon = ICONS[status] || faCircleCheck
  return (
    <span className={`sb-badge ds-badge ds-badge--${variant} ${className}`.trim()} title={status} aria-label={status}>
      <FontAwesomeIcon icon={Icon} size="xs" className="sb-icon" />
      {status}
    </span>
  )
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter((p) => p.length > 0)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
}
const SIZE = { small: 28, medium: 'var(--control-height)', large: 48 }
export function Avatar({ name, size = 'medium', className = '' }) {
  const { size: dim } = SIZE[size] ?? SIZE.medium
  const label = initials(name)
  return (
    <span className={`av-avatar av-avatar--${size} ${className}`.trim()} style={{ width: dim, height: dim }} aria-label={name ? `Avatar for ${name}` : undefined} title={name || undefined}>
      {label}
    </span>
  )
}

export function SegmentedControl({ options = [], value, onChange, ariaLabel }) {
  const handleSelect = (optionValue) => { if (optionValue !== value) onChange(optionValue) }
  return (
    <div className="sc-root" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value
        return (
          <button type="button" key={option.value} role="radio" aria-checked={active} className={`sc-button ${active ? 'sc-button--active' : ''}`} onClick={() => handleSelect(option.value)}>
            {option.icon && <FontAwesomeIcon icon={option.icon} size="xs" className="sc-icon" />}
            <span className="sc-label">{option.label}</span>
            {option.count != null && <span className="sc-count">{option.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

const TONE_BG = { neutral: 'var(--neutral-soft)', safe: 'var(--ew-safe-bg)', warning: 'var(--ew-warning-bg)', danger: 'var(--ew-danger-bg)' }
const TONE_TEXT = { neutral: 'var(--ew-text-muted)', safe: 'var(--ew-safe-text)', warning: 'var(--ew-warning-text)', danger: 'var(--ew-danger-text)' }
export function Tag({ label, tone = 'neutral', className = '' }) {
  return (
    <span className={`ds-chip tag tag--${tone} ${className}`.trim()} style={{ backgroundColor: TONE_BG[tone] ?? TONE_BG.neutral, color: TONE_TEXT[tone] ?? TONE_TEXT.neutral }}>
      {label}
    </span>
  )
}
