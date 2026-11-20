import { forwardRef, isValidElement } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import './ui.css'

function isComponentIcon(icon) {
  return (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && Boolean(icon.$$typeof))
  )
}

function renderControlIcon(icon) {
  if (!icon) return null
  if (isValidElement(icon)) return icon
  if (isComponentIcon(icon)) {
    const IconComponent = icon
    return <IconComponent size={18} strokeWidth={2} aria-hidden="true" />
  }
  return <FontAwesomeIcon icon={icon} aria-hidden="true" />
}

const MapControlButton = forwardRef(function MapControlButton(
  {
    icon,
    children,
    ariaLabel,
    'aria-label': ariaLabelAttr,
    active = false,
    type = 'button',
    className = '',
    ...rest
  },
  ref
) {
  const resolvedAriaLabel = ariaLabel ?? ariaLabelAttr

  if (import.meta.env.DEV && !resolvedAriaLabel) {
    console.warn('MapControlButton requires an `ariaLabel` (or `aria-label`) prop.')
  }

  return (
    <button
      ref={ref}
      type={type}
      aria-label={resolvedAriaLabel}
      className={`ui-map-control-btn ${active ? 'is-active' : ''} ${className}`.trim()}
      {...rest}
    >
      {icon ? (
        <span className="ui-map-control-btn__icon" aria-hidden="true">
          {renderControlIcon(icon)}
        </span>
      ) : (
        children
      )}
    </button>
  )
})

export default MapControlButton
