export function needsLocationConfirmation(location) {
  if (!location || location.is_manual_pin || location.location_source === "manual" || location.location_confirmed === true) {
    return false;
  }
  return location.location_source === "approximate" || Number(location.accuracy) > 100;
}
