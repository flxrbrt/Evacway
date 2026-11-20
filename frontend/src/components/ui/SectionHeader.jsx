import { isValidElement } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import './ui.css'

function isComponentIcon(icon) {
  return (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && Boolean(icon.$$typeof))
  )
}

export default function SectionHeader({
  icon,
  iconTone = 'primary',
  iconSize = 16,
  title,
  meta,
  subtitle,
  actions,
  children,
  as: HeadingTag = 'h2',
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
    return <FontAwesomeIcon icon={icon} aria-hidden="true" />
  }

  const toneClass = ['success', 'warn', 'danger', 'neutral'].includes(iconTone)
    ? `ui-section-header__icon--${iconTone}`
    : ''
  const rightSlot = actions ?? children

  return (
    <div className={`ui-section-header ${className}`.trim()} {...rest}>
      <div className="ui-section-header__main">
        {icon && (
          <span
            className={`ui-section-header__icon ${toneClass}`.trim()}
            aria-hidden="true"
          >
            {renderIcon()}
          </span>
        )}
        <div className="ui-section-header__copy">
          <div className="ui-section-header__title-row">
            <HeadingTag className="ui-section-header__title">{title}</HeadingTag>
            {meta != null && <span className="ui-section-header__meta">{meta}</span>}
          </div>
          {subtitle && <p className="ui-section-header__subtitle">{subtitle}</p>}
        </div>
      </div>

      {rightSlot && <div className="ui-section-header__actions">{rightSlot}</div>}
    </div>
  )
}
