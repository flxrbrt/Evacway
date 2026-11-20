# EvacWay Design Guide

Shared UI tokens live in `frontend/src/index.css` and shared UI primitives live in `frontend/src/components/ui/`.

## StatCard

Component: `frontend/src/components/ui/StatCard.jsx`  
Styles: `.ui-stat-card` in `frontend/src/components/ui/ui.css`

### Default Variant
- Surface: `--surface` with `1px solid var(--border)`, `--radius-lg`, `--shadow-xs`.
- Renders as a `<div>` when non-interactive.
- Supports optional semantic tints (`primary`, `success`, `warn`, `danger`, `neutral`) and optional progress bars.

### Clickable Filter Variant
Use when KPI stat cards act as single-select filters for the list below (for example on Users, Resident Registrations, Hazard Reports, Rescue Alerts, Evacuation Centers, and Evacuee Arrival).

- **Semantics:** Renders as a real `<button type="button">` with `aria-pressed="true" | "false"` when `onClick`, `clickable`, or `variant="filter"` is passed.
- **Default state:** Identical to the normal `StatCard` (`--surface`, `1px solid var(--border)`, `--radius-lg`, `--shadow-xs`).
- **Hover state (150ms):** `box-shadow: var(--shadow-md)`, `transform: translateY(-1px)`, and `border-color: var(--primary-200)`.
- **Selected state (`selected` / `active` / `aria-pressed="true"`):** `1px solid var(--primary)` border plus a `3px` blue ring via `box-shadow: var(--shadow-focus)` (`0 0 0 3px rgba(37, 99, 235, 0.15)`).
- **Focus-visible:** `2px solid var(--primary)` outline with `outline-offset: 2px`.
- **Reduced motion (`prefers-reduced-motion: reduce`):** Transitions and `translateY(-1px)` hover transform are disabled.

### Link Variant
Use when KPI stat cards navigate to another page or operational view (for example on the Dashboard).

- **Semantics:** Renders as a real `<a>` (via React Router `Link` when `to` is passed, or native `<a href>` when `href` is passed) with no underline or visited-color override.
- **Default & Tint States:** Normal `StatCard` styling (`--surface`, `1px solid var(--border)`, `--radius-lg`, `--shadow-xs`) plus optional `danger`, `warn`, and `success` tints.
- **Hover state (150ms):** `box-shadow: var(--shadow-md)`, `transform: translateY(-1px)`, and `border-color: var(--primary-200)`.
- **Focus-visible:** `2px solid var(--primary)` outline with `outline-offset: 2px`.
- **Reduced motion (`prefers-reduced-motion: reduce`):** Transitions and `translateY(-1px)` hover transform are disabled.

## ProgressBar

Component: `frontend/src/components/ui/ProgressBar.jsx`

- **Capacity rule (`variant="capacity"`, default):** `--primary` under `80%`, `--warn` from `80%` to `<100%`, and `--danger` at `100%`.
- **Sizes:** `6px` (`size="sm"` / `6`, default) and `8px` (`size="md"` / `8`).
- **Reduced motion:** Fill width transition is disabled under `prefers-reduced-motion: reduce`.

## SectionHeader

Component: `frontend/src/components/ui/SectionHeader.jsx`

- `32px` icon tile (`--primary-50` background with `--primary` icon) paired with a `16px/600` (`--text-card-title`) section title, optional muted metadata/subtitle, and optional right-aligned actions slot.

## StatusPill

Component: `frontend/src/components/ui/StatusPill.jsx`

- `active` / `available`: success tone (`--success-bg` background, `--success-fg` text, `--success` dot).
- `inactive`: neutral grey tone (`--neutral-soft` background, `--neutral-fg` text, `--neutral-dot` dot).
- `unmapped` / `not-mapped` (`Not mapped`): neutral grey Unmapped pill (`--neutral-soft` background, `--neutral-fg` text, `--neutral-dot` dot).
- `fully-assigned` (`Fully assigned`): warn tone (`--warn-bg` background, `--warn-fg` text, `--warn` dot).
- Also supports existing domain variants (`arrived`, `approved`, `pending`, `rejected`, `validated`, `resolved`, `responding`, `full`, `almost-full`, `partial`, etc.).

## RoleChip

Component: `frontend/src/components/ui/RoleChip.jsx`

- `admin` (`Admin`): `--primary-50` background with `--primary-hover` (`#1D4ED8`) text.
- `lgu_personnel` (`LGU Personnel`): `--surface` (white) background with `1px solid var(--border)` and `--text-2` text.

## SegmentedControl

Component: `frontend/src/components/ui/SegmentedControl.jsx`

- Container: `--segmented-bg` (`#E9EDF3`), `padding: 3px`, `--radius-md`, `1px solid var(--border)`.
- Active segment: `--surface` (white) with `--shadow-xs` and `--text` `600` weight.
- Supports `fullWidth` for equal-width tabs inside side panels.

## MapControlButton

Component: `frontend/src/components/ui/MapControlButton.jsx`

- `40px × 40px` `<button type="button">`, `--surface` (white), `--radius-md`, `--shadow-md`, no border, `18px` icon.
- Requires `ariaLabel` (or `aria-label`).
- `2px solid var(--primary)` focus outline; respects `prefers-reduced-motion: reduce`.

## MapOverlayPanel

Component: `frontend/src/components/ui/MapOverlayPanel.jsx`

- Floating map panel surface: `--surface` (white), `1px solid var(--border)`, `--radius-2xl`, `--shadow-md`.
- Supports polymorphic `as` (`section`, `aside`, `div`, etc.).
