import unittest
from unittest.mock import patch

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from werkzeug.security import generate_password_hash

from models import AdminMfaRecoveryRequest, ResidentAccount, SystemLog, User, db
import routes.auth as auth_routes
from routes.auth import auth_bp, generate_totp_code, _login_rate_buckets


class AdminTotpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI="sqlite://",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_SECRET_KEY="admin-totp-test-secret-long-enough-for-fernet",
            JWT_ACCESS_TOKEN_EXPIRES=3600,
            LOGIN_MAX_FAILED_ATTEMPTS=5,
            LOGIN_FAILURE_WINDOW_MINUTES=15,
            LOGIN_LOCK_MINUTES=15,
            LOGIN_RATE_LIMIT_MAX_REQUESTS=20,
            LOGIN_RATE_LIMIT_WINDOW_SECONDS=900,
            LGU_TOTP_REQUIRED=False,
        )
        db.init_app(cls.app)
        JWTManager(cls.app)
        cls.app.register_blueprint(auth_bp)
        cls.context = cls.app.app_context()
        cls.context.push()
        db.metadata.create_all(bind=db.engine, tables=[
            User.__table__, ResidentAccount.__table__, SystemLog.__table__,
            AdminMfaRecoveryRequest.__table__,
        ])
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        db.session.remove()
        db.drop_all()
        cls.context.pop()

    def setUp(self):
        db.session.remove()
        db.session.query(AdminMfaRecoveryRequest).delete()
        db.session.query(SystemLog).delete()
        db.session.query(User).delete()
        db.session.commit()
        _login_rate_buckets.clear()
        self.admin = User(
            name="Test Admin",
            email="admin@example.test",
            password_hash=generate_password_hash("Admin-password-123!"),
            role="admin",
            is_active=True,
        )
        db.session.add(self.admin)
        db.session.commit()

    def _login(self):
        return self.client.post("/api/auth/login", json={
            "email": self.admin.email,
            "password": "Admin-password-123!",
        })

    def _enroll(self):
        setup = self._login()
        self.assertEqual(setup.status_code, 200)
        self.assertTrue(setup.json["totp_enrollment_required"])
        secret = setup.json["totp_secret"]
        code = generate_totp_code(secret, timestamp=6000)
        with patch.object(auth_routes, "_totp_timestamp", return_value=6000):
            confirmed = self.client.post("/api/auth/staff/totp/enroll/confirm", json={
                "setup_token": setup.json["setup_token"], "code": code,
            })
        self.assertEqual(confirmed.status_code, 200)
        return secret, confirmed.json

    def test_enrollment_returns_qr_uri_once_only_backup_codes_and_stores_hashes(self):
        setup = self._login()
        self.assertIn("otpauth://totp/", setup.json["otpauth_uri"])
        self.assertTrue(setup.json["totp_secret"])
        code = generate_totp_code(setup.json["totp_secret"], timestamp=6000)
        with patch.object(auth_routes, "_totp_timestamp", return_value=6000):
            confirmed = self.client.post("/api/auth/staff/totp/enroll/confirm", json={
                "setup_token": setup.json["setup_token"], "code": code,
            })
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(len(confirmed.json["backup_codes"]), 10)
        self.assertTrue(db.session.get(User, self.admin.id).totp_enabled)
        for raw_code in confirmed.json["backup_codes"]:
            self.assertNotIn(raw_code, str(db.session.get(User, self.admin.id).totp_backup_codes_hashes))
        self.assertTrue(confirmed.json["access_token"])

    def test_correct_authenticator_code_completes_login(self):
        secret, _ = self._enroll()
        challenge = self._login()
        self.assertTrue(challenge.json["totp_required"])
        code = generate_totp_code(secret, timestamp=6030)
        with patch.object(auth_routes, "_totp_timestamp", return_value=6030):
            result = self.client.post("/api/auth/staff/totp/verify", json={
                "challenge_token": challenge.json["challenge_token"], "code": code,
            })
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json["access_token"])

    def test_wrong_authenticator_code_has_generic_failure(self):
        self._enroll()
        challenge = self._login()
        with patch.object(auth_routes, "_totp_timestamp", return_value=6060):
            result = self.client.post("/api/auth/staff/totp/verify", json={
                "challenge_token": challenge.json["challenge_token"], "code": "000000",
            })
        self.assertEqual(result.status_code, 401)
        self.assertEqual(result.json, {"error": "Incorrect email or password"})

    def test_backup_code_is_single_use(self):
        _, enrollment = self._enroll()
        raw_code = enrollment["backup_codes"][0]
        challenge = self._login()
        used = self.client.post("/api/auth/staff/totp/verify", json={
            "challenge_token": challenge.json["challenge_token"], "code": raw_code,
        })
        self.assertEqual(used.status_code, 200)
        next_challenge = self._login()
        reused = self.client.post("/api/auth/staff/totp/verify", json={
            "challenge_token": next_challenge.json["challenge_token"], "code": raw_code,
        })
        self.assertEqual(reused.status_code, 401)
        self.assertEqual(reused.json, {"error": "Incorrect email or password"})

    def test_five_failed_codes_lock_account_and_log_event(self):
        self._enroll()
        challenge = self._login().json["challenge_token"]
        for _ in range(5):
            response = self.client.post("/api/auth/staff/totp/verify", json={
                "challenge_token": challenge, "code": "bad-code",
            })
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json, {"error": "Incorrect email or password"})
        locked = db.session.get(User, self.admin.id)
        self.assertIsNotNone(locked.login_locked_until)
        self.assertTrue(SystemLog.query.filter(SystemLog.action.like("Login locked after repeated failures%")).first())

    def test_challenge_token_cannot_access_admin_endpoint(self):
        challenge = self._login().json["setup_token"]
        response = self.client.get("/api/admin/mfa-recovery-requests", headers={
            "Authorization": f"Bearer {challenge}",
        })
        self.assertEqual(response.status_code, 403)

    def test_recovery_requires_and_uses_a_different_admin_approval(self):
        self._enroll()
        challenge = self._login().json["challenge_token"]
        requested = self.client.post("/api/auth/staff/totp/recovery", json={
            "challenge_token": challenge,
        })
        self.assertEqual(requested.status_code, 202)
        recovery = AdminMfaRecoveryRequest.query.one()

        self_token = create_access_token(identity=str(self.admin.id), additional_claims={
            "account_type": "user", "role": "admin", "mfa_verified": True, "mfa_version": self.admin.mfa_version,
        })
        self_approval = self.client.post(
            f"/api/admin/mfa-recovery-requests/{recovery.id}/approve",
            headers={"Authorization": f"Bearer {self_token}"},
        )
        self.assertEqual(self_approval.status_code, 404)

        other_admin = User(
            name="Second Admin",
            email="second-admin@example.test",
            password_hash=generate_password_hash("Admin-password-123!"),
            role="admin",
            is_active=True,
        )
        db.session.add(other_admin)
        db.session.commit()
        other_token = create_access_token(identity=str(other_admin.id), additional_claims={
            "account_type": "user", "role": "admin", "mfa_verified": True, "mfa_version": 0,
        })
        approved = self.client.post(
            f"/api/admin/mfa-recovery-requests/{recovery.id}/approve",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        self.assertEqual(approved.status_code, 200)
        db.session.refresh(self.admin)
        self.assertFalse(self.admin.totp_enabled)
        self.assertEqual(self.admin.mfa_version, 2)

    def test_lgu_totp_is_optional_unless_configured(self):
        lgu = User(
            name="Test LGU", email="lgu@example.test",
            password_hash=generate_password_hash("LGU-password-123!"),
            role="lgu_personnel", is_active=True,
        )
        db.session.add(lgu)
        db.session.commit()
        plain = self.client.post("/api/auth/login", json={
            "email": lgu.email, "password": "LGU-password-123!",
        })
        self.assertIn("access_token", plain.json)
        self.app.config["LGU_TOTP_REQUIRED"] = True
        required = self.client.post("/api/auth/login", json={
            "email": lgu.email, "password": "LGU-password-123!",
        })
        self.assertTrue(required.json["totp_enrollment_required"])
        self.app.config["LGU_TOTP_REQUIRED"] = False

    def test_second_factor_shares_staff_login_rate_limit(self):
        self._enroll()
        _login_rate_buckets.clear()
        previous_limit = self.app.config["LOGIN_RATE_LIMIT_MAX_REQUESTS"]
        self.app.config["LOGIN_RATE_LIMIT_MAX_REQUESTS"] = 1
        try:
            challenge = self._login().json["challenge_token"]
            limited = self.client.post("/api/auth/staff/totp/verify", json={
                "challenge_token": challenge, "code": "000000",
            })
            self.assertEqual(limited.status_code, 429)
            self.assertIn("Too many attempts", limited.json["error"])
        finally:
            self.app.config["LOGIN_RATE_LIMIT_MAX_REQUESTS"] = previous_limit


if __name__ == "__main__":
    unittest.main()
