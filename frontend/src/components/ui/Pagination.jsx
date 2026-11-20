import { ChevronLeft, ChevronRight } from 'lucide-react'
import './ui.css'

export function PaginationButton({
  active = false,
  iconOnly = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      aria-current={active ? 'page' : undefined}
      className={`ui-page-btn ${active ? 'is-active' : ''} ${iconOnly ? 'ui-page-btn--icon' : ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  )
}

function getPaginationRange(currentPage, totalPages) {
  const pages = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i)
    return pages
  }
  pages.push(1)
  if (currentPage > 3) pages.push('...')
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)
  for (let i = start; i <= end; i += 1) {
    if (!pages.includes(i)) pages.push(i)
  }
  if (currentPage < totalPages - 2) pages.push('...')
  if (!pages.includes(totalPages)) pages.push(totalPages)
  return pages
}

export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  disabled = false,
  showPageNumbers = true,
  prevLabel = 'Previous',
  nextLabel = 'Next',
  iconSize = 16,
  className = '',
}) {
  const safePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages))
  const pages = showPageNumbers && totalPages >= 1 ? getPaginationRange(safePage, totalPages) : []

  return (
    <nav className={`ui-pagination ${className}`.trim()} aria-label="Pagination">
      <PaginationButton
        disabled={disabled || safePage <= 1}
        onClick={() => onPageChange?.(Math.max(1, safePage - 1))}
        aria-label="Previous page"
      >
        <ChevronLeft size={iconSize} strokeWidth={2} aria-hidden="true" />
        {prevLabel && <span>{prevLabel}</span>}
      </PaginationButton>

      {pages.length > 0 && (
        <div className="ui-pagination__pages">
          {pages.map((item, idx) =>
            item === '...' ? (
              <span key={`ellipsis-${idx}`} className="ui-pagination__ellipsis" aria-hidden="true">
                …
              </span>
            ) : (
              <PaginationButton
                key={`page-${item}`}
                active={item === safePage}
                disabled={disabled}
                onClick={() => onPageChange?.(item)}
                aria-label={`Page ${item}`}
              >
                {item}
              </PaginationButton>
            )
          )}
        </div>
      )}

      <PaginationButton
        disabled={disabled || safePage >= totalPages}
        onClick={() => onPageChange?.(Math.min(totalPages, safePage + 1))}
        aria-label="Next page"
      >
        {nextLabel && <span>{nextLabel}</span>}
        <ChevronRight size={iconSize} strokeWidth={2} aria-hidden="true" />
      </PaginationButton>
    </nav>
  )
}
