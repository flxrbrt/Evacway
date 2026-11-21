import io
import unittest

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from openpyxl import Workbook, load_workbook
from sqlalchemy import event, text
from werkzeug.security import generate_password_hash

from models import (
    Amenity,
    Barangay,
    BuildingMaterial,
    CenterType,
    EvacuationAssignment,
    EvacuationCenterRoom,
    Family,
    Resident,
    RosterYear,
    SystemLog,
    User,
    center_amenities,
    db,
)
from routes.families import STAGED_IMPORTS, families_bp


def _build_workbook_bytes(headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.title = 'Families'
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


class BarangayImportApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI='sqlite://',
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_SECRET_KEY='barangay-import-test-secret-key-at-least-32-bytes',
        )
        db.init_app(cls.app)
        JWTManager(cls.app)
        cls.app.register_blueprint(families_bp)
        cls.app_context = cls.app.app_context()
        cls.app_context.push()

        @event.listens_for(db.engine, 'connect')
        def register_sqlite_functions(dbapi_connection, connection_record):
            dbapi_connection.create_function('AsEWKB', 1, lambda x: x)
            dbapi_connection.create_function('GeomFromEWKT', 1, lambda x: x)
            dbapi_connection.create_function('ST_AsEWKB', 1, lambda x: x)
            dbapi_connection.create_function('ST_GeomFromEWKT', 1, lambda x: x)

        db.metadata.create_all(bind=db.engine, tables=[
            User.__table__,
            Amenity.__table__,
            center_amenities,
            CenterType.__table__,
            BuildingMaterial.__table__,
            RosterYear.__table__,
            Family.__table__,
            EvacuationCenterRoom.__table__,
            EvacuationAssignment.__table__,
            Resident.__table__,
            SystemLog.__table__,
        ])
        with db.engine.begin() as connection:
            connection.execute(text(
                'CREATE TABLE barangays (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, population INTEGER, geom BLOB)'
            ))
            connection.execute(text(
                'CREATE TABLE evacuation_center_buildings (id INTEGER PRIMARY KEY, evacuation_center_id INTEGER, name VARCHAR(100), label VARCHAR(50), color VARCHAR(20), sort_order INTEGER, is_active BOOLEAN DEFAULT 1, geom BLOB)'
            ))
            connection.execute(text(
                'CREATE TABLE evacuation_centers (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, capacity INTEGER, building_material VARCHAR(50), building_material_id INTEGER, hazard_exposure_score FLOAT, contact_number VARCHAR(20), is_active BOOLEAN DEFAULT 1, center_type VARCHAR(50), center_type_id INTEGER, owner_name VARCHAR(150), evacuation_open_date DATE, evacuation_open_time VARCHAR(10) DEFAULT \'08:00\', evacuation_cutoff_date DATE, evacuation_cutoff_time VARCHAR(10) DEFAULT \'18:00\', evacuation_extension_count INTEGER DEFAULT 0, evacuation_extended_until DATETIME, evacuation_status VARCHAR(30) DEFAULT \'standby\', evacuation_event_name VARCHAR(150), max_rooms INTEGER, geom BLOB, entrance_geom BLOB, managed_by INTEGER, created_at DATETIME)'
            ))

    @classmethod
    def tearDownClass(cls):
        db.session.remove()
        db.engine.dispose()
        cls.app_context.pop()

    def setUp(self):
        db.session.remove()
        STAGED_IMPORTS.clear()
        SystemLog.query.delete(synchronize_session=False)
        EvacuationAssignment.query.delete(synchronize_session=False)
        Resident.query.delete(synchronize_session=False)
        Family.query.delete(synchronize_session=False)
        RosterYear.query.delete(synchronize_session=False)
        User.query.delete(synchronize_session=False)
        Barangay.query.delete(synchronize_session=False)
        db.session.commit()

        admin = User(
            name='Admin Tester',
            email='admin-import@evacway.local',
            password_hash=generate_password_hash('Secret123!'),
            role='admin',
            is_active=True,
        )
        self.brgy_poblacion = Barangay(name='Poblacion', population=100)
        self.brgy_san_jose = Barangay(name='San Jose', population=200)
        db.session.add_all([admin, self.brgy_poblacion, self.brgy_san_jose])
        db.session.commit()

        token = create_access_token(identity=str(admin.id), additional_claims={'role': 'admin', 'account_type': 'user', 'mfa_verified': True, 'mfa_version': 0})
        self.headers = {'Authorization': f'Bearer {token}'}
        self.client = self.app.test_client()

    def test_stage_requires_barangay_selection(self):
        xlsx = _build_workbook_bytes(
            ['Family Code', 'Head of Family', 'Barangay', 'Member First Name', 'Member Last Name'],
            [['FAM-001', 'Juan Dela Cruz', 'Poblacion', 'Juan', 'Dela Cruz']],
        )
        res = self.client.post(
            '/api/families/import/stage',
            headers=self.headers,
            data={'file': (io.BytesIO(xlsx), 'roster.xlsx')},
            content_type='multipart/form-data',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('barangay', res.get_json()['error'].lower())

    def test_stage_and_commit_flags_and_skips_other_barangay_rows(self):
        xlsx = _build_workbook_bytes(
            ['Family Code', 'Head of Family', 'Barangay', 'Member First Name', 'Member Last Name'],
            [
                ['FAM-POB-1', 'Juan Dela Cruz', 'Poblacion', 'Juan', 'Dela Cruz'],
                ['FAM-POB-1', 'Juan Dela Cruz', 'Poblacion', 'Maria', 'Dela Cruz'],
                ['FAM-SJ-1', 'Pedro Santos', 'San Jose', 'Pedro', 'Santos'],
                ['FAM-UNK-1', 'Ana Reyes', 'Santa Cruz', 'Ana', 'Reyes'],
            ],
        )

        stage_res = self.client.post(
            '/api/families/import/stage',
            headers=self.headers,
            data={
                'barangay_id': str(self.brgy_poblacion.id),
                'file': (io.BytesIO(xlsx), 'mixed.xlsx'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(stage_res.status_code, 200)
        staged = stage_res.get_json()

        self.assertTrue(staged['can_import'])
        self.assertEqual(staged['target_barangay']['name'], 'Poblacion')
        self.assertEqual(staged['rows'], 4)
        self.assertEqual(staged['barangay_rows'], 2)
        self.assertEqual(staged['new_households'], 1)
        self.assertEqual(staged['updated_households'], 0)
        self.assertEqual(staged['skipped_households'], 0)
        self.assertEqual(staged['other_barangay_skipped'], 2)
        self.assertEqual(
            [(r['row'], r['barangay']) for r in staged['other_barangay_rows']],
            [(4, 'San Jose'), (5, 'Santa Cruz')],
        )
        self.assertEqual(len(staged['families']), 1)
        self.assertEqual(staged['families'][0]['barangay'], 'Poblacion')

        commit_res = self.client.post(
            '/api/families/import/commit',
            headers=self.headers,
            json={'staging_token': staged['staging_token']},
        )
        self.assertEqual(commit_res.status_code, 201)
        committed = commit_res.get_json()
        self.assertEqual(committed['families_created'], 1)
        self.assertEqual(committed['residents_created'], 2)
        self.assertEqual(committed['other_barangay_rows_skipped'], 2)

        self.assertEqual(Family.query.filter_by(barangay_id=self.brgy_poblacion.id).count(), 1)
        self.assertEqual(Family.query.filter_by(barangay_id=self.brgy_san_jose.id).count(), 0)
        self.assertEqual(Resident.query.count(), 2)

    def test_stage_allows_omitted_barangay_column_when_barangay_selected(self):
        xlsx = _build_workbook_bytes(
            ['Family Code', 'Head of Family', 'Member First Name', 'Member Last Name'],
            [['FAM-POB-2', 'Elena Cruz', 'Elena', 'Cruz']],
        )
        res = self.client.post(
            '/api/families/import/stage',
            headers=self.headers,
            data={
                'barangay_id': str(self.brgy_poblacion.id),
                'file': (io.BytesIO(xlsx), 'no-brgy-col.xlsx'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['can_import'])
        self.assertEqual(data['families'][0]['barangay'], 'Poblacion')
        self.assertEqual(data['other_barangay_skipped'], 0)

    def test_stage_blocks_commit_when_all_rows_belong_to_other_barangays(self):
        xlsx = _build_workbook_bytes(
            ['Family Code', 'Head of Family', 'Barangay', 'Member First Name', 'Member Last Name'],
            [['FAM-SJ-9', 'Marco Lim', 'San Jose', 'Marco', 'Lim']],
        )
        res = self.client.post(
            '/api/families/import/stage',
            headers=self.headers,
            data={
                'barangay_id': str(self.brgy_poblacion.id),
                'file': (io.BytesIO(xlsx), 'other-only.xlsx'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data['can_import'])
        self.assertEqual(data['barangay_rows'], 0)
        self.assertEqual(data['other_barangay_skipped'], 1)
        self.assertEqual(data['errors'], [])

    def test_template_and_export_scope_to_selected_barangay(self):
        tpl_res = self.client.get(
            f'/api/families/template?barangay_id={self.brgy_san_jose.id}',
            headers=self.headers,
        )
        self.assertEqual(tpl_res.status_code, 200)
        wb = load_workbook(io.BytesIO(tpl_res.data), read_only=True)
        rows = list(wb['Families'].iter_rows(values_only=True))
        self.assertEqual(rows[1][2], 'San Jose')
        self.assertEqual(rows[2][2], 'San Jose')

        ry = RosterYear(year=2026, is_active=True)
        db.session.add(ry)
        db.session.flush()
        f1 = Family(
            roster_year_id=ry.id,
            barangay_id=self.brgy_poblacion.id,
            family_code='POB-1',
            head_name='Juan Dela Cruz',
            member_count=1,
        )
        f2 = Family(
            roster_year_id=ry.id,
            barangay_id=self.brgy_san_jose.id,
            family_code='SJ-1',
            head_name='Pedro Santos',
            member_count=1,
        )
        db.session.add_all([f1, f2])
        db.session.flush()
        db.session.add_all([
            Resident(family_id=f1.id, first_name='Juan', last_name='Dela Cruz', is_head_of_family=True),
            Resident(family_id=f2.id, first_name='Pedro', last_name='Santos', is_head_of_family=True),
        ])
        db.session.commit()

        exp_res = self.client.get(
            f'/api/families/export?barangay_id={self.brgy_san_jose.id}',
            headers=self.headers,
        )
        self.assertEqual(exp_res.status_code, 200)
        exp_wb = load_workbook(io.BytesIO(exp_res.data), read_only=True)
        res_rows = list(exp_wb['Residents'].iter_rows(values_only=True))
        self.assertEqual(len(res_rows), 2)
        self.assertEqual(res_rows[1][0], 'SJ-1')
        self.assertEqual(res_rows[1][2], 'San Jose')


if __name__ == '__main__':
    unittest.main()
