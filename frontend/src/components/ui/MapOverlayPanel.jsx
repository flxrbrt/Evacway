import { forwardRef } from 'react'
import './ui.css'

const MapOverlayPanel = forwardRef(function MapOverlayPanel(
  { as = 'section', className = '', children, ...rest },
  ref
) {
  const Component = as
  return (
    <Component
      ref={ref}
      className={`ui-map-panel ${className}`.trim()}
      {...rest}
    >
      {children}
    </Component>
  )
})

export default MapOverlayPanel
