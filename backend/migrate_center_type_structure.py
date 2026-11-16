"""
Idempotent helper / standalone migration to ensure `center_types.structure_mode`
exists and backfills default legacy center types (`single_venue`, `private_property`).
"""
from sqlalchemy import inspect, text


def ensure_center_type_structure_column(db_instance):
    """Ensure `center_types.structure_mode` exists and legacy types are mapped."""
    engine = db_instance.engine
    inspector = inspect(engine)
    if not inspector.has_table('center_types'):
        return

    cols = {col['name'] for col in inspector.get_columns('center_types')}
    with engine.begin() as conn:
        if 'structure_mode' not in cols:
            conn.execute(
                text(
                    "ALTER TABLE center_types "
                    "ADD COLUMN structure_mode VARCHAR(30) NOT NULL DEFAULT 'buildings_and_rooms'"
                )
            )
            conn.execute(
                text(
                    "UPDATE center_types SET structure_mode = 'open_area' "
                    "WHERE LOWER(code) = 'single_venue'"
                )
            )
            conn.execute(
                text(
                    "UPDATE center_types SET structure_mode = 'rooms_only' "
                    "WHERE LOWER(code) = 'private_property'"
                )
            )


if __name__ == '__main__':
    from app import app
    from models import db

    with app.app_context():
        ensure_center_type_structure_column(db)
        print('center_types.structure_mode ensured successfully.')
