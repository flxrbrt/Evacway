import { isValidElement, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import './ui.css'

function isComponentIcon(icon) {
  return (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && Boolean(icon.$$typeof))
  )
}

function renderSegmentIcon(icon, size) {
  if (!icon) return null
  if (isValidElement(icon)) return icon
  if (isComponentIcon(icon)) {
    const IconComponent = icon
    return <IconComponent size={size} strokeWidth={2} aria-hidden="true" />
  }
  return <FontAwesomeIcon icon={icon} aria-hidden="true" />
}

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  ariaLabel = 'Options',
  role = 'tablist',
  size = 'md',
  className = '',
  ...rest
}) {
  const buttonRefs = useRef([])
  const isTablist = role === 'tablist'
  const iconSize = size === 'sm' ? 16 : 16

  function handleKeyDown(event, index) {
    const enabledIndices = options
      .map((opt, idx) => (!opt.disabled ? idx : -1))
      .filter((idx) => idx !== -1)

    if (enabledIndices.length <= 1) return

    const pos = enabledIndices.indexOf(index)
    let nextIdx = null

    if (event.key === 'ArrowRight') {
      nextIdx = enabledIndices[(pos + 1) % enabledIndices.length]
    } else if (event.key === 'ArrowLeft') {
      nextIdx = enabledIndices[(pos - 1 + enabledIndices.length) % enabledIndices.length]
    } else if (event.key === 'Home') {
      nextIdx = enabledIndices[0]
    } else if (event.key === 'End') {
      nextIdx = enabledIndices[enabledIndices.length - 1]
    }

    if (nextIdx !== null) {
      event.preventDefault()
      const nextOption = options[nextIdx]
      buttonRefs.current[nextIdx]?.focus()
      if (nextOption && nextOption.value !== value) {
        onChange?.(nextOption.value)
      }
    }
  }

  return (
    <div
      className={`ui-segmented ${size === 'sm' ? 'ui-segmented--sm' : ''} ${className}`.trim()}
      role={role}
      aria-label={ariaLabel}
      {...rest}
    >
      {options.map((option, index) => {
        const isActive = option.value === value
        const hasCount = option.count != null

        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el
            }}
            type="button"
            role={isTablist ? 'tab' : undefined}
            aria-selected={isTablist ? isActive : undefined}
            aria-pressed={!isTablist ? isActive : undefined}
            aria-label={option.ariaLabel}
            tabIndex={isTablist ? (isActive ? 0 : -1) : 0}
            disabled={option.disabled}
            className={`ui-segmented__item ${isActive ? 'is-active' : ''}`.trim()}
            onClick={() => onChange?.(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {option.icon && (
              <span className="ui-segmented__icon" aria-hidden="true">
                {renderSegmentIcon(option.icon, iconSize)}
              </span>
            )}
            <span className="ui-segmented__label">{option.label}</span>
            {hasCount && (
              <span className="ui-segmented__count" aria-hidden="true">
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
