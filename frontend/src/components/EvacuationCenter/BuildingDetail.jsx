import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBuildingColumns,
  faChevronDown,
  faEllipsisVertical,
  faMap,
  faPen,
  faPlus,
  faTrash,
  faDrawPolygon,
} from '@fortawesome/free-solid-svg-icons'
import { formatFloorLabel, formatRoomLabel } from '../../utils/formatRoomLabel'
import './CenterDetail.css'
import './BuildingDetail.css'

function roomHouseholdCount(room, familiesByRoom) {
  const assigned = familiesByRoom.get(String(room.id))
  if (assigned) return assigned.length
  return Number(room.household_assigned ?? room.assigned_households ?? 0)
}

export default function BuildingDetail({
  center,
  building,
  rooms = [],
  families = [],
  loading = false,
  notFound = false,
  listHref,
  centerHref,
  onAddRoom,
  onEditBuilding,
  onDeleteBuilding,
  onViewBuildingMap,
  onPlaceBuilding,
  onOpenRoom,
}) {
  const [floorFilter, setFloorFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const floorCount = Math.max(1, Number(building?.floors || 1))

  const familiesByRoom = useMemo(() => {
    const map = new Map()
    families.forEach((family) => {
      if (family?.room_id == null) return
      const key = String(family.room_id)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(family)
    })
    return map
  }, [families])

  const assignedForRoom = (room) => roomHouseholdCount(room, familiesByRoom)
  const capacityUsage = (room) => {
    const familySlots = Math.max(1, Number(room?.family_slots ?? 5))
    const peopleSpaces = Math.max(1, Number(room?.people_spaces ?? room?.capacity ?? 25))
    const usedSlots = Number(room?.used_slots ?? assignedForRoom(room))
    const usedSpaces = Number(room?.used_spaces ?? room?.assigned ?? room?.occupied ?? 0)
    return {
      familySlots,
      peopleSpaces,
      usedSlots,
      usedSpaces,
      full: Boolean(room?.is_full) || usedSlots >= familySlots || usedSpaces >= peopleSpaces,
      over: Boolean(room?.is_over_capacity) || usedSlots > familySlots || usedSpaces > peopleSpaces,
      percent: Math.min(100, Math.round(Math.max(usedSlots / familySlots, usedSpaces / peopleSpaces) * 100)),
    }
  }
  const statusForRoom = (room) => {
    const usage = capacityUsage(room)
    return usage.full ? 'full' : usage.usedSlots === 0 && usage.usedSpaces === 0 ? 'empty' : 'available'
  }

  const buildingRooms = rooms.filter((room) => String(room.building_id ?? '') === String(building?.id ?? ''))
  const matchingRooms = buildingRooms.filter((room) => {
    if (floorFilter === 'unset' && room.floor != null) return false
    if (floorFilter !== 'all' && floorFilter !== 'unset' && String(room.floor ?? '') !== floorFilter) return false
    if (statusFilter === 'available' && statusForRoom(room) === 'full') return false
    if (statusFilter === 'full' && statusForRoom(room) !== 'full') return false
    if (search.trim() && !formatRoomLabel(room.room_number).toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  }).sort((a, b) => Number(statusForRoom(a) === 'full') - Number(statusForRoom(b) === 'full'))

  const totalSlots = buildingRooms.reduce((sum, room) => sum + capacityUsage(room).familySlots, 0)
  const totalSpaces = buildingRooms.reduce((sum, room) => sum + capacityUsage(room).peopleSpaces, 0)
  const usedSlots = buildingRooms.reduce((sum, room) => sum + capacityUsage(room).usedSlots, 0)
  const usedSpaces = buildingRooms.reduce((sum, room) => sum + capacityUsage(room).usedSpaces, 0)
  const availableRooms = buildingRooms.filter((room) => statusForRoom(room) !== 'full').length
  const occupancy = Math.min(100, Math.max(usedSlots / Math.max(totalSlots, 1), usedSpaces / Math.max(totalSpaces, 1)) * 100)
  const status = building?.status || building?.operational_status || building?.building_status || 'open'
  const statusLabel = status === 'under_repair' ? 'Under repair' : status === 'closed' ? 'Closed' : 'Open'
  const floors = Array.from({ length: floorCount }, (_, index) => index + 1)

  if (loading) {
    return <main className="ec-building-detail-page"><div className="ec-building-detail-state" role="status">Loading building details…</div></main>
  }
  if (notFound || !building) {
    return <main className="ec-building-detail-page"><div className="ec-building-detail-state"><h1>Building not found</h1><p>This building may have been deleted or is unavailable.</p><Link to={centerHref}>Back to {center?.name || 'the center'}</Link></div></main>
  }

  const renderRoom = (room) => {
    const usage = capacityUsage(room)
    const arrived = familiesByRoom.get(String(room.id))?.filter((family) => family?.is_checked_in).length ?? Number(room.household_arrived ?? room.arrived_households ?? 0)
    const roomStatus = statusForRoom(room)
    const roomFamilies = familiesByRoom.get(String(room.id)) || []
    const householdNames = roomFamilies.map((family) => family.head_name || family.household_head_name || family.family_name || family.name).filter(Boolean)
    return (
      <button
        key={room.id}
        type="button"
        className={`ec-room-tile is-${roomStatus}`}
        title={householdNames.length ? `Assigned families: ${householdNames.join(', ')}` : `Slots ${usage.usedSlots}/${usage.familySlots} · Spaces ${usage.usedSpaces}/${usage.peopleSpaces}`}
        onClick={() => onOpenRoom?.(room)}
      >
        <span className="ec-room-tile-top">
          <strong>{formatRoomLabel(room.room_number)}</strong>
          <span className={`ec-room-tile-status is-${roomStatus}`}>{usage.over ? 'Over capacity' : roomStatus === 'full' ? 'Full' : roomStatus === 'empty' ? 'Empty' : 'Available'}</span>
        </span>
        <span className="ec-room-tile-capacity" aria-label={`Families ${usage.usedSlots} of ${usage.familySlots}; people ${usage.usedSpaces} of ${usage.peopleSpaces}`}>
          <span><small>Families</small><strong>{usage.usedSlots}<i>/</i>{usage.familySlots}</strong></span>
          <span><small>People</small><strong>{usage.usedSpaces}<i>/</i>{usage.peopleSpaces}</strong></span>
        </span>
        <span className="ec-room-occupancy"><span style={{ width: `${usage.percent}%` }} /></span>
        <span className="ec-room-tile-arrived">{arrived} arrived</span>
      </button>
    )
  }

  return (
    <main className="ec-building-detail-page">
      <nav className="ec-breadcrumb" aria-label="Breadcrumb">
        <Link to={listHref} className="ec-breadcrumb-link"><FontAwesomeIcon icon={faBuildingColumns} className="ec-breadcrumb-icon" /><span>Evacuation Centers</span></Link>
        <span className="ec-breadcrumb-separator">›</span>
        <Link to={centerHref} className="ec-breadcrumb-link">{center?.name || 'Evacuation Center'}</Link>
        <span className="ec-breadcrumb-separator">›</span>
        <span className="ec-breadcrumb-current">{building.name}</span>
      </nav>

      <section className="ec-building-detail-card">
        <header className="ec-building-page-header">
          <div className="ec-building-page-heading">
            <div className="ec-building-page-title-line">
              <h1>{building.name}</h1>
              <span className={`ec-sb-status-pill is-${status}`}><span className="ec-sb-status-dot" />{statusLabel}</span>
            </div>
            <p>{buildingRooms.length} {buildingRooms.length === 1 ? 'room' : 'rooms'} · Slots {usedSlots}/{totalSlots} · Spaces {usedSpaces}/{totalSpaces}</p>
            <div className="ec-building-page-meta">
              <span>{floorCount} {floorCount === 1 ? 'floor' : 'floors'}</span>
              <span>{availableRooms} {availableRooms === 1 ? 'room' : 'rooms'} available</span>
              <span className="ec-building-card-progress" title={`Slots ${usedSlots}/${totalSlots} · Spaces ${usedSpaces}/${totalSpaces}`}><span style={{ width: `${occupancy}%` }} /></span>
            </div>
          </div>
          <div className="ec-building-page-actions">
            <button type="button" className="ec-btn-primary" disabled={status !== 'open'} title={status === 'open' ? 'Add room' : `Room additions are disabled while this building is ${statusLabel.toLowerCase()}`} onClick={onAddRoom}><FontAwesomeIcon icon={faPlus} />Add room</button>
            <div className="ec-building-menu-wrap">
              <button type="button" className="ec-building-menu-trigger" aria-label="Building actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><FontAwesomeIcon icon={faEllipsisVertical} /></button>
              {menuOpen && <div className="ec-building-actions-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEditBuilding?.(building) }}><FontAwesomeIcon icon={faPen} />Edit building</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onPlaceBuilding?.(building, building.is_mapped ? 'remap' : 'place_building') }}><FontAwesomeIcon icon={faDrawPolygon} />{building.is_mapped ? 'Remap building' : 'Place building'}</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onViewBuildingMap?.(building) }}><FontAwesomeIcon icon={faMap} />View on map</button>
                <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); onDeleteBuilding?.(building) }}><FontAwesomeIcon icon={faTrash} />Delete building</button>
              </div>}
            </div>
          </div>
        </header>

        {floorCount > 1 && <div className="ec-floor-tabs" role="tablist" aria-label="Filter rooms by floor">
          <button type="button" role="tab" aria-selected={floorFilter === 'all'} className={floorFilter === 'all' ? 'is-active' : ''} onClick={() => setFloorFilter('all')}>All</button>
          {floors.map((floor) => <button key={floor} type="button" role="tab" aria-selected={floorFilter === String(floor)} className={floorFilter === String(floor) ? 'is-active' : ''} onClick={() => setFloorFilter(String(floor))}>{floor === 1 ? 'Ground' : formatFloorLabel(floor).replace(' floor', '')}</button>)}
          {buildingRooms.some((room) => room.floor == null) && <button type="button" role="tab" aria-selected={floorFilter === 'unset'} className={floorFilter === 'unset' ? 'is-active' : ''} onClick={() => setFloorFilter('unset')}>No floor</button>}
        </div>}

        <div className="ec-building-room-toolbar">
          <label className="ec-building-room-search"><span className="sr-only">Search rooms</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rooms…" /></label>
          <div className="ec-status-filter-group" role="group" aria-label="Filter rooms by status">
            {['all', 'available', 'full'].map((filter) => <button key={filter} type="button" className={`ec-filter-pill ${statusFilter === filter ? 'is-active' : ''}`} aria-pressed={statusFilter === filter} onClick={() => setStatusFilter(filter)}>{filter === 'all' ? 'All' : filter === 'available' ? 'Available' : 'Full'}<span className="ec-filter-count">{filter === 'all' ? buildingRooms.length : filter === 'available' ? availableRooms : buildingRooms.length - availableRooms}</span></button>)}
          </div>
        </div>

        {matchingRooms.length === 0 ? <div className="ec-building-room-empty">No rooms match these filters.</div> : (
          <div className="ec-room-floor-groups">
            {floorCount > 1 && floorFilter === 'all' ? floors.map((floor) => {
              const floorRooms = matchingRooms.filter((room) => Number(room.floor) === floor)
              if (!floorRooms.length) return null
              return <section key={floor}><h2 className="ec-floor-cards-heading">{formatFloorLabel(floor)} · {floorRooms.length} {floorRooms.length === 1 ? 'room' : 'rooms'}</h2><div className="ec-room-tile-grid">{floorRooms.map(renderRoom)}</div></section>
            }) : <div className="ec-room-tile-grid">{matchingRooms.map(renderRoom)}</div>}
            {floorCount > 1 && floorFilter === 'all' && matchingRooms.some((room) => room.floor == null) && <section><h2 className="ec-floor-cards-heading">No floor assigned · {matchingRooms.filter((room) => room.floor == null).length} rooms</h2><div className="ec-room-tile-grid">{matchingRooms.filter((room) => room.floor == null).map(renderRoom)}</div></section>}
          </div>
        )}
      </section>
    </main>
  )
}
