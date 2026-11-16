import io
import os
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from sqlalchemy import event, text
from werkzeug.security import generate_password_hash

from models import (
    Family,
    HazardReport,
    HazardReportPhoto,
    Resident,
    ResidentAccount,
    RoadSegment,
    StaffNotification,
    SystemLog,
    User,
    db,
)
from routes.hazard_reports import reports_bp


class HazardReporterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.app = Flask(__name__, root_path=cls.temp_dir.name)
        cls.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI='sqlite://',
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_SECRET_KEY='hazard-reporter-test-secret-key-32b',
        )
        db.init_app(cls.app)
        JWTManager(cls.app)
        cls.app.register_blueprint(reports_bp)
        cls.app_context = cls.app.app_context()
        cls.app_context.push()

        @event.listens_for(db.engine, 'connect')
        def _register_sqlite_spatial_funcs(dbapi_connection, _connection_record):
            from shapely import wkt as shapely_wkt

            def _geom_from_ewkt(val):
                if isinstance(val, (bytes, bytearray)):
                    return bytes(val)
                s = str(val or '')
                wkt_part = s.split(';', 1)[-1]
                return shapely_wkt.loads(wkt_part).wkb

            dbapi_connection.create_function('AsEWKB', 1, lambda x: bytes(x) if isinstance(x, (bytes, bytearray)) else x)
            dbapi_connection.create_function('GeomFromEWKT', 1, _geom_from_ewkt)
            dbapi_connection.create_function('ST_AsEWKB', 1, lambda x: bytes(x) if isinstance(x, (bytes, bytearray)) else x)
            dbapi_connection.create_function('ST_GeomFromEWKT', 1, _geom_from_ewkt)
            dbapi_connection.create_function('ST_Y', 1, lambda _g: 10.67)
            dbapi_connection.create_function('ST_X', 1, lambda _g: 122.95)
            dbapi_connection.execute('PRAGMA foreign_keys = ON')

        needed_tables = [
            User.__table__,
            Family.__table__,
            Resident.__table__,
            ResidentAccount.__table__,
            StaffNotification.__table__,
            SystemLog.__table__,
        ]
        # SQLite needs minimal parent tables referenced by Family/Resident
        with db.engine.begin() as conn:
            conn.execute(text('CREATE TABLE IF NOT EXISTS barangays (id INTEGER PRIMARY KEY, name VARCHAR(100))'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS roster_years (id INTEGER PRIMARY KEY, year INTEGER)'))
        db.metadata.create_all(bind=db.engine, tables=needed_tables)
        with db.engine.begin() as conn:
            conn.execute(
                text(
                    'CREATE TABLE hazard_reports ('
                    'id INTEGER PRIMARY KEY AUTOINCREMENT, '
                    'description TEXT NOT NULL, '
                    'photo_url VARCHAR(255) NOT NULL, '
                    'report_type VARCHAR(50), '
                    "status VARCHAR(20) DEFAULT 'pending', "
                    'response_notes TEXT, '
                    'validated_by INTEGER REFERENCES users(id), '
                    'reported_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, '
                    'reported_by_resident_account_id INTEGER REFERENCES resident_accounts(id) ON DELETE SET NULL, '
                    'geom BLOB NOT NULL, '
                    'submitted_at DATETIME, '
                    'validated_at DATETIME)'
                )
            )
            conn.execute(
                text(
                    'CREATE TABLE road_segments ('
                    'id INTEGER PRIMARY KEY AUTOINCREMENT, '
                    'road_name VARCHAR(100), '
                    'road_type VARCHAR(50), '
                    'base_weight FLOAT DEFAULT 1.0, '
                    'is_closed BOOLEAN DEFAULT 0, '
                    'closed_by_report_id INTEGER REFERENCES hazard_reports(id) ON DELETE SET NULL, '
                    'hazard_zone_id INTEGER, '
                    'geom BLOB)'
                )
            )
        db.metadata.create_all(bind=db.engine, tables=[HazardReportPhoto.__table__])
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.app_context.pop()
        cls.temp_dir.cleanup()

    def setUp(self):
        db.session.remove()
        with db.engine.begin() as conn:
            conn.execute(text('DELETE FROM hazard_report_photos'))
            conn.execute(text('DELETE FROM hazard_reports'))
            conn.execute(text('DELETE FROM resident_accounts'))
            conn.execute(text('DELETE FROM residents'))
            conn.execute(text('DELETE FROM staff_notifications'))
            conn.execute(text('DELETE FROM system_logs'))
            conn.execute(text('DELETE FROM users'))

        self.admin = User(
            name='Admin User',
            email='admin@evacway.local',
            password_hash=generate_password_hash('Pass1234!'),
            contact_number='09171112222',
            role='admin',
            is_active=True,
        )
        self.lgu = User(
            name='LGU Reporter',
            email='lgu@evacway.local',
            password_hash=generate_password_hash('Pass1234!'),
            contact_number='09173334444',
            role='lgu_personnel',
            is_active=True,
        )
        self.resident = Resident(
            first_name='Juan',
            middle_name=None,
            last_name='Reyes',
        )
        db.session.add_all([self.admin, self.lgu, self.resident])
        db.session.flush()

        self.resident_account = ResidentAccount(
            resident_id=self.resident.id,
            email='juan.secret@example.com',
            password_hash=generate_password_hash('Pass1234!'),
            is_active=True,
        )
        db.session.add(self.resident_account)
        db.session.commit()

        self.admin_token = create_access_token(
            identity=str(self.admin.id),
            additional_claims={'role': 'admin', 'account_type': 'user', 'name': self.admin.name},
        )
        self.lgu_token = create_access_token(
            identity=str(self.lgu.id),
            additional_claims={'role': 'lgu_personnel', 'account_type': 'user', 'name': self.lgu.name},
        )
        self.resident_token = create_access_token(
            identity=str(self.resident_account.id),
            additional_claims={
                'role': 'resident',
                'account_type': 'resident_account',
                'resident_id': self.resident.id,
                'name': self.resident.get_full_name(),
            },
        )

    def _submit_report(self, token=None, description='Flooded street'):
        headers = {'Authorization': f'Bearer {token}'} if token else {}
        data = {
            'description': description,
            'report_type': 'flood',
            'latitude': '10.67',
            'longitude': '122.95',
            'photos': (io.BytesIO(b'fake-jpeg-bytes'), 'hazard.jpg'),
        }
        with (
            patch('routes.hazard_reports.snap_point_to_road', return_value=((10.67, 122.95), None, None, None)),
            patch('routes.hazard_reports.create_staff_notifications', return_value=[]),
            patch('routes.hazard_reports.send_staff_push_notifications'),
        ):
            return self.client.post(
                '/api/hazard-reports',
                data=data,
                content_type='multipart/form-data',
                headers=headers,
            )

    def test_unauthenticated_submission_rejected(self):
        resp = self._submit_report(token=None)
        self.assertEqual(resp.status_code, 401)

    def test_reporter_username_fetched_in_single_query_and_privacy_preserved(self):
        r1 = self._submit_report(token=self.resident_token, description='Deep flood')
        self.assertEqual(r1.status_code, 201, r1.get_json())
        self.assertNotIn('email', str(r1.get_json()).lower())

        r2 = self._submit_report(token=self.lgu_token, description='Fallen tree')
        self.assertEqual(r2.status_code, 201, r2.get_json())

        # Non-staff resident cannot access /api/hazard-reports
        res_list = self.client.get(
            '/api/hazard-reports',
            headers={'Authorization': f'Bearer {self.resident_token}'},
        )
        self.assertEqual(res_list.status_code, 403)

        # Count SQL SELECT queries during admin GET /api/hazard-reports
        executed_sql = []

        def _track_sql(_conn, _cursor, statement, _params, _ctx, _execmany):
            if statement.lstrip().upper().startswith('SELECT'):
                executed_sql.append(statement)

        event.listen(db.engine, 'before_cursor_execute', _track_sql)
        try:
            admin_list = self.client.get(
                '/api/hazard-reports',
                headers={'Authorization': f'Bearer {self.admin_token}'},
            )
        finally:
            event.remove(db.engine, 'before_cursor_execute', _track_sql)

        self.assertEqual(admin_list.status_code, 200)
        items = admin_list.get_json()
        self.assertEqual(len(items), 2)

        # Only 1 main joined SELECT for hazard_reports (+1 selectin for photos, 0 N+1 user lookups)
        main_selects = [s for s in executed_sql if 'FROM hazard_reports' in s]
        user_n_plus_one = [s for s in executed_sql if 'FROM users WHERE' in s or 'FROM resident_accounts WHERE' in s]
        self.assertEqual(len(main_selects), 1)
        self.assertEqual(user_n_plus_one, [])

        by_desc = {item['description']: item for item in items}
        self.assertEqual(by_desc['Deep flood']['reporter_username'], 'Juan Reyes')
        self.assertFalse(by_desc['Deep flood']['reporter_deleted'])
        self.assertEqual(by_desc['Fallen tree']['reporter_username'], 'LGU Reporter')
        self.assertFalse(by_desc['Fallen tree']['reporter_deleted'])

        # Privacy: no email or contact number leaked
        serialized = str(items)
        self.assertNotIn('juan.secret@example.com', serialized)
        self.assertNotIn('lgu@evacway.local', serialized)
        self.assertNotIn('09173334444', serialized)

    def test_deleted_reporter_and_public_endpoint_privacy(self):
        r1 = self._submit_report(token=self.resident_token, description='Bridge damage')
        self.assertEqual(r1.status_code, 201)
        report_id = r1.get_json()['id']

        # Validate report so it appears on public feed too
        with patch('routes.hazard_reports.close_nearby_roads', return_value=[]):
            val_resp = self.client.patch(
                f'/api/hazard-reports/{report_id}/validate',
                json={'status': 'validated', 'response_notes': 'Checked'},
                headers={'Authorization': f'Bearer {self.admin_token}'},
            )
        self.assertEqual(val_resp.status_code, 200)
        self.assertEqual(val_resp.get_json()['reporter_username'], 'Juan Reyes')

        # Public endpoint never exposes reporter username
        pub_resp = self.client.get('/api/hazard-reports/public')
        self.assertEqual(pub_resp.status_code, 200)
        pub_items = pub_resp.get_json()
        self.assertEqual(len(pub_items), 1)
        self.assertNotIn('reporter_username', pub_items[0])
        self.assertNotIn('reporter_name', pub_items[0])

        # Deleting the resident account triggers ON DELETE SET NULL -> Deleted user indicator
        db.session.delete(self.resident_account)
        db.session.commit()

        admin_list = self.client.get(
            '/api/hazard-reports',
            headers={'Authorization': f'Bearer {self.admin_token}'},
        )
        self.assertEqual(admin_list.status_code, 200)
        item = admin_list.get_json()[0]
        self.assertIsNone(item['reporter_username'])
        self.assertTrue(item['reporter_deleted'])


if __name__ == '__main__':
    unittest.main()
