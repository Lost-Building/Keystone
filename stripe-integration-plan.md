# KeyStone Stripe integration plan

## Recommended payment integration

Use Stripe Checkout Sessions for one-time game purchases. KeyStone should never collect or store raw card numbers, CVVs, or bank details.

## Current implementation

- Backend creates Checkout Sessions from authenticated marketplace listings.
- Checkout uses dynamic payment methods by omitting `payment_method_types`.
- Ownership fulfillment is handled by `/api/stripe/webhook`, not by the success page.
- Webhook signatures are verified with `STRIPE_WEBHOOK_SECRET`.
- Direct unpaid marketplace purchases are disabled.
- The database stores checkout order IDs, Stripe Checkout Session IDs, buyer IDs, seller IDs, listing key IDs, amount, currency, and fulfillment status.

## Required Stripe Dashboard setup

- Add `STRIPE_SECRET_KEY` in `backend/.env`. Prefer a restricted API key with permissions for Checkout Sessions and read access needed for webhooks.
- Add `STRIPE_WEBHOOK_SECRET` from the Stripe CLI or Dashboard webhook endpoint.
- Configure the webhook endpoint to send:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`

## Marketplace payout recommendation

When developer payouts are added, use Stripe Connect for a marketplace:

- Dashboard: Express, a lightweight Stripe-hosted view for sellers
- Fee collection: your platform manages pricing
- Negative balance liability: your platform
- Charge pattern: destination charges for one seller per game purchase
- Onboarding: Stripe-hosted or embedded onboarding, so KeyStone does not collect developer PII directly

## Fee model

For destination charges, your platform pays Stripe processing fees. Set platform margin carefully so `application_fee_amount` covers the platform fee plus estimated Stripe fees, or use Stripe's Platform Pricing Tool and monitor margin reports.

## Before launch

- Rotate any Stripe test secret key that appeared in screenshots or chat.
- Use HTTPS for the production app and webhook endpoint.
- Use separate Stripe keys for test and live mode.
- Add refund and dispute webhook handling before enabling real transactions.
- Add Connect onboarding before paying developers.
