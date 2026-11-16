import re
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, or_

from models import (
    db,
    CenterType,
    BuildingMaterial,
    Amenity,
    AccessibilityFeature,
    center_amenities,
    EvacuationCenter,
    SystemLog,
)
from utils import role_required

reference_options_bp = Blueprint('reference_options', __name__)

VALID_STRUCTURE_MODES = {'open_area', 'rooms_only', 'buildings_and_rooms'}


def slugify(text):
    text = str(text or '').strip().lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')


def _serialize_with_usage(item, in_use_count):
    payload = item.to_dict()
    payload['in_use_count'] = int(in_use_count or 0)
    return payload


def _center_type_usage_map():
    rows = (
        db.session.query(EvacuationCenter.center_type_id, func.count(EvacuationCenter.id))
        .group_by(EvacuationCenter.center_type_id)
        .all()
    )
    return {cid: count for cid, count in rows if cid is not None}


def _building_material_usage_map():
    rows = (
        db.session.query(EvacuationCenter.building_material_id, func.count(EvacuationCenter.id))
        .group_by(EvacuationCenter.building_material_id)
        .all()
    )
    return {bid: count for bid, count in rows if bid is not None}


def _amenity_usage_map():
    rows = (
        db.session.query(center_amenities.c.amenity_id, func.count(center_amenities.c.center_id))
        .group_by(center_amenities.c.amenity_id)
        .all()
    )
    return {aid: count for aid, count in rows if aid is not None}


def _name_conflict(model_cls, name, exclude_id=None):
    query = model_cls.query.filter(func.lower(model_cls.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(model_cls.id != exclude_id)
    return query.first() is not None


def _code_conflict(model_cls, code, exclude_id=None):
    query = model_cls.query.filter(func.lower(model_cls.code) == code.lower())
    if exclude_id is not None:
        query = query.filter(model_cls.id != exclude_id)
    return query.first() is not None


# =========================================================
# 1. CENTER TYPES CRUD (/api/center-types)
# =========================================================
@reference_options_bp.route('/api/center-types', methods=['GET'])
def get_center_types():
    active_only = request.args.get('active_only', '').strip().lower() in ('true', '1')
    search = request.args.get('search', '').strip()

    query = CenterType.query
    if active_only:
        query = query.filter_by(is_active=True)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                CenterType.name.ilike(search_pattern),
                CenterType.code.ilike(search_pattern),
                CenterType.description.ilike(search_pattern),
            )
        )

    rows = query.order_by(CenterType.display_order.asc(), CenterType.name.asc()).all()
    usage_map = _center_type_usage_map()
    return jsonify([_serialize_with_usage(r, usage_map.get(r.id, 0)) for r in rows]), 200


@reference_options_bp.route('/api/center-types', methods=['POST'])
@jwt_required()
@role_required('admin')
def create_center_type():
    data = request.get_json() or {}
    name = str(data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "Center type name is required", "field": "name"}), 400

    if _name_conflict(CenterType, name):
        return jsonify({"error": f"Center type named '{name}' already exists", "field": "name"}), 409

    raw_code = str(data.get('code') or '').strip().lower()
    code = slugify(raw_code) if raw_code else slugify(name)
    if not code:
        return jsonify({"error": "A valid identifier code is required", "field": "code"}), 400

    if _code_conflict(CenterType, code):
        return jsonify({"error": f"Center type with code '{code}' already exists", "field": "code"}), 409

    structure_mode = str(data.get('structure_mode') or '').strip().lower()
    if structure_mode not in VALID_STRUCTURE_MODES:
        return jsonify({"error": "Structure is required", "field": "structure_mode"}), 400

    item = CenterType(
        name=name,
        code=code,
        description=str(data.get('description') or '').strip() or None,
        structure_mode=structure_mode,
        is_active=bool(data.get('is_active', True)),
        display_order=int(data.get('display_order', 0) or 0),
    )
    db.session.add(item)
    db.session.commit()

    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Created center type: {name} ({code}, {structure_mode})"))
    db.session.commit()

    return jsonify(_serialize_with_usage(item, 0)), 201


