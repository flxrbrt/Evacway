/**
 * Formats a room value for display.
 * - Trims the value.
 * - If empty (null, undefined, or empty string), returns "Unassigned".
 * - If only digits (e.g. "3"), returns "Room " + value (e.g. "Room 3").
 * - Otherwise returns the value unchanged (e.g. "Room 3", "Yellow 12", "Tent 1").
 *
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function formatRoomLabel(value) {
  if (value == null) {
    return "Unassigned";
  }

  const str = String(value).trim();
  if (!str) {
    return "Unassigned";
  }

  if (/^\d+$/.test(str)) {
    return `Room ${str}`;
  }

  return str;
}

/** Returns a display label for a floor number, or an empty string for NULL/invalid values. */
export function formatFloorLabel(value) {
  if (value == null || value === "") return "";
  const floor = Number(value);
  if (!Number.isInteger(floor) || floor < 1) return "";
  if (floor === 1) return "Ground floor";
  const lastTwo = floor % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[floor % 10] || "th");
  return `${floor}${suffix} floor`;
}

export default formatRoomLabel;
