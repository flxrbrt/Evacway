import json
from flask import Blueprint, jsonify
from sqlalchemy import func
from models import db, RoadSegment

roads_bp = Blueprint('roads', __name__)


@roads_bp.route('/api/road-segments', methods=['GET'])
def get_road_segments():
    rows = db.session.query(
        RoadSegment.id,
        RoadSegment.road_name,
        RoadSegment.road_type,
        RoadSegment.is_closed,
        RoadSegment.closed_by_report_id,
        func.ST_AsGeoJSON(RoadSegment.geom),
    ).all()
    features = [
        {
            "type": "Feature",
            "geometry": json.loads(geom_json) if geom_json else None,
            "properties": {
                "id": road_id,
                "road_name": road_name,
                "road_type": road_type,
                "is_closed": is_closed,
                "closed_by_report_id": closed_by_report_id,
            },
        }
        for road_id, road_name, road_type, is_closed, closed_by_report_id, geom_json in rows
    ]
    return jsonify({
        "type": "FeatureCollection",
        "features": features,
    })
