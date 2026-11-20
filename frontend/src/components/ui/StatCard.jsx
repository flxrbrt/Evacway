import { isValidElement } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ProgressBar from './ProgressBar'
import './ui.css'

function isComponentIcon(icon) {
  return (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && Boolean(icon.$$typeof))
  )
}

export default function StatCard({
  icon,
  iconTone,
  iconSize = 18,
  tint = 'default',
  valueTone,
  valueColor,
  label,
  value,
  max,
  of: ofTotal,
  progressValue,
  progressMax,
  progressVariant = 'capacity',
  showProgress,
  footer,
  helper,
  onClick,
  href,
  to,
  clickable,
  variant,
  active,
  selected,
  className = '',
  ...rest
}) {
  const denom = max ?? ofTotal
  const hasDenom = denom != null && denom !== ''
  const shouldShowProgress =
    showProgress ?? (progressMax != null || (hasDenom && Number(denom) > 0))
  const barValue = progressValue ?? value ?? 0
  const barMax = progressMax ?? denom ?? 100
  const footerText = footer ?? helper

  const resolvedTint = ['danger', 'success', 'warn', 'primary', 'neutral'].includes(tint)
    ? tint
    : 'default'
  const resolvedIconTone =
    iconTone ?? (resolvedTint !== 'default' ? resolvedTint : 'primary')

  const rawValueTone = valueTone ?? valueColor
  const resolvedValueTone = ['primary', 'success', 'warn', 'danger', 'muted'].includes(
    rawValueTone
  )
    ? rawValueTone
    : null
  const valueToneClass = resolvedValueTone
    ? `ui-stat-card__value--${resolvedValueTone}`
    : ''
  const valueStyle =
    !resolvedValueTone && typeof rawValueTone === 'string' && rawValueTone.startsWith('var(')
      ? { color: rawValueTone }
      : undefined

  const renderIcon = () => {
    if (!icon) return null
    if (isValidElement(icon)) return icon
    if (isComponentIcon(icon)) {
      const IconComponent = icon
      return <IconComponent size={iconSize} strokeWidth={2} aria-hidden="true" />
    }
    return <FontAwesomeIcon icon={icon} aria-hidden="true" />
  }

  const toneClass =
    resolvedIconTone && resolvedIconTone !== 'primary'
      ? `ui-stat-card__icon--${resolvedIconTone}`
      : ''
  const tintClass = resolvedTint !== 'default' ? `ui-stat-card--${resolvedTint}` : ''

  const isRouterLink = Boolean(to)
  const isAnchorLink = !isRouterLink && Boolean(href)
  const isLink = isRouterLink || isAnchorLink
  const isInteractive = Boolean(isLink || onClick || clickable || variant === 'filter')
  const isSelected = Boolean(selected ?? active)
  const Tag = isRouterLink ? Link : isAnchorLink ? 'a' : isInteractive ? 'button' : 'div'
  const interactiveProps = isRouterLink
    ? {
        to,
        onClick,
        'aria-current': isSelected ? 'true' : undefined,
      }
    : isAnchorLink
      ? {
          href,
          onClick,
          'aria-current': isSelected ? 'true' : undefined,
        }
      : isInteractive
        ? {
            type: 'button',
            onClick,
            'aria-pressed': isSelected,
          }
        : {}

  return (
    <Tag
      className={`ui-stat-card ${tintClass} ${isInteractive ? 'ui-stat-card--clickable' : ''} ${isLink ? 'ui-stat-card--link' : ''} ${isSelected ? 'is-active is-selected' : ''} ${className}`.trim()}
      {...interactiveProps}
      {...rest}
    >
      <div className="ui-stat-card__top">
        {icon && (
          <span className={`ui-stat-card__icon ${toneClass}`.trim()} aria-hidden="true">
            {renderIcon()}
          </span>
        )}
        {label && <span className="ui-stat-card__label">{label}</span>}
      </div>

      <div className="ui-stat-card__metric">
        <span
          className={`ui-stat-card__value ${valueToneClass}`.trim()}
          style={valueStyle}
        >
          {value ?? '—'}
        </span>
        {hasDenom && <span className="ui-stat-card__of">of {denom}</span>}
      </div>

      {shouldShowProgress && (
        <ProgressBar
          value={barValue}
          max={barMax}
          variant={progressVariant}
          ariaLabel={label ? `${label} progress` : undefined}
        />
      )}

      {footerText && <div className="ui-stat-card__footer">{footerText}</div>}
    </Tag>
  )
}
