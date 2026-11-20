import './ui.css'

export default function ProgressBar({
  value = 0,
  max = 100,
  variant = 'capacity',
  size = 'sm',
  className = '',
  ariaLabel,
  ...rest
}) {
  const numericValue = Math.max(0, Number(value) || 0)
  const numericMax = Number(max) || 0
  const rawPct = numericMax > 0 ? (numericValue / numericMax) * 100 : 0
  const clampedPct = Math.min(100, Math.max(0, rawPct))

  const isCompletion =
    variant === 'completion' || variant === 'progress' || variant === 'assignment'

  const toneClass = isCompletion
    ? rawPct >= 100
      ? 'ui-progress__fill--success'
      : ''
    : rawPct >= 100
      ? 'ui-progress__fill--danger'
      : rawPct >= 80
        ? 'ui-progress__fill--warn'
        : ''

  const sizeClass =
    size === 'md' || size === 8 || size === '8px' ? 'ui-progress--md' : ''

  return (
    <div
      className={`ui-progress ${sizeClass} ${className}`.trim()}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={numericValue}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, numericMax)}
      {...rest}
    >
      <div
        className={`ui-progress__fill ${toneClass}`.trim()}
        style={{ width: `${clampedPct}%` }}
      />
    </div>
  )
}
