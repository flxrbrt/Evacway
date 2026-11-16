-- =============================================================================
-- Migration: Add closed_by_report_id to road_segments
-- =============================================================================
-- Adds a nullable column closed_by_report_id referencing hazard_reports(id)
-- with an index for fast lookups.
--
-- Do not run automatically; apply when migrating the database schema.
-- =============================================================================

ALTER TABLE road_segments
ADD COLUMN IF NOT EXISTS closed_by_report_id INTEGER REFERENCES hazard_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_road_segments_closed_by_report_id
ON road_segments(closed_by_report_id);
