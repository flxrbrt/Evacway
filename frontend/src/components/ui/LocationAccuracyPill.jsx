import { isValidElement } from 'react'
import { AlertTriangle, LocateFixed, MapPin } from 'lucide-react'
import './ui.css'

const VARIANT_CONFIG = {
  gps: {
    label: 'GPS',
    Icon: LocateFixed,
  },
  approximate: {
    label: 'Approximate',
    Icon: AlertTriangle,
  },
  manual: {
    label: 'Manually pinned',
    Icon: MapPin,
  },
}

function isComponentIcon(icon) {
  return (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && Boolean(icon.$$typeof))
  )
}

export default function LocationAccuracyPill({
  variant = 'gps',
  label,
  accuracy,
  accuracyText,
  icon,
  iconSize = 12,
  showIcon = true,
  children,
  className = '',
  ...rest
}) {
  const safeVariant = VARIANT_CONFIG[variant] ? variant : 'gps'
  const config = VARIANT_CONFIG[safeVariant]
  const text = children ?? label ?? config.label

  const resolvedAccuracy =
    accuracyText ??
    (accuracy != null && Number.isFinite(Number(accuracy))
      ? `±${Math.round(Number(accuracy))}m`
      : null)

  const renderIcon = () => {
    if (!showIcon) return null
    const CustomIcon = icon ?? config.Icon
    if (!CustomIcon) return null
    if (isValidElement(CustomIcon)) return CustomIcon
    if (isComponentIcon(CustomIcon)) {
      const IconComponent = CustomIcon
      return <IconComponent size={iconSize} strokeWidth={2.2} aria-hidden="true" />
    }
    return null
  }

  return (
    <span
      className={`ui-location-pill ui-location-pill--${safeVariant} ${className}`.trim()}
      {...rest}
    >
      {showIcon && (
        <span className="ui-location-pill__icon" aria-hidden="true">
          {renderIcon()}
        </span>
      )}
      <span>{text}</span>
      {resolvedAccuracy && (
        <span className="ui-location-pill__accuracy">{resolvedAccuracy}</span>
      )}
    </span>
  )
}
