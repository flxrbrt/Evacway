const SHELTER_PATH =
  "M12 2.5L2.5 10.2a1 1 0 0 0 .63 1.78H5v8.02A1.5 1.5 0 0 0 6.5 21.5h11a1.5 1.5 0 0 0 1.5-1.5v-8.02h1.87a1 1 0 0 0 .63-1.78L12 2.5ZM10.75 11h2.5v2.75H16v2.5h-2.75V19h-2.5v-2.75H8v-2.5h2.75V11Z";

export const EVAC_SHELTER_ICON_HTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="${SHELTER_PATH}"/></svg>`;

export function EvacShelterIcon({ size = 18, className = "", ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={SHELTER_PATH} />
    </svg>
  );
}

// Life-buoy rescue SVG (matches Lucide LifeBuoy)
export const EVAC_RESCUE_ICON_HTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m4.93 19.07 4.24-4.24"/></svg>`;

export function EvacRescueIcon({ size = 16, className = "", ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="m4.93 4.93 4.24 4.24" />
      <path d="m14.83 14.83 4.24 4.24" />
      <path d="m14.83 9.17 4.24-4.24" />
      <path d="m4.93 19.07 4.24-4.24" />
    </svg>
  );
}

// Warning triangle SVG for pending hazard review markers
export const EVAC_PENDING_HAZARD_ICON_HTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

export function EvacPendingHazardIcon({ size = 15, className = "", ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
