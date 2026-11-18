const normalize = (value) => String(value ?? "").trim().toLowerCase();
const roomNumber = (value) => normalize(value).replace(/^room\s*/, "");

export function findAssignedRoom(rooms, room) {
  if (!room) return null;
  return (room.id != null && rooms.find((item) => String(item.id) === String(room.id))) ||
    (roomNumber(room.room_number) && rooms.find((item) =>
      roomNumber(item.room_number) === roomNumber(room.room_number))) || null;
}

// Scope name/room-number fallbacks to the assigned center, where numbers repeat.
export function resolveRoomBuilding(room, buildingsGeoJSON, centerId) {
  if (!room) return null;
  const features = (buildingsGeoJSON?.features || []).filter((feature) =>
    centerId == null || String(feature.properties?.evacuation_center_id) === String(centerId));
  const idOf = (feature) => feature.properties?.id ?? feature.id;
  let feature = room.building_id != null
    ? features.find((item) => String(idOf(item)) === String(room.building_id))
    : null;
  if (!feature && normalize(room.building_name)) {
    feature = features.find((item) => normalize(item.properties?.name) === normalize(room.building_name));
  }
  if (!feature && room.id != null) {
    feature = features.find((item) => Array.isArray(item.properties?.rooms) &&
      item.properties.rooms.some((candidate) => String(candidate.id) === String(room.id)));
  }
  if (!feature && roomNumber(room.room_number)) {
    feature = features.find((item) => Array.isArray(item.properties?.rooms) &&
      Boolean(findAssignedRoom(item.properties.rooms, { room_number: room.room_number })));
  }
  if (!feature && room.building_id == null) return null;
  return {
    id: feature ? idOf(feature) : room.building_id,
    name: feature?.properties?.name || room.building_name || "",
    feature: feature || null,
  };
}
