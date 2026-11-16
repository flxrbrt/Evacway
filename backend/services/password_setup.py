import hashlib
import hmac
import secrets

from flask import current_app
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


PASSWORD_SETUP_SALT = "evacway-password-setup"


def _serializer():
    return URLSafeTimedSerializer(
        current_app.config["JWT_SECRET_KEY"],
        salt=PASSWORD_SETUP_SALT,
    )


def password_fingerprint(password_hash):
    """Short digest of current password hash so tokens become single-use once password changes."""
    return hashlib.sha256(str(password_hash or "").encode("utf-8")).hexdigest()[:16]


def is_token_password_current(payload, current_password_hash):
    """Verify the token's password fingerprint still matches the account's current password hash."""
    token_pfp = (payload or {}).get("pfp")
    if not token_pfp:
        return True
    return hmac.compare_digest(str(token_pfp), password_fingerprint(current_password_hash))


def create_password_setup_token(user_or_account):
    """Create a 60-minute, single-use password setup/reset token for a User or ResidentAccount."""
    payload = {
        "user_id": user_or_account.id,
        "email": user_or_account.email,
        "account_type": "resident_account" if hasattr(user_or_account, "resident_id") else "user",
        "pfp": password_fingerprint(getattr(user_or_account, "password_hash", "")),
        "jti": secrets.token_urlsafe(12),
    }
    return _serializer().dumps(payload)


def read_password_setup_token(token):
    try:
        payload = _serializer().loads(
            token,
            max_age=current_app.config.get("PASSWORD_SETUP_TOKEN_MAX_AGE", 3600),
        )
    except SignatureExpired:
        return None, "This password link has expired. Request a new one."
    except BadSignature:
        return None, "This password link is invalid. Request a new one."

    return payload, None