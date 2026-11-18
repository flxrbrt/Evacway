"""Shared Sogod municipality boundary validation for resident submissions."""

import json
from functools import lru_cache
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import unary_union


@lru_cache(maxsize=1)
def _load_boundary():
    backend_root = Path(__file__).resolve().parents[1]
    candidates = (
        backend_root / "data" / "sogod_boundary.geojson",
        backend_root.parent / "frontend" / "public" / "sogod_boundary.geojson",
    )
    boundary_path = next((path for path in candidates if path.is_file()), None)
    if boundary_path is None:
        raise FileNotFoundError("Sogod boundary GeoJSON is not installed")

    with boundary_path.open(encoding="utf-8") as boundary_file:
        geojson = json.load(boundary_file)

    if geojson.get("type") == "FeatureCollection":
        geometries = [
            shape(feature["geometry"])
            for feature in geojson.get("features", [])
            if feature.get("geometry")
        ]
        boundary = unary_union(geometries)
    elif geojson.get("type") == "Feature":
        boundary = shape(geojson["geometry"])
    else:
        boundary = shape(geojson)

    if boundary.is_empty or not boundary.is_valid:
        raise ValueError("Sogod boundary GeoJSON is empty or invalid")
    return boundary


def is_inside_sogod(latitude, longitude):
    """Return whether a WGS84 point falls on or inside the Sogod boundary."""
    return _load_boundary().covers(Point(float(longitude), float(latitude)))
