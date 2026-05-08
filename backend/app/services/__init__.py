"""
Business logic services live here, separated from API routes.
Examples: storage_service (R2 uploads), email_service (Postmark),
billing_service (Stripe), ai_service (Replicate/PhotoRoom).
"""
from app.services import auth_service, email_service, job_service, participant_service  # noqa: F401
