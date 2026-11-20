import './ui.css'

const ROLE_CONFIG = {
  admin: {
    variant: 'admin',
    label: 'Admin',
  },
  lgu_personnel: {
    variant: 'lgu',
    label: 'LGU Personnel',
  },
  lgu: {
    variant: 'lgu',
    label: 'LGU Personnel',
  },
}

export default function RoleChip({
  role = 'lgu_personnel',
  label,
  children,
  className = '',
  ...rest
}) {
  const normalized = String(role || 'lgu_personnel')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  const config =
    ROLE_CONFIG[normalized] ||
    (normalized.includes('admin') ? ROLE_CONFIG.admin : ROLE_CONFIG.lgu_personnel)

  const text = children ?? label ?? config.label

  return (
    <span
      className={`ui-role-chip ui-role-chip--${config.variant} ${className}`.trim()}
      {...rest}
    >
      {text}
    </span>
  )
}
