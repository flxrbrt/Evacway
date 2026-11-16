import unittest

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from sqlalchemy import event, text

from models import (
    Barangay,
    EvacuationAssignment,
    EvacuationCenter,
    EvacuationCenterRoom,
    Family,
    Resident,
    db,
)
from routes.residents import residents_bp


class FindCenterRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI='sqlite://',
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_SECRET_KEY='find-center-test-secret-key-at-least-32b',
        )
        db.init_app(cls.app)
        JWTManager(cls.app)
        cls.app.register_blueprint(residents_bp)
        cls.app_context = cls.app.app_context()
        cls.app_context.push()

        @event.listens_for(db.engine, 'connect')
        def _register_sqlite_spatial_funcs(dbapi_connection, _connection_record):
            dbapi_connection.create_function('AsEWKB', 1, lambda x: x)
            dbapi_connection.create_function('GeomFromEWKT', 1, lambda x: x)
            dbapi_connection.create_function('ST_AsEWKB', 1, lambda x: x)
            dbapi_connection.create_function('ST_GeomFromEWKT', 1, lambda x: x)

        with db.engine.begin() as conn:
            conn.execute(text('CREATE TABLE roster_years (id INTEGER PRIMARY KEY, year INTEGER)'))
            conn.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(100), role VARCHAR(20))'))
            conn.execute(
                text(
                    'CREATE TABLE barangays ('
                    'id INTEGER PRIMARY KEY, '
                    'name VARCHAR(100), '
                    'population INTEGER DEFAULT 0, '
                    'geom BLOB)'
                )
            )
            conn.execute(
                text(
                    'CREATE TABLE evacuation_centers ('
                    'id INTEGER PRIMARY KEY, '
                    'name VARCHAR(150), '
                    'center_type VARCHAR(50), '
                    'owner_name VARCHAR(150))'
                )
            )
            conn.execute(
                text(
                    'CREATE TABLE evacuation_center_buildings ('
                    'id INTEGER PRIMARY KEY, '
                    'evacuation_center_id INTEGER, '
                    'name VARCHAR(100), '
                    'geom BLOB)'
                )
            )
            conn.execute(
                text(
                    'CREATE TABLE evacuation_center_rooms ('
                    'id INTEGER PRIMARY KEY, '
                    'evacuation_center_id INTEGER, '
                    'building_id INTEGER, '
                    'room_number VARCHAR(50), '
                    'latitude FLOAT, '
                    'longitude FLOAT)'
                )
            )

        db.metadata.create_all(
            bind=db.engine,
            tables=[
                Family.__table__,
                Resident.__table__,
                EvacuationAssignment.__table__,
            ],
        )
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.app_context.pop()

    def setUp(self):
        db.session.remove()
        with db.engine.begin() as conn:
            conn.execute(text('DELETE FROM evacuation_assignments'))
            conn.execute(text('DELETE FROM residents'))
            conn.execute(text('DELETE FROM families'))
            conn.execute(text('DELETE FROM barangays'))

        self.brgy = Barangay(id=1, name='Poblacion')
        db.session.add(self.brgy)

        self.fam_a = Family(id=1, roster_year_id=1, barangay_id=1, head_name='Juan Reyes', family_code='FAM-001', member_count=1)
        self.fam_b = Family(id=2, roster_year_id=1, barangay_id=1, head_name='Maria Santos', family_code='FAM-002', member_count=1)
        db.session.add_all([self.fam_a, self.fam_b])

        self.res_a = Resident(id=10, family_id=1, first_name='Juan', last_name='Reyes', is_head_of_family=True)
        self.res_b = Resident(id=20, family_id=2, first_name='Maria', last_name='Santos', is_head_of_family=True)
        db.session.add_all([self.res_a, self.res_b])
        db.session.commit()

        self.token_a = create_access_token(
            identity='1',
            additional_claims={
                'role': 'resident',
                'account_type': 'resident_account',
                'resident_id': self.res_a.id,
                'name': 'Juan Reyes',
            },
        )

    def test_logged_in_find_someone_by_name_returns_searched_resident(self):
        resp = self.client.get(
            '/api/residents/find-center?name=Maria+Santos',
            headers={'Authorization': f'Bearer {self.token_a}'},
        )
        self.assertEqual(resp.status_code, 200)
        matches = resp.get_json()['matches']
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['resident_id'], self.res_b.id)
        self.assertEqual(matches[0]['resident_name'], 'Maria Santos')

    def test_logged_in_find_own_name_returns_own_record(self):
        resp = self.client.get(
            '/api/residents/find-center?name=Juan+Reyes',
            headers={'Authorization': f'Bearer {self.token_a}'},
        )
        self.assertEqual(resp.status_code, 200)
        matches = resp.get_json()['matches']
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['resident_id'], self.res_a.id)
        self.assertEqual(matches[0]['resident_name'], 'Juan Reyes')

    def test_logged_in_without_name_uses_jwt_resident_id(self):
        resp = self.client.get(
            '/api/residents/find-center',
            headers={'Authorization': f'Bearer {self.token_a}'},
        )
        self.assertEqual(resp.status_code, 200)
        matches = resp.get_json()['matches']
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['resident_id'], self.res_a.id)
        self.assertEqual(matches[0]['resident_name'], 'Juan Reyes')

    def test_logged_out_find_by_name_returns_searched_resident(self):
        resp = self.client.get('/api/residents/find-center?name=Maria+Santos')
        self.assertEqual(resp.status_code, 200)
        matches = resp.get_json()['matches']
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['resident_id'], self.res_b.id)
        self.assertEqual(matches[0]['resident_name'], 'Maria Santos')


if __name__ == '__main__':
    unittest.main()
