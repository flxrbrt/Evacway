"""Resident registration decision email delivery through a small provider interface."""

import logging


logger = logging.getLogger(__name__)


class NotificationProvider:
    """Provider contract for registration decision notifications."""

    def send(self, registration):
        raise NotImplementedError


class EmailNotificationProvider(NotificationProvider):
    def __init__(self, email_sender):
        self.email_sender = email_sender

    def send(self, registration):
        return self.email_sender(registration)


def send_registration_decision_notifications(registration, email_sender):
    """Send a decision email without allowing delivery errors to undo the decision."""
    provider = EmailNotificationProvider(email_sender)
    try:
        provider.send(registration)
        return {"email_sent": True}
    except Exception:
        logger.exception("Registration decision email failed for request %s", registration.id)
        return {"email_sent": False}
