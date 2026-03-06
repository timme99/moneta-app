/**
 * api/stripe-checkout.ts
 *
 * Erstellt eine Stripe Checkout Session und gibt die URL zurück.
 *
 * Benötigte Umgebungsvariablen:
 *   STRIPE_SECRET_KEY  – Stripe Secret Key (sk_live_... oder sk_test_...)
 *   APP_URL            – Basis-URL der App (z. B. https://moneta.app)
 *
 * Request Body:
 *   { plan: 'premium_monthly' | 'premium_yearly', userId: string }
 *
 * Response:
 *   { url: string }  – Stripe Checkout URL für Client-Redirect
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const APP_URL           = process.env.APP_URL ?? 'https://moneta.app';

// Stripe Price IDs – in Stripe Dashboard anlegen
const PRICE_IDS: Record<string, string> = {
  premium_monthly: process.env.STRIPE_PRICE_MONTHLY ?? 'price_monthly_placeholder',
  premium_yearly:  process.env.STRIPE_PRICE_YEARLY  ?? 'price_yearly_placeholder',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === '') {
    // Dev-Fallback: Upgrade-Seite oder mailto
    return res.status(200).json({ url: `mailto:hello@moneta.app?subject=Moneta Premium` });
  }

  const { plan = 'premium_monthly', userId } = req.body ?? {};
  const priceId = PRICE_IDS[plan];

  if (!priceId) {
    return res.status(400).json({ error: `Unbekannter Plan: ${plan}` });
  }

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'payment_method_types[]':        'card',
        'mode':                          'subscription',
        'line_items[0][price]':          priceId,
        'line_items[0][quantity]':       '1',
        'success_url':                   `${APP_URL}/?upgraded=1`,
        'cancel_url':                    `${APP_URL}/`,
        ...(userId ? { 'client_reference_id': userId } : {}),
        'metadata[user_id]':             userId ?? '',
        'metadata[plan]':                plan,
      }).toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json();
      console.error('[stripe-checkout] Stripe error:', err);
      return res.status(500).json({ error: err?.error?.message ?? 'Stripe-Fehler' });
    }

    const session = await stripeRes.json();
    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error('[stripe-checkout] fetch error:', e?.message);
    return res.status(500).json({ error: 'Checkout konnte nicht erstellt werden.' });
  }
}
