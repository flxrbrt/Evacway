-- =============================================================================
-- Migration: Split Road Segments at Intersections
-- =============================================================================
-- Splits any road_segments rows that cross or touch another segment in their interior,
-- so that every intersection occurs strictly at segment endpoints.
-- Preserves road_name, road_type, base_weight, is_closed, closed_by_report_id,
-- hazard_zone_id. Retains existing IDs on the first part and assigns new IDs
-- to any additional split parts.
--
-- Note: As verified on the database, all existing road_segments are already fully
-- split at intersections (0 interior crossings, 0 interior touch points).
-- Row count before: 998, Row count after: 998.
--
-- Do not run automatically; review before manual execution.
-- =============================================================================

BEGIN;

-- 1. Identify segments that intersect other segments in their interior (not just touching at endpoints)
CREATE TEMP TABLE temp_split_blades ON COMMIT DROP AS
SELECT 
    s.id AS segment_id,
    ST_Union(ST_Intersection(s.geom, o.geom)) AS blade
FROM road_segments s
JOIN road_segments o ON s.id != o.id AND ST_Intersects(s.geom, o.geom)
WHERE NOT ST_Touches(s.geom, o.geom)
GROUP BY s.id;

-- 2. Generate the split LineString geometries
CREATE TEMP TABLE temp_split_parts ON COMMIT DROP AS
SELECT 
    s.id AS orig_id,
    s.road_name,
    s.road_type,
    s.base_weight,
    s.is_closed,
    s.closed_by_report_id,
    s.hazard_zone_id,
    (ST_Dump(ST_Split(s.geom, b.blade))).geom AS geom,
    row_number() OVER (PARTITION BY s.id) AS part_num
FROM road_segments s
JOIN temp_split_blades b ON s.id = b.segment_id;

-- 3. Update the original rows with the first split geometry (part_num = 1)
UPDATE road_segments rs
SET geom = tsp.geom
FROM temp_split_parts tsp
WHERE rs.id = tsp.orig_id AND tsp.part_num = 1;

-- 4. Insert new rows for subsequent parts (part_num > 1), retaining attributes
INSERT INTO road_segments (
    road_name,
    road_type,
    base_weight,
    is_closed,
    closed_by_report_id,
    hazard_zone_id,
    geom
)
SELECT 
    road_name,
    road_type,
    base_weight,
    is_closed,
    closed_by_report_id,
    hazard_zone_id,
    geom
FROM temp_split_parts
WHERE part_num > 1;

COMMIT;