@reference_options_bp.route('/api/center-types/<int:item_id>', methods=['PUT'])
@jwt_required()
@role_required('admin')
def update_center_type(item_id):
    item = CenterType.query.get(item_id)
    if not item:
        return jsonify({"error": "Center type not found"}), 404

    data = request.get_json() or {}
    if 'name' in data:
        name = str(data['name'] or '').strip()
        if not name:
            return jsonify({"error": "Name cannot be empty", "field": "name"}), 400
        if _name_conflict(CenterType, name, exclude_id=item_id):
            return jsonify({"error": f"Center type named '{name}' already exists", "field": "name"}), 409
        item.name = name

    if 'code' in data:
        new_code = slugify(data['code'])
        if not new_code:
            return jsonify({"error": "Code cannot be empty", "field": "code"}), 400
        if new_code != item.code:
            if _code_conflict(CenterType, new_code, exclude_id=item_id):
                return jsonify({"error": f"Center type with code '{new_code}' already exists", "field": "code"}), 409
            item.code = new_code

    if 'structure_mode' in data:
        structure_mode = str(data.get('structure_mode') or '').strip().lower()
        if structure_mode not in VALID_STRUCTURE_MODES:
            return jsonify({"error": "Structure is required", "field": "structure_mode"}), 400
        item.structure_mode = structure_mode

    if 'description' in data:
        item.description = str(data['description'] or '').strip() or None

    if 'is_active' in data:
        item.is_active = bool(data['is_active'])

    if 'display_order' in data:
        try:
            item.display_order = int(data['display_order'])
        except (ValueError, TypeError):
            pass

    db.session.commit()
    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Updated center type: {item.name}"))
    db.session.commit()

    in_use_count = EvacuationCenter.query.filter_by(center_type_id=item_id).count()
    return jsonify(_serialize_with_usage(item, in_use_count)), 200


@reference_options_bp.route('/api/center-types/<int:item_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_center_type(item_id):
    item = CenterType.query.get(item_id)
    if not item:
        return jsonify({"error": "Center type not found"}), 404

    in_use_count = EvacuationCenter.query.filter_by(center_type_id=item_id).count()
    if in_use_count > 0:
        return jsonify({
            "error": f"Center type '{item.name}' cannot be deleted because it is used by {in_use_count} evacuation center(s).",
            "blocked": True,
            "in_use_count": in_use_count
        }), 409

    name = item.name
    db.session.delete(item)
    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Deleted center type: {name}"))
    db.session.commit()
    return jsonify({"message": f"Center type '{name}' deleted successfully", "deleted": True}), 200


# =========================================================
# 2. BUILDING MATERIALS CRUD (/api/building-materials)
# =========================================================
@reference_options_bp.route('/api/building-materials', methods=['GET'])
def get_building_materials():
    active_only = request.args.get('active_only', '').strip().lower() in ('true', '1')
    search = request.args.get('search', '').strip()

    query = BuildingMaterial.query
    if active_only:
        query = query.filter_by(is_active=True)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                BuildingMaterial.name.ilike(search_pattern),
                BuildingMaterial.code.ilike(search_pattern),
                BuildingMaterial.description.ilike(search_pattern),
            )
        )

    rows = query.order_by(BuildingMaterial.display_order.asc(), BuildingMaterial.name.asc()).all()
    usage_map = _building_material_usage_map()
    return jsonify([_serialize_with_usage(r, usage_map.get(r.id, 0)) for r in rows]), 200


