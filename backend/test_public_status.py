import unittest
from datetime import datetime

from flask import Flask
from sqlalchemy import text

from models import db
from routes.hazard_reports import reports_bp
from services.public_status import hazard_status_group


class PublicStatusSummaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI="sqlite://",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(cls.app)
        cls.app.register_blueprint(reports_bp)
        cls.app_context = cls.app.app_context()
        cls.app_context.push()
        with db.engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE evacuation_centers ("
                "id INTEGER PRIMARY KEY, is_active BOOLEAN, geom BLOB, evacuation_status VARCHAR(30))"
            ))
            connection.execute(text(
                "CREATE TABLE road_segments (id INTEGER PRIMARY KEY, is_closed BOOLEAN)"
            ))
            connection.execute(text(
                "CREATE TABLE hazard_reports (id INTEGER PRIMARY KEY, status VARCHAR(20))"
            ))
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.app_context.pop()

    def setUp(self):
        with db.engine.begin() as connection:
            connection.execute(text("DELETE FROM evacuation_centers"))
            connection.execute(text("DELETE FROM road_segments"))
            connection.execute(text("DELETE FROM hazard_reports"))

    def test_summary_excludes_unmapped_and_closed_centers_and_matches_admin_active_rule(self):
        with db.engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO evacuation_centers (id, is_active, geom, evacuation_status) VALUES "
                "(1, 1, X'01', 'open'), "
                "(2, 1, NULL, 'open'), "
                "(3, 1, X'03', 'closed'), "
                "(4, 0, X'04', 'open')"
            ))
            connection.execute(text(
                "INSERT INTO road_segments (id, is_closed) VALUES (1, 1), (2, 0)"
            ))
            statuses = ["validated", "active", "pending", "resolved", "rejected", "legacy-active"]
            for index, status in enumerate(statuses, start=1):
                connection.execute(
                    text("INSERT INTO hazard_reports (id, status) VALUES (:id, :status)"),
                    {"id": index, "status": status},
                )

        response = self.client.get("/api/public-status-summary")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(set(payload), {"counts", "last_updated"})
        self.assertEqual(
            set(payload["counts"]),
            {"open_centers", "closed_roads", "active_danger_reports"},
        )
        self.assertEqual(payload["counts"]["open_centers"], 1)
        self.assertEqual(payload["counts"]["closed_roads"], 1)

        admin_active_count = sum(
            hazard_status_group(status) == "active"
            for status in ["validated", "active", "pending", "resolved", "rejected", "legacy-active"]
        )
        self.assertEqual(payload["counts"]["active_danger_reports"], admin_active_count)
        self.assertEqual(response.headers.get("Cache-Control"), "public, max-age=60")
        self.assertIsNotNone(datetime.fromisoformat(payload["last_updated"]).tzinfo)


if __name__ == "__main__":
    unittest.main()
