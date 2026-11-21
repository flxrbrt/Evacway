const VALID_PHONE = /^[+\d().\s-]+$/;

function configuredPhone(value) {
  const phone = String(value || "").trim();
  const digits = phone.replace(/\D/g, "");
  return VALID_PHONE.test(phone) && digits.length >= 7 ? phone : "";
}

export function createEmergencyContacts(env = {}) {
  return {
    hotlines: [
      {
        label: "Municipal DRRMO",
        number: configuredPhone(env.VITE_HOTLINE_MUNICIPAL_DRRMO),
      },
      {
        label: "Sogod Emergency Operations",
        number: configuredPhone(env.VITE_HOTLINE_EMERGENCY_OPERATIONS),
      },
    ].filter((item) => item.number),
    rescueSmsNumber: configuredPhone(env.VITE_RESCUE_SMS_DESTINATION),
  };
}

export function createSmsUri(number, message, platform = "") {
  const recipient = configuredPhone(number).replace(/[^+\d]/g, "");
  if (!recipient || !String(message || "").trim()) return "";

  const body = encodeURIComponent(message);
  const isAppleMobile = /iPhone|iPad|iPod/i.test(platform);
  return isAppleMobile
    ? `sms:${recipient}&body=${body}`
    : `sms:${recipient}?body=${body}`;
}

export function buildRescueMessage({ coordinates, location, people }) {
  const latitude = Number(coordinates?.latitude);
  const longitude = Number(coordinates?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const locationLine = hasCoordinates
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`
    : String(location || "").trim()
      ? `Location: ${String(location).trim()}`
      : "";
  const rawCount = String(people || "").trim();
  const count = /^\d+$/.test(rawCount) ? Number(rawCount) : 0;

  return [
    "I need rescue assistance.",
    locationLine,
    Number.isInteger(count) && count > 0 ? `People needing help: ${count}` : "",
  ].filter(Boolean).join("\n");
}

const environment = import.meta.env || {};
export const emergencyContacts = createEmergencyContacts(environment);
