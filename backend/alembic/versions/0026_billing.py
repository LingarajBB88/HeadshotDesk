"""Stripe billing (HSD-21, D-023)

Adds the subscription state Stripe owns and we mirror:

  stripe_subscription_id  the live subscription, if any
  subscription_status     Stripe's own status string (active, trialing,
                          past_due, canceled, unpaid, incomplete, ...)
  current_period_end      when the paid period runs out
  billing_currency        usd or eur, fixed at first checkout so a customer
                          never sees their price flip currency

and the 'starter' plan from D-023 to the plan check. 'solo' stays allowed
for any row created under the old ladder (D-007).

The plan check is dropped by definition rather than by name: production's
0001 created its checks inline and unnamed (HSD-78), so the name in the
models may not exist there.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

_PLANS_NEW = (
    "plan IN ('trial', 'beta', 'starter', 'solo', 'pro', 'studio', "
    "'hibernate', 'cancelled')"
)
_PLANS_OLD = (
    "plan IN ('trial', 'beta', 'solo', 'pro', 'studio', 'hibernate', "
    "'cancelled')"
)


def _drop_plan_checks() -> None:
    op.execute(
        """
        DO $$
        DECLARE c record;
        BEGIN
          FOR c IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'accounts'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%plan%'
          LOOP
            EXECUTE format('ALTER TABLE accounts DROP CONSTRAINT %I', c.conname);
          END LOOP;
        END $$;
        """
    )


def upgrade() -> None:
    op.add_column("accounts", sa.Column("stripe_subscription_id", sa.String(), nullable=True))
    op.add_column("accounts", sa.Column("subscription_status", sa.String(), nullable=True))
    op.add_column(
        "accounts",
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("accounts", sa.Column("billing_currency", sa.String(), nullable=True))
    op.create_index(
        "uq_accounts_stripe_subscription_id",
        "accounts",
        ["stripe_subscription_id"],
        unique=True,
    )
    _drop_plan_checks()
    op.create_check_constraint("ck_accounts_plan", "accounts", _PLANS_NEW)


def downgrade() -> None:
    _drop_plan_checks()
    op.execute("UPDATE accounts SET plan = 'solo' WHERE plan = 'starter'")
    op.create_check_constraint("ck_accounts_plan", "accounts", _PLANS_OLD)
    op.drop_index("uq_accounts_stripe_subscription_id", table_name="accounts")
    op.drop_column("accounts", "billing_currency")
    op.drop_column("accounts", "current_period_end")
    op.drop_column("accounts", "subscription_status")
    op.drop_column("accounts", "stripe_subscription_id")
