-- =============================================================================
-- Backfill Script: Recompute closed_by_report_id for Road Segments
-- =============================================================================
-- Recomputes road closures and closed_by_report_id for all existing validated,
-- unresolved hazard reports (any report type: flood, landslide, blockage, etc.)
-- using the rule:
--   1. If report point is within ~15 m of an intersection node where 3+ segment
--      endpoints meet: close ALL arms meeting at that node, and for each arm
--      extend along the same road_name to the next intersection node.
--   2. Otherwise (mid-block): find nearest road segment, and extend along the
--      same road in both directions to the first intersection node on each side.
--   3. Set is_closed = true and closed_by_report_id = report.id on exactly those segments.
--   4. Reset any other segments to open (is_closed = false, closed_by_report_id = NULL).
--
-- Do not run automatically. Review before manual execution.
-- =============================================================================

BEGIN;

-- 1. Reset all road segments to open state
UPDATE road_segments
SET is_closed = false,
    closed_by_report_id = NULL;

-- 2. Traverse road stretches between intersection nodes for each active hazard report
WITH RECURSIVE
segment_endpoints AS (
    SELECT 
        id,
        road_name,
        geom,
        ST_StartPoint(geom) AS start_pt,
        ST_EndPoint(geom) AS end_pt
    FROM road_segments
),
node_stats AS (
    SELECT 
        pt,
        count(*) AS seg_count,
        count(DISTINCT road_name) AS road_count
    FROM (
        SELECT start_pt AS pt, road_name FROM segment_endpoints
        UNION ALL
        SELECT end_pt AS pt, road_name FROM segment_endpoints
    ) all_pts
    GROUP BY pt
),
intersection_nodes AS (
    -- Any node shared by 3+ segments or segments of different road names
    SELECT pt FROM node_stats
    WHERE seg_count >= 3 OR road_count > 1
),
degree3_nodes AS (
    -- Intersection nodes where 3 or more segment endpoints meet
    SELECT pt FROM node_stats
    WHERE seg_count >= 3
),
validated_reports AS (
    -- Validated, unresolved hazard reports (all report types)
    SELECT id, report_type, status, geom
    FROM hazard_reports
    WHERE status = 'validated'
),
report_intersection_node AS (
    -- Check if report point is within 15 meters of an intersection node (degree >= 3)
    SELECT DISTINCT ON (r.id)
        r.id AS report_id,
        d3.pt
    FROM validated_reports r
    JOIN degree3_nodes d3 ON ST_DWithin(r.geom::geography, d3.pt::geography, 15.0)
    ORDER BY r.id, ST_Distance(r.geom::geography, d3.pt::geography)
),
report_anchors AS (
    -- Intersection report: anchor on ALL arms meeting at the intersection node
    SELECT 
        rin.report_id,
        s.id AS segment_id,
        s.road_name
    FROM report_intersection_node rin
    JOIN segment_endpoints s ON (s.start_pt = rin.pt OR s.end_pt = rin.pt)

    UNION

    -- Mid-block report: anchor on nearest road segment
    SELECT 
        r.id AS report_id,
        s.id AS segment_id,
        s.road_name
    FROM validated_reports r
    LEFT JOIN report_intersection_node rin ON r.id = rin.report_id
    CROSS JOIN LATERAL (
        SELECT s.id, s.road_name
        FROM road_segments s
        ORDER BY s.geom <-> r.geom
        LIMIT 1
    ) s
    WHERE rin.report_id IS NULL
),
road_stretch AS (
    -- Anchor segments for each report
    SELECT 
        ra.report_id,
        ra.segment_id,
        ra.road_name
    FROM report_anchors ra

    UNION

    -- Recursive: extend along the same road in both directions, stopping at the first intersection node
    SELECT 
        rs.report_id,
        next_seg.id AS segment_id,
        next_seg.road_name
    FROM road_stretch rs
    JOIN segment_endpoints curr_seg ON curr_seg.id = rs.segment_id
    JOIN segment_endpoints next_seg ON next_seg.road_name = rs.road_name AND next_seg.id != curr_seg.id
    WHERE (
        -- Extend through curr_seg.start_pt if it is NOT an intersection node
        (curr_seg.start_pt = next_seg.start_pt OR curr_seg.start_pt = next_seg.end_pt)
        AND curr_seg.start_pt NOT IN (SELECT pt FROM intersection_nodes)
    ) OR (
        -- Extend through curr_seg.end_pt if it is NOT an intersection node
        (curr_seg.end_pt = next_seg.start_pt OR curr_seg.end_pt = next_seg.end_pt)
        AND curr_seg.end_pt NOT IN (SELECT pt FROM intersection_nodes)
    )
),
stretch_deduped AS (
    -- In case multiple reports cover the same segment, pick one deterministically
    SELECT DISTINCT ON (segment_id)
        report_id,
        segment_id
    FROM road_stretch
    ORDER BY segment_id, report_id
)
UPDATE road_segments rs
SET 
    is_closed = true,
    closed_by_report_id = sd.report_id
FROM stretch_deduped sd
WHERE rs.id = sd.segment_id;

COMMIT;
