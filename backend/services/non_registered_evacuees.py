"""Non-registered arrivals: validation, privacy, operation selection and occupancy."""
import re
from datetime import date, datetime

from sqlalchemy import func, inspect, or_, text

from models import (
    db, EvacuationOperation, EvacuationCheckInRecord, EvacuationAssignment,
    EvacuationCenterRoom, NonRegisteredEvacuee, PHILIPPINES_TZ,
)

PERSON_FIELDS = (
    'first_name', 'middle_name', 'last_name', 'sex', 'age_years', 'birthdate',
    'contact_number', 'address', 'is_pwd', 'is_pregnant', 'needs_medical', 'notes',
)


def table_ready():
    # Existing deployments keep working until the additive migration is applied.
    if not inspect(db.engine).has_table('non_registered_evacuees'):
        return False
    if db.engine.dialect.name == 'postgresql':
        return bool(db.session.execute(text(
            "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('non_registered_evacuees') "
            "AND tgname = 'nre_group_consistency' AND NOT tgisinternal)"
        )).scalar())
    return True


def active_operation(center_id=None):
    query = EvacuationOperation.query.filter_by(status='active')
    if center_id:
        query = query.filter(or_(EvacuationOperation.center_id.is_(None), EvacuationOperation.center_id == center_id))
    return query.order_by(EvacuationOperation.id.desc()).first()


def resolve_operation(value=None, center_id=None):
    if value in (None, '', 'active', 'all'):
        return active_operation(center_id)
    return db.session.get(EvacuationOperation, int(value))


def validate_person(data, existing=None):
    if not isinstance(data, dict):
        return {}, {'person': 'Enter a person object.'}
    values = {key: getattr(existing, key) for key in PERSON_FIELDS} if existing else {}
    values.update({key: data[key] for key in PERSON_FIELDS if key in data})
    errors = {}
    for key in ('first_name', 'middle_name', 'last_name'):
        value = values.get(key)
        if value is not None and not isinstance(value, str):
            errors[key] = 'Enter a name as text.'
        value = value.strip() if isinstance(value, str) else ''
        if not value and key == 'middle_name':
            values[key] = None
            continue
        if not 2 <= len(value) <= 60 or not any(c.isalpha() for c in value) or not all(c.isalpha() or c in " -'.’" for c in value):
            errors[key] = 'Use 2–60 characters: letters, spaces, hyphens, apostrophes or periods.'
        values[key] = value
    if values.get('sex') not in ('male', 'female', 'other'):
        errors['sex'] = 'Select male, female or other.'
    age = values.get('age_years')
    if type(age) is not int or not 0 <= age <= 120:
        errors['age_years'] = 'Enter a whole number from 0 to 120.'
    for key in ('is_pwd', 'is_pregnant', 'needs_medical'):
        value = values.get(key, False)
        if type(value) is not bool:
            errors[key] = 'Use true or false.'
        values[key] = value
    if values['is_pregnant'] and values.get('sex') != 'female':
        errors['is_pregnant'] = 'Pregnant is allowed only when sex is female.'
    birthday = values.get('birthdate')
    if birthday:
        try:
            birthday = date.fromisoformat(birthday) if isinstance(birthday, str) else birthday
            if type(birthday) is not date or birthday > datetime.now(PHILIPPINES_TZ).date():
                raise ValueError()
        except (TypeError, ValueError):
            errors['birthdate'] = 'Enter a valid birthdate that is not in the future.'
    values['birthdate'] = birthday or None
    phone = values.get('contact_number')
    if phone is not None and not isinstance(phone, str):
        errors['contact_number'] = 'Enter a Philippine mobile number.'
    elif phone:
        phone = re.sub(r'[\s-]', '', phone)
        if re.fullmatch(r'09[0-9]{9}', phone):
            phone = '+63' + phone[1:]
        elif phone and not re.fullmatch(r'\+639[0-9]{9}', phone):
            errors['contact_number'] = 'Use 09XXXXXXXXX or +639XXXXXXXXX.'
    values['contact_number'] = phone or None
    for key in ('address', 'notes'):
        value = values.get(key)
        value = '' if value is None else value
        if not isinstance(value, str) or len(value.strip()) > 200:
            errors[key] = 'Use no more than 200 characters.'
        values[key] = value.strip() or None if isinstance(value, str) else None
    return values, errors


def parse_timestamp(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Include a timezone in the date and time.')
    return parsed


def present_counts(operation_id=None):
    if not table_ready():
        return {}
    operation = resolve_operation(operation_id)
    if not operation:
        return {}
    return dict(db.session.query(NonRegisteredEvacuee.center_id, func.count(NonRegisteredEvacuee.id)).filter(
        NonRegisteredEvacuee.operation_id == operation.id,
        NonRegisteredEvacuee.departed_at.is_(None),
    ).group_by(NonRegisteredEvacuee.center_id).all())


def center_occupancy(center_id, operation=None):
    operation = operation or active_operation(center_id)
    if not operation:
        return 0
    registered = db.session.query(func.count(func.distinct(EvacuationCheckInRecord.resident_id))).filter(
        EvacuationCheckInRecord.operation_id == operation.id,
        EvacuationCheckInRecord.center_id == center_id,
        EvacuationCheckInRecord.status == 'checked_in',
    ).scalar() or 0
    # Legacy active arrivals may predate operation-history recording.
    if operation.status == 'active':
        room_ids = db.session.query(EvacuationCenterRoom.id).filter_by(evacuation_center_id=center_id)
        registered = db.session.query(func.count(func.distinct(EvacuationAssignment.resident_id))).filter(
            EvacuationAssignment.checked_in_at.isnot(None),
            or_(EvacuationAssignment.evacuation_center_id == center_id, EvacuationAssignment.room_id.in_(room_ids)),
        ).scalar() or 0
    return int(registered) + present_counts(operation.id).get(center_id, 0)
