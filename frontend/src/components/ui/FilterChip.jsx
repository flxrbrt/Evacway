import { isValidElement } from 'react'
import './ui.css'

function isComponentIcon(icon) {
  return (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && Boolean(icon.$$typeof))
  )
}

export default function FilterChip({
  label,
  count,
  icon,
  iconSize = 16,
  active = false,
  onClick,
  type = 'button',
  className = '',
  ...rest
}) {
  const renderIcon = () => {
    if (!icon) return null
    if (isValidElement(icon)) return icon
    if (isComponentIcon(icon)) {
      const IconComponent = icon
      return <IconComponent size={iconSize} strokeWidth={2} aria-hidden="true" />
    }
    return null
  }

  return (
    <button
      type={type}
      className={`ui-filter-chip ${active ? 'is-active' : ''} ${className}`.trim()}
      aria-pressed={active}
      onClick={onClick}
      {...rest}
    >
      {icon && (
        <span className="ui-filter-chip__icon" aria-hidden="true">
          {renderIcon()}
        </span>
      )}
      <span>{label}</span>
      {count != null && <span className="ui-filter-chip__count">{count}</span>}
    </button>
  )
}
