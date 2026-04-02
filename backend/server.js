// ============================================
// TipMe Backend — server.js
// Node.js + Express + Stripe Connect
// ============================================

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// Twoja prowizja (w groszach!)
// 5% = mnożnik 0.05
// Przykład: napiwek 20 zł = 2000 gr → prowizja = 100 gr = 1 zł
// ============================================
const PLATFORM_FEE_PERCENT = 0.05; // 5% — zmień na ile chcesz

// ============================================
// 1. STRIPE CONNECT — Rejestracja użytkownika
// Tworzy konto Stripe dla nowego użytkownika
// ============================================
app.post('/api/create-connected-account', async (req, res) => {
  try {
    const { email } = req.body;

    // Tworzy konto Stripe Connect (Standard)
    const account = await stripe.accounts.create({
      type: 'standard',
      email: email,
      country: 'PL',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Generuje link do onboardingu Stripe
    // Użytkownik przechodzi przez formularz Stripe (dane firmy, konto bankowe)
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.APP_URL}/stripe/refresh`,
      return_url: `${process.env.APP_URL}/stripe/success`,
      type: 'account_onboarding',
    });

    res.json({
      accountId: account.id,
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 2. SPRAWDZANIE STATUSU KONTA
// Czy użytkownik dokończył onboarding Stripe?
// ============================================
app.get('/api/account-status/:accountId', async (req, res) => {
  try {
    const account = await stripe.accounts.retrieve(req.params.accountId);

    res.json({
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 3. CONNECTION TOKEN — dla Stripe Terminal SDK
// Aplikacja mobilna potrzebuje tego tokenu
// aby połączyć się z Tap to Pay
// ============================================
app.post('/api/connection-token', async (req, res) => {
  try {
    const { stripeAccountId } = req.body;

    const token = await stripe.terminal.connectionTokens.create(
      {},
      { stripeAccount: stripeAccountId }
    );

    res.json({ secret: token.secret });
  } catch (error) {
    console.error('Connection token error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 4. PAYMENT INTENT — Tworzenie płatności
// Z automatyczną prowizją dla platformy
// ============================================
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, stripeAccountId } = req.body;

    // amount w groszach (np. 2000 = 20 zł)
    const applicationFee = Math.round(amount * PLATFORM_FEE_PERCENT);

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amount,
        currency: 'pln',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        // To jest klucz! application_fee_amount to Twoja prowizja
        application_fee_amount: applicationFee,
        description: 'TipMe - napiwek',
      },
      {
        // Płatność idzie na konto użytkownika (connected account)
        stripeAccount: stripeAccountId,
      }
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      applicationFee: applicationFee,
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 5. HISTORIA TRANSAKCJI
// Pobiera ostatnie napiwki użytkownika
// ============================================
app.get('/api/transactions/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 20 } = req.query;

    const charges = await stripe.charges.list(
      {
        limit: parseInt(limit),
      },
      { stripeAccount: accountId }
    );

    const transactions = charges.data.map((charge) => ({
      id: charge.id,
      amount: charge.amount / 100, // grosze → złotówki
      currency: charge.currency,
      status: charge.status,
      created: new Date(charge.created * 1000).toISOString(),
      paymentMethod: charge.payment_method_details?.card_present
        ? `${charge.payment_method_details.card_present.brand} ••${charge.payment_method_details.card_present.last4}`
        : 'Karta',
    }));

    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 6. STATYSTYKI
// Podsumowanie dzisiejsze dla użytkownika
// ============================================
app.get('/api/stats/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    // Pobranie dzisiejszych transakcji
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const charges = await stripe.charges.list(
      {
        created: { gte: Math.floor(todayStart.getTime() / 1000) },
        limit: 100,
      },
      { stripeAccount: accountId }
    );

    const successful = charges.data.filter((c) => c.status === 'succeeded');
    const totalAmount = successful.reduce((sum, c) => sum + c.amount, 0) / 100;
    const count = successful.length;
    const average = count > 0 ? totalAmount / count : 0;

    res.json({
      today: {
        total: totalAmount,
        count: count,
        average: average,
        netAfterStripeFee: totalAmount * 0.986, // po prowizji Stripe ~1.4%
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 7. WEBHOOK — Stripe powiadamia o zdarzeniach
// (opcjonalne, ale zalecane na produkcji)
// ============================================
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('✅ Napiwek przyjęty:', event.data.object.amount / 100, 'zł');
      break;
    case 'account.updated':
      console.log('👤 Konto zaktualizowane:', event.data.object.id);
      break;
    default:
      console.log('Event:', event.type);
  }

  res.json({ received: true });
});

// ============================================
// START SERWERA
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   💜 TipMe Backend uruchomiony!     ║
  ║   Port: ${PORT}                         ║
  ║   Prowizja: ${PLATFORM_FEE_PERCENT * 100}%                      ║
  ╚══════════════════════════════════════╝
  `);
});
