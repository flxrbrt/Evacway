-- =============================================================================
-- Migration: Add hazard_report_photos table and backfill from hazard_reports
-- =============================================================================
-- Adds hazard_report_photos table to store multiple photos per hazard report.
-- Backfills existing photo_url records into hazard_report_photos with sort_order = 0.
-- Keeps hazard_reports.photo_url for backward compatibility.
-- =============================================================================

CREATE TABLE IF NOT EXISTS hazard_report_photos (
    id SERIAL PRIMARY KEY,
    hazard_report_id INTEGER NOT NULL REFERENCES hazard_reports(id) ON DELETE CASCADE,
    photo_path VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hazard_report_photos_report_id
ON hazard_report_photos(hazard_report_id);

CREATE INDEX IF NOT EXISTS idx_hazard_report_photos_sort_order
ON hazard_report_photos(hazard_report_id, sort_order);

-- Backfill existing single photos from hazard_reports
INSERT INTO hazard_report_photos (hazard_report_id, photo_path, sort_order, created_at)
SELECT id, photo_url, 0, COALESCE(submitted_at, NOW())
FROM hazard_reports
WHERE photo_url IS NOT NULL 
  AND photo_url != ''
  AND id NOT IN (SELECT DISTINCT hazard_report_id FROM hazard_report_photos);
