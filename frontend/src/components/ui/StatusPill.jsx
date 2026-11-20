import './ui.css'

const DEFAULT_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  available: 'Available',
  arrived: 'Arrived',
  'almost-full': 'Almost full',
  partial: 'Partial',
  full: 'Full',
  unmapped: 'Unmapped',
  neutral: 'Pending',
  'pending-arrival': 'Pending',
  open: 'Open',
  sheltered: 'Sheltered',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  'no-records': 'No records',
  pending: 'Pending',
  approved: 'Approved',
  acknowledged: 'Acknowledged',
  responding: 'Responding',
  'in-progress': 'Responding',
  in_progress: 'Responding',
  validated: 'Validated',
  danger: 'Alert',
  success: 'Clear',
  resolved: 'Resolved',
  rejected: 'Rejected',
}

export default function StatusPill({
  variant = 'available',
  tone,
  label,
  children,
  className = '',
  ...rest
}) {
  const safeVariant = DEFAULT_LABELS[variant] ? variant : 'available'
  const safeTone = ['neutral', 'warn', 'success', 'danger', 'primary'].includes(tone)
    ? tone
    : null
  const toneClass = safeTone ? `ui-status-pill--tone-${safeTone}` : ''
  const rawText = children ?? label ?? DEFAULT_LABELS[safeVariant]
  const text =
    typeof rawText === 'string' && rawText.length > 0
      ? rawText.charAt(0).toUpperCase() + rawText.slice(1)
      : rawText

  return (
    <span
      className={`ui-status-pill ui-status-pill--${safeVariant} ${toneClass} ${className}`.trim()}
      {...rest}
    >
      <span className="ui-status-pill__dot" aria-hidden="true" />
      <span>{text}</span>
    </span>
  )
}
