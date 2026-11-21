import unittest

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from sqlalchemy import event, text
from werkzeug.security import generate_password_hash

from models import (
    Amenity,
    BuildingMaterial,
    CenterType,
    EvacuationCenter,
    SystemLog,
    User,
    center_amenities,
    db,
)
from routes.reference_options import reference_options_bp


class ShelterMetadataApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI='sqlite://',
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_SECRET_KEY='shelter-metadata-test-secret-key-at-least-32-bytes',
        )
        db.init_app(cls.app)
        JWTManager(cls.app)
        cls.app.register_blueprint(reference_options_bp)
        cls.app_context = cls.app.app_context()
        cls.app_context.push()

        @event.listens_for(db.engine, 'connect')
        def _register_sqlite_spatial_funcs(dbapi_connection, _connection_record):
            dbapi_connection.create_function('AsEWKB', 1, lambda x: x)
            dbapi_connection.create_function('GeomFromEWKT', 1, lambda x: x)
            dbapi_connection.create_function('ST_AsEWKB', 1, lambda x: x)
            dbapi_connection.create_function('ST_GeomFromEWKT', 1, lambda x: x)

        tables = [
            User.__table__,
            CenterType.__table__,
            BuildingMaterial.__table__,
            Amenity.__table__,
            SystemLog.__table__,
        ]
        db.metadata.create_all(bind=db.engine, tables=tables)
        with db.engine.begin() as conn:
            conn.execute(
                text(
                    'CREATE TABLE evacuation_centers ('
                    'id INTEGER PRIMARY KEY, '
                    'name VARCHAR(100) NOT NULL, '
                    'capacity INTEGER, '
                    'center_type_id INTEGER NOT NULL DEFAULT 1, '
                    'building_material_id INTEGER, '
                    'hazard_exposure_score FLOAT, '
                    'contact_number VARCHAR(20), '
                    'is_active BOOLEAN DEFAULT 1, '
                    'owner_name VARCHAR(150), '
                    'evacuation_open_date DATE, '
                    "evacuation_open_time VARCHAR(10) DEFAULT '08:00', "
                    'evacuation_cutoff_date DATE, '
                    "evacuation_cutoff_time VARCHAR(10) DEFAULT '18:00', "
                    'evacuation_extension_count INTEGER DEFAULT 0, '
                    'evacuation_extended_until DATETIME, '
                    "evacuation_status VARCHAR(30) DEFAULT 'standby', "
                    'evacuation_event_name VARCHAR(150), '
                    'max_rooms INTEGER, '
                    'geom BLOB, '
                    'entrance_geom BLOB, '
                    'managed_by INTEGER, '
                    'created_at DATETIME)'
                )
            )
        center_amenities.create(bind=db.engine)

        admin = User(
            name='Admin User',
            email='admin@evacway.test',
            password_hash=generate_password_hash('secret123'),
            role='admin',
            is_active=True,
        )
        db.session.add(admin)
        db.session.commit()
        cls.admin_id = admin.id

    @classmethod
    def tearDownClass(cls):
        db.session.remove()
        db.engine.dispose()
        cls.app_context.pop()

    def setUp(self):
        db.session.rollback()
        with db.engine.begin() as conn:
            conn.execute(text('DELETE FROM center_amenities'))
            conn.execute(text('DELETE FROM evacuation_centers'))
        SystemLog.query.delete()
        CenterType.query.delete()
        BuildingMaterial.query.delete()
        Amenity.query.delete()
        db.session.commit()

        self.client = self.app.test_client()
        token = create_access_token(
            identity=str(self.admin_id),
            additional_claims={'role': 'admin', 'account_type': 'user', 'mfa_verified': True, 'mfa_version': 0},
        )
        self.headers = {'Authorization': f'Bearer {token}'}

    def test_create_center_type_requires_valid_structure_and_generates_code(self):
        res_missing = self.client.post(
            '/api/center-types',
            headers=self.headers,
            json={'name': 'Covered Court'},
        )
        self.assertEqual(res_missing.status_code, 400)
        self.assertEqual(res_missing.get_json().get('field'), 'structure_mode')

        res_ok = self.client.post(
            '/api/center-types',
            headers=self.headers,
            json={
                'name': 'Covered Court',
                'structure_mode': 'open_area',
                'description': 'Open court without rooms',
                'is_active': True,
            },
        )
        self.assertEqual(res_ok.status_code, 201)
        body = res_ok.get_json()
        self.assertEqual(body['code'], 'covered_court')
        self.assertEqual(body['structure_mode'], 'open_area')
        self.assertEqual(body['in_use_count'], 0)

    def test_duplicate_name_and_code_rejected_with_field_errors(self):
        self.client.post(
            '/api/center-types',
            headers=self.headers,
            json={
                'name': 'Gymnasium',
                'code': 'gymnasium',
                'structure_mode': 'open_area',
            },
        )

        dup_name = self.client.post(
            '/api/center-types',
            headers=self.headers,
            json={
                'name': 'gymnasium',
                'code': 'gym_alt',
                'structure_mode': 'open_area',
            },
        )
        self.assertEqual(dup_name.status_code, 409)
        self.assertEqual(dup_name.get_json().get('field'), 'name')

        dup_code = self.client.post(
            '/api/center-types',
            headers=self.headers,
            json={
                'name': 'City Gym',
                'code': 'gymnasium',
                'structure_mode': 'open_area',
            },
        )
        self.assertEqual(dup_code.status_code, 409)
        self.assertEqual(dup_code.get_json().get('field'), 'code')

    def test_delete_blocked_when_in_use_across_metadata_tables_and_succeeds_when_unused(self):
        ct = CenterType(
            code='school_campus',
            name='School Campus',
            structure_mode='buildings_and_rooms',
            is_active=True,
        )
        bm = BuildingMaterial(
            code='reinforced_concrete',
            name='Reinforced Concrete',
            is_active=True,
        )
        am = Amenity(
            code='wheelchair_ramps',
            name='Wheelchair Ramps',
            is_active=True,
        )
        unused_ct = CenterType(
            code='unused_tent',
            name='Unused Tent Site',
            structure_mode='open_area',
            is_active=True,
        )
        db.session.add_all([ct, bm, am, unused_ct])
        db.session.flush()

        center = EvacuationCenter(
            name='Central Elementary School',
            capacity=200,
            center_type_id=ct.id,
            building_material_id=bm.id,
            is_active=True,
        )
        center.amenities.append(am)
        db.session.add(center)
        db.session.commit()

        # Serialization on EvacuationCenter exposes structure_mode
        self.assertEqual(center.structure_mode, 'buildings_and_rooms')

        # Usage counts returned in GET endpoints
        cts = self.client.get('/api/center-types').get_json()
        by_code = {item['code']: item for item in cts}
        self.assertEqual(by_code['school_campus']['in_use_count'], 1)
        self.assertEqual(by_code['unused_tent']['in_use_count'], 0)

        # In-use deletes are blocked with 409 and NOT auto-deactivated
        del_ct = self.client.delete(f'/api/center-types/{ct.id}', headers=self.headers)
        self.assertEqual(del_ct.status_code, 409)
        self.assertTrue(del_ct.get_json().get('blocked'))
        self.assertTrue(db.session.get(CenterType, ct.id).is_active)

        del_bm = self.client.delete(f'/api/building-materials/{bm.id}', headers=self.headers)
        self.assertEqual(del_bm.status_code, 409)
        self.assertTrue(del_bm.get_json().get('blocked'))

        del_am = self.client.delete(f'/api/amenities/{am.id}', headers=self.headers)
        self.assertEqual(del_am.status_code, 409)
        self.assertTrue(del_am.get_json().get('blocked'))

        # Unused item deletes cleanly
        del_unused = self.client.delete(f'/api/center-types/{unused_ct.id}', headers=self.headers)
        self.assertEqual(del_unused.status_code, 200)
        self.assertIsNone(db.session.get(CenterType, unused_ct.id))


if __name__ == '__main__':
    unittest.main()