@reference_options_bp.route('/api/building-materials', methods=['POST'])
@jwt_required()
@role_required('admin')
def create_building_material():
    data = request.get_json() or {}
    name = str(data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "Building material name is required", "field": "name"}), 400

    if _name_conflict(BuildingMaterial, name):
        return jsonify({"error": f"Building material named '{name}' already exists", "field": "name"}), 409

    raw_code = str(data.get('code') or '').strip().lower()
    code = slugify(raw_code) if raw_code else slugify(name)
    if not code:
        return jsonify({"error": "A valid identifier code is required", "field": "code"}), 400

    if _code_conflict(BuildingMaterial, code):
        return jsonify({"error": f"Building material with code '{code}' already exists", "field": "code"}), 409

    item = BuildingMaterial(
        name=name,
        code=code,
        description=str(data.get('description') or '').strip() or None,
        is_active=bool(data.get('is_active', True)),
        display_order=int(data.get('display_order', 0) or 0),
    )
    db.session.add(item)
    db.session.commit()

    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Created building material: {name} ({code})"))
    db.session.commit()

    return jsonify(_serialize_with_usage(item, 0)), 201


@reference_options_bp.route('/api/building-materials/<int:item_id>', methods=['PUT'])
@jwt_required()
@role_required('admin')
def update_building_material(item_id):
    item = BuildingMaterial.query.get(item_id)
    if not item:
        return jsonify({"error": "Building material not found"}), 404

    data = request.get_json() or {}
    if 'name' in data:
        name = str(data['name'] or '').strip()
        if not name:
            return jsonify({"error": "Name cannot be empty", "field": "name"}), 400
        if _name_conflict(BuildingMaterial, name, exclude_id=item_id):
            return jsonify({"error": f"Building material named '{name}' already exists", "field": "name"}), 409
        item.name = name

    if 'code' in data:
        new_code = slugify(data['code'])
        if not new_code:
            return jsonify({"error": "Code cannot be empty", "field": "code"}), 400
        if new_code != item.code:
            if _code_conflict(BuildingMaterial, new_code, exclude_id=item_id):
                return jsonify({"error": f"Building material with code '{new_code}' already exists", "field": "code"}), 409
            item.code = new_code

    if 'description' in data:
        item.description = str(data['description'] or '').strip() or None

    if 'is_active' in data:
        item.is_active = bool(data['is_active'])

    if 'display_order' in data:
        try:
            item.display_order = int(data['display_order'])
        except (ValueError, TypeError):
            pass

    db.session.commit()
    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Updated building material: {item.name}"))
    db.session.commit()

    in_use_count = EvacuationCenter.query.filter_by(building_material_id=item_id).count()
    return jsonify(_serialize_with_usage(item, in_use_count)), 200


@reference_options_bp.route('/api/building-materials/<int:item_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_building_material(item_id):
    item = BuildingMaterial.query.get(item_id)
    if not item:
        return jsonify({"error": "Building material not found"}), 404

    in_use_count = EvacuationCenter.query.filter_by(building_material_id=item_id).count()
    if in_use_count > 0:
        return jsonify({
            "error": f"Building material '{item.name}' cannot be deleted because it is used by {in_use_count} evacuation center(s).",
            "blocked": True,
            "in_use_count": in_use_count
        }), 409

    name = item.name
    db.session.delete(item)
    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Deleted building material: {name}"))
    db.session.commit()
    return jsonify({"message": f"Building material '{name}' deleted successfully", "deleted": True}), 200


# =========================================================
# 3. AMENITIES CRUD (/api/amenities & /api/accessibility-features)
# =========================================================
@reference_options_bp.route('/api/amenities', methods=['GET'])
@reference_options_bp.route('/api/accessibility-features', methods=['GET'])
def get_amenities():
    active_only = request.args.get('active_only', '').strip().lower() in ('true', '1')
    search = request.args.get('search', '').strip()

    query = Amenity.query
    if active_only:
        query = query.filter_by(is_active=True)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                Amenity.name.ilike(search_pattern),
                Amenity.code.ilike(search_pattern),
                Amenity.description.ilike(search_pattern),
            )
        )

    rows = query.order_by(Amenity.display_order.asc(), Amenity.name.asc()).all()
    usage_map = _amenity_usage_map()
    return jsonify([_serialize_with_usage(r, usage_map.get(r.id, 0)) for r in rows]), 200


