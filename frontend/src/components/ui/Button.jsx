import './ui.css'

const VALID_VARIANTS = new Set(['primary', 'secondary', 'danger-outline'])

export default function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const safeVariant = VALID_VARIANTS.has(variant) ? variant : 'primary'

  return (
    <button
      type={type}
      className={`ui-btn ui-btn--${safeVariant} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  )
}