@reference_options_bp.route('/api/amenities', methods=['POST'])
@reference_options_bp.route('/api/accessibility-features', methods=['POST'])
@jwt_required()
@role_required('admin')
def create_amenity():
    data = request.get_json() or {}
    name = str(data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "Amenity name is required", "field": "name"}), 400

    if _name_conflict(Amenity, name):
        return jsonify({"error": f"Amenity named '{name}' already exists", "field": "name"}), 409

    raw_code = str(data.get('code') or '').strip().lower()
    code = slugify(raw_code) if raw_code else slugify(name)
    if not code:
        return jsonify({"error": "A valid identifier code is required", "field": "code"}), 400

    if _code_conflict(Amenity, code):
        return jsonify({"error": f"Amenity with code '{code}' already exists", "field": "code"}), 409

    item = Amenity(
        name=name,
        code=code,
        description=str(data.get('description') or '').strip() or None,
        is_active=bool(data.get('is_active', True)),
        display_order=int(data.get('display_order', 0) or 0),
    )
    db.session.add(item)
    db.session.commit()

    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Created amenity: {name} ({code})"))
    db.session.commit()

    return jsonify(_serialize_with_usage(item, 0)), 201


@reference_options_bp.route('/api/amenities/<int:item_id>', methods=['PUT'])
@reference_options_bp.route('/api/accessibility-features/<int:item_id>', methods=['PUT'])
@jwt_required()
@role_required('admin')
def update_amenity(item_id):
    item = Amenity.query.get(item_id)
    if not item:
        return jsonify({"error": "Amenity not found"}), 404

    data = request.get_json() or {}
    if 'name' in data:
        name = str(data['name'] or '').strip()
        if not name:
            return jsonify({"error": "Name cannot be empty", "field": "name"}), 400
        if _name_conflict(Amenity, name, exclude_id=item_id):
            return jsonify({"error": f"Amenity named '{name}' already exists", "field": "name"}), 409
        item.name = name

    if 'code' in data:
        new_code = slugify(data['code'])
        if not new_code:
            return jsonify({"error": "Code cannot be empty", "field": "code"}), 400
        if new_code != item.code:
            if _code_conflict(Amenity, new_code, exclude_id=item_id):
                return jsonify({"error": f"Amenity with code '{new_code}' already exists", "field": "code"}), 409
            item.code = new_code

    if 'description' in data:
        item.description = str(data['description'] or '').strip() or None

    if 'is_active' in data:
        item.is_active = bool(data['is_active'])

    if 'display_order' in data:
        try:
            item.display_order = int(data['display_order'])
        except (ValueError, TypeError):
            pass

    db.session.commit()
    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Updated amenity: {item.name}"))
    db.session.commit()

    in_use_count = db.session.query(center_amenities).filter_by(amenity_id=item_id).count()
    return jsonify(_serialize_with_usage(item, in_use_count)), 200


@reference_options_bp.route('/api/amenities/<int:item_id>', methods=['DELETE'])
@reference_options_bp.route('/api/accessibility-features/<int:item_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_amenity(item_id):
    item = Amenity.query.get(item_id)
    if not item:
        return jsonify({"error": "Amenity not found"}), 404

    # Check how many centers use this amenity in junction table
    in_use_count = db.session.query(center_amenities).filter_by(amenity_id=item_id).count()
    if in_use_count > 0:
        return jsonify({
            "error": f"Amenity '{item.name}' cannot be deleted because it is used by {in_use_count} evacuation center(s).",
            "blocked": True,
            "in_use_count": in_use_count
        }), 409

    name = item.name
    db.session.delete(item)
    user_id = get_jwt_identity()
    db.session.add(SystemLog(user_id=user_id, action=f"Deleted amenity: {name}"))
    db.session.commit()
    return jsonify({"message": f"Amenity '{name}' deleted successfully", "deleted": True}), 200
