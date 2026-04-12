// ============================================
// Tip For Me Backend — server.js
// Node.js + Express + Stripe Connect
// ============================================

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET nie jest ustawiony — ustaw zmienną środowiskową na Render.com');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-set-JWT_SECRET-on-render';

// Szuka konta Stripe po emailu z obsługą paginacji (> 100 kont)
// Zwraca WSZYSTKIE konta z danym emailem
async function findAllStripeAccountsByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const results = [];
  let startingAfter = undefined;
  while (true) {
    const batch = await stripe.accounts.list({
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    });
    for (const a of batch.data) {
      if (a.email === normalizedEmail) results.push(a);
    }
    if (!batch.has_more) break;
    startingAfter = batch.data[batch.data.length - 1].id;
  }
  return results;
}

// Zachowane dla kompatybilności — zwraca pierwsze konto (używane przy rejestracji)
async function findStripeAccountByEmail(email) {
  const all = await findAllStripeAccountsByEmail(email);
  return all[0] || null;
}
const JWT_EXPIRES = '30d';

function createToken(accountId, email) {
  return jwt.sign({ accountId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authenticateToken(req, res, next) {
  const auth = req.headers['authorization'];
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Brak tokenu. Zaloguj się ponownie.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesja wygasła. Zaloguj się ponownie.' });
  }
}

function validateAccountId(id) {
  return typeof id === 'string' && id.startsWith('acct_') && id.length < 50;
}

// W produkcji nie ujawniamy szczegółów błędów Stripe/wewnętrznych
function safeError(error) {
  if (process.env.NODE_ENV === 'production') return 'Błąd serwera — spróbuj ponownie';
  return error.message;
}

function requireOwnership(req, res, next) {
  const id = req.params.accountId || req.body.stripeAccountId;
  if (!validateAccountId(id)) {
    return res.status(400).json({ error: 'Nieprawidłowe ID konta' });
  }
  if (req.user.accountId !== id) {
    return res.status(403).json({ error: 'Brak uprawnień do tego konta' });
  }
  next();
}

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
  tls: { rejectUnauthorized: false },
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const rateLimit = require('express-rate-limit');

const app = express();

// CORS — tylko znane originy
const allowedOrigins = ['https://tipme.drinki.pl', 'https://tipme-backend-2rcv.onrender.com'];
app.use(cors({
  origin: (origin, callback) => {
    // Przepuść requesty bez origina (aplikacja mobilna) lub ze znanych domen
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));

// Rate limiting — max 100 requestów na 15 minut per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// Ostrzejszy limit na tworzenie kont
const accountLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
app.use('/api/create-connected-account', accountLimiter);

// Limit na logowanie — zapobiega brute-force atakowi na hasła
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Za dużo prób logowania. Poczekaj 15 minut.' } });
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/set-password', loginLimiter);

// Limit na wysyłanie emaili — zapobiega spamowaniu przez skompromitowany token
const receiptLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Zbyt wiele potwierdzeń. Poczekaj godzinę.' } });
app.use('/api/send-receipt', receiptLimiter);

// Webhook musi mieć raw body PRZED express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing stripe-signature header');
  if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(500).send('Webhook secret not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'account.updated':
    default:
      break;
  }
  res.json({ received: true });
});

app.use(express.json());

// Health check przed API key — UptimeRobot nie wysyła X-Api-Key
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ============================================
// SECURITY — weryfikacja API key
// Ustaw API_SECRET w zmiennych środowiskowych na Render.com
// i tę samą wartość jako API_KEY w app/config.ts
// ============================================
app.use((req, res, next) => {
  const secret = process.env.API_SECRET;
  if (!secret) {
    console.warn('⚠️  API_SECRET nie jest ustawiony — API jest otwarty!');
    return next();
  }
  if (req.headers['x-api-key'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ============================================
// Twoja prowizja (w groszach!)
// 5% = mnożnik 0.05
// Przykład: napiwek 20 zł = 2000 gr → prowizja = 100 gr = 1 zł
// ============================================
const PLATFORM_FEE_PERCENT = 0.05; // 5% — prowizja platformy

// ============================================
// 1. STRIPE CONNECT — Rejestracja użytkownika
// Tworzy konto Stripe dla nowego użytkownika
// ============================================
app.post('/api/create-connected-account', async (req, res) => {
  try {
    const { email, firstName, lastName, password } = req.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Nieprawidłowy adres email' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków' });
    }

    // Sprawdź czy konto z tym emailem już istnieje — odrzuć KAŻDE (nie tylko charges_enabled)
    const found = await findStripeAccountByEmail(email);
    if (found) {
      return res.status(409).json({
        error: 'Konto z tym emailem już istnieje. Użyj opcji "Mam już konto — zaloguj się".',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const accountData = {
      // Accounts v2 — jawnie Express dashboard (nie Standard/full)
      // Stripe zbiera KYC zamiast nas — kelner podaje tylko minimum (imię, konto bankowe)
      // Bez pola "business name" wymaganego przy Standard/dashboard:full
      controller: {
        stripe_dashboard: { type: 'express' }, // Express Dashboard dla kelnera
        requirement_collection: 'stripe',       // Stripe odpowiada za zbieranie KYC
        losses: { payments: 'stripe' },
        fees: { payer: 'account' },             // connected account płaci Stripe fees
      },
      country: 'PL',
      email: email.toLowerCase().trim(),
      business_type: 'individual',
      business_profile: {
        // Unikalna nazwa na podstawie imienia/nazwiska — zapobiega flagowaniu przez Stripe
        // (dziesiątki kont z identyczną nazwą i URL triggują fraud detection)
        name: [firstName, lastName].filter(Boolean).join(' ').trim() || email.split('@')[0],
        mcc: '7299', // MCC 7299 = Personal Services (zbliżone do napiwków)
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        // Automatyczna wypłata dzienna — środki trafiają na konto bankowe bez akcji użytkownika
        // delay_days: 'minimum' = Stripe używa najkrótszego dopuszczalnego okresu dla PL
        // Polska: 7 dni kalendarzowych dla nowego konta, potem 3 dni robocze domyślnie
        payouts: { schedule: { interval: 'daily', delay_days: 'minimum' } },
      },
      metadata: { password_hash: passwordHash },
    };

    if (firstName || lastName) {
      accountData.individual = {
        ...(firstName && { first_name: firstName.trim().slice(0, 50) }),
        ...(lastName && { last_name: lastName.trim().slice(0, 50) }),
        email: email.toLowerCase().trim(),
      };
    }

    const account = await stripe.accounts.create(accountData);

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
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 2a. LOGOWANIE — znajdź konto po emailu
// ============================================
// ============================================
// AUTH — Logowanie (email + hasło)
// ============================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Podaj email i hasło' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Nieprawidłowy adres email' });
    }

    // Znajdź wszystkie konta z tym emailem
    const accounts = await findAllStripeAccountsByEmail(email);
    if (!accounts.length) {
      return res.status(404).json({ error: 'Nie znaleziono konta dla tego emaila' });
    }

    // Sprawdź hasło dla każdego konta — znajdź to gdzie pasuje
    // Preferuj: charges_enabled > details_submitted > reszta
    const sorted = accounts.sort((a, b) => {
      if (a.charges_enabled && !b.charges_enabled) return -1;
      if (!a.charges_enabled && b.charges_enabled) return 1;
      if (a.details_submitted && !b.details_submitted) return -1;
      if (!a.details_submitted && b.details_submitted) return 1;
      return 0;
    });

    let match = null;
    let needsPassword = false;

    for (const account of sorted) {
      const hash = account.metadata?.password_hash;
      if (!hash) {
        if (!match) needsPassword = true;
        continue;
      }
      const valid = await bcrypt.compare(password, hash);
      if (valid) {
        match = account;
        needsPassword = false;
        break;
      }
    }

    if (!match && needsPassword) {
      return res.status(403).json({
        error: 'Konto wymaga ustawienia hasła.',
        needsPassword: true,
        accountId: sorted[0].id,
      });
    }
    if (!match) {
      return res.status(401).json({ error: 'Nieprawidłowe hasło' });
    }

    // Token wydawany zawsze gdy hasło poprawne — niezależnie od statusu Stripe
    const token = createToken(match.id, email);

    res.json({
      accountId: match.id,
      chargesEnabled: match.charges_enabled,
      detailsSubmitted: match.details_submitted,
      token,
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
  }
});

// Endpointy administracyjne (update-business-profile, cleanup-restricted-accounts)
// zostały usunięte — były bez autentykacji i nie są potrzebne w produkcji

// ============================================
// AUTH — Ustawienie hasła dla kont bez hasła (migracja)
// ============================================
app.post('/api/auth/set-password', async (req, res) => {
  try {
    const { accountId, email, password } = req.body;
    if (!accountId || !email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków' });
    }
    if (!validateAccountId(accountId)) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta' });
    }

    const account = await stripe.accounts.retrieve(accountId);

    // Weryfikuj że email zgadza się z kontem — zapobiega ustawieniu hasła na cudzym koncie
    if (!account.email || account.email.toLowerCase() !== email.toLowerCase().trim()) {
      return res.status(403).json({ error: 'Brak uprawnień do tego konta' });
    }

    if (account.metadata?.password_hash) {
      return res.status(409).json({ error: 'Konto ma już ustawione hasło. Użyj logowania.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await stripe.accounts.update(accountId, { metadata: { password_hash: passwordHash } });

    const token = createToken(accountId, account.email);
    res.json({
      accountId,
      chargesEnabled: account.charges_enabled,
      token,
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 2. SPRAWDZANIE STATUSU KONTA
// Czy użytkownik dokończył onboarding Stripe?
// ============================================
app.get('/api/account-status/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    if (!validateAccountId(accountId)) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta' });
    }
    const account = await stripe.accounts.retrieve(accountId, {
      expand: ['capabilities'],
    });

    // Jeśli capabilities są paused — spróbuj je ponownie aktywować
    const caps = account.capabilities || {};
    const needsReactivation =
      caps.card_payments === 'inactive' || caps.card_payments === 'paused' ||
      caps.transfers === 'inactive' || caps.transfers === 'paused';

    if (needsReactivation) {
      await stripe.accounts.update(account.id, {
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
    }

    // Token tylko jeśli konto aktywne I ma ustawione hasło przez naszą aplikację.
    // Zapobiega uzyskaniu tokenu przez kogoś kto zna tylko acct_ ID.
    const hasPassword = !!account.metadata?.password_hash;
    const token = (account.charges_enabled && hasPassword)
      ? createToken(account.id, account.email)
      : null;

    res.json({
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      capabilitiesStatus: caps.card_payments,
      token,
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 3a. LOCATION — tworzenie lokalizacji dla Stripe Terminal
// Wymagane przed pierwszym użyciem Tap to Pay
// ============================================
app.post('/api/create-location', authenticateToken, async (req, res) => {
  try {
    const { stripeAccountId, displayName } = req.body;

    if (!validateAccountId(stripeAccountId)) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta Stripe' });
    }
    if (req.user.accountId !== stripeAccountId) {
      return res.status(403).json({ error: 'Brak uprawnień do tego konta' });
    }
    const safeName = (typeof displayName === 'string' && displayName.trim().length > 0)
      ? displayName.trim().slice(0, 100)
      : 'Tip For Me';

    const location = await stripe.terminal.locations.create(
      {
        display_name: safeName,
        address: {
          country: 'PL',
          city: 'Warszawa',
          line1: 'Marszalkowska 1',
          postal_code: '00-624',
        },
      },
      { stripeAccount: stripeAccountId }
    );

    res.json({ locationId: location.id });
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 3. CONNECTION TOKEN — dla Stripe Terminal SDK
// Aplikacja mobilna potrzebuje tego tokenu
// aby połączyć się z Tap to Pay
// ============================================
app.post('/api/connection-token', authenticateToken, async (req, res) => {
  try {
    const { stripeAccountId } = req.body;
    if (!validateAccountId(stripeAccountId)) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta Stripe' });
    }
    if (req.user.accountId !== stripeAccountId) {
      return res.status(403).json({ error: 'Brak uprawnień do tego konta' });
    }

    const token = await stripe.terminal.connectionTokens.create(
      {},
      { stripeAccount: stripeAccountId }
    );

    res.json({ secret: token.secret });
  } catch (error) {
    console.error('Connection token error:', error);
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 4. PAYMENT INTENT — Tworzenie płatności
// Z automatyczną prowizją dla platformy
// ============================================
app.post('/api/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { amount, stripeAccountId } = req.body;

    if (!amount || !Number.isInteger(amount) || amount < 200 || amount > 100000) {
      return res.status(400).json({ error: 'Minimalna kwota napiwku to 2 zł' });
    }
    if (!stripeAccountId || !stripeAccountId.startsWith('acct_')) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta Stripe' });
    }
    // Weryfikacja: użytkownik może tworzyć płatności tylko na swoim koncie
    if (req.user.accountId !== stripeAccountId) {
      return res.status(403).json({ error: 'Brak uprawnień do tego konta' });
    }

    // amount w groszach (np. 2000 = 20 zł)
    const applicationFee = Math.round(amount * PLATFORM_FEE_PERCENT);

    // Idempotency key zapobiega podwójnym płatnościom przy ponowieniu requestu
    const idempotencyKey = req.headers['idempotency-key'];

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amount,
        currency: 'pln',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        application_fee_amount: applicationFee,
        description: 'Tip For Me - napiwek',
      },
      {
        stripeAccount: stripeAccountId,
        ...(idempotencyKey && { idempotencyKey }),
      }
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      applicationFee: applicationFee,
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 4b. ANULOWANIE PAYMENT INTENT
// Wywoływane gdy użytkownik wychodzi z TapScreen
// ============================================
app.post('/api/cancel-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId, stripeAccountId } = req.body;
    if (!paymentIntentId || !stripeAccountId) {
      return res.status(400).json({ error: 'Brak paymentIntentId lub stripeAccountId' });
    }
    if (!validateAccountId(stripeAccountId)) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta' });
    }
    if (req.user.accountId !== stripeAccountId) {
      return res.status(403).json({ error: 'Brak uprawnień do tego konta' });
    }
    await stripe.paymentIntents.cancel(paymentIntentId, {}, { stripeAccount: stripeAccountId });
    res.json({ canceled: true });
  } catch (error) {
    // Jeśli PI jest już w stanie którego nie można anulować — ignoruj cicho
    res.json({ canceled: false, reason: error.message });
  }
});

// ============================================
// 5. HISTORIA TRANSAKCJI
// Pobiera ostatnie napiwki użytkownika
// ============================================
app.get('/api/transactions/:accountId', authenticateToken, requireOwnership, async (req, res) => {
  try {
    const { accountId } = req.params;
    const rawLimit = parseInt(req.query.limit) || 20;
    const limit = Math.min(Math.max(rawLimit, 1), 100);

    const charges = await stripe.charges.list(
      { limit },
      { stripeAccount: accountId }
    );

    const transactions = charges.data.filter(c => c.status === 'succeeded').map((charge) => ({
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
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// Pomocnicza — przedział czasowy dnia w strefie PL (Europe/Warsaw)
// ============================================
function getPolandDayBounds(dateStr) {
  // dateStr: 'YYYY-MM-DD' lub null (= dziś)
  const now = new Date();
  const polandOffset = getPLOffset(now);

  let year, month, day;
  if (dateStr) {
    [year, month, day] = dateStr.split('-').map(Number);
  } else {
    const pl = new Date(now.getTime() + polandOffset * 3600000);
    year = pl.getUTCFullYear();
    month = pl.getUTCMonth() + 1;
    day = pl.getUTCDate();
  }

  const pad = (n) => String(n).padStart(2, '0');
  const startISO = `${year}-${pad(month)}-${pad(day)}T00:00:00`;
  const endISO   = `${year}-${pad(month)}-${pad(day)}T23:59:59`;

  // Zamień na UTC timestamp
  const startUTC = new Date(startISO + (polandOffset >= 0 ? `+0${polandOffset}:00` : `-0${Math.abs(polandOffset)}:00`));
  const endUTC   = new Date(endISO   + (polandOffset >= 0 ? `+0${polandOffset}:00` : `-0${Math.abs(polandOffset)}:00`));

  return {
    gte: Math.floor(startUTC.getTime() / 1000),
    lte: Math.floor(endUTC.getTime() / 1000),
  };
}

// Polska strefa: UTC+1 (CET zima) lub UTC+2 (CEST lato)
// Używamy UTC — nie zależy od strefy serwera
function getPLOffset(date) {
  const y = date.getUTCFullYear();
  // Ostatnia niedziela marca (zmiana na CEST o 01:00 UTC)
  const marchEnd = new Date(Date.UTC(y, 2, 31));
  marchEnd.setUTCDate(31 - marchEnd.getUTCDay());
  const dstStart = new Date(marchEnd.getTime() + 3600000); // 01:00 UTC
  // Ostatnia niedziela października (zmiana na CET o 01:00 UTC)
  const octEnd = new Date(Date.UTC(y, 9, 31));
  octEnd.setUTCDate(31 - octEnd.getUTCDay());
  const dstEnd = new Date(octEnd.getTime() + 3600000); // 01:00 UTC
  return (date >= dstStart && date < dstEnd) ? 2 : 1;
}

// ============================================
// 6. STATYSTYKI — z obsługą daty i strefy PL
// ============================================
app.get('/api/stats/:accountId', authenticateToken, requireOwnership, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { date } = req.query;

    // Walidacja formatu daty — tylko YYYY-MM-DD
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Nieprawidłowy format daty (oczekiwano YYYY-MM-DD)' });
    }

    const bounds = getPolandDayBounds(date || null);

    // balance_transactions zawierają dokładne opłaty pobrane przez Stripe
    // Paginacja — pobieramy wszystkie transakcje z danego dnia (może być > 100)
    const allTxns = [];
    let startingAfter;
    while (true) {
      const batch = await stripe.balanceTransactions.list(
        { created: bounds, limit: 100, ...(startingAfter && { starting_after: startingAfter }) },
        { stripeAccount: accountId }
      );
      allTxns.push(...batch.data);
      if (!batch.has_more) break;
      startingAfter = batch.data[batch.data.length - 1].id;
    }

    const successful = allTxns.filter((t) =>
      (t.status === 'available' || t.status === 'pending') &&
      (t.type === 'payment' || t.type === 'charge') &&
      t.amount > 0
    );

    const totalAmount    = successful.reduce((sum, t) => sum + t.amount, 0) / 100;
    const totalStripeFee = successful.reduce((sum, t) => sum + t.fee, 0) / 100;
    const totalNet       = successful.reduce((sum, t) => sum + t.net, 0) / 100;
    const count          = successful.length;
    const average        = count > 0 ? totalAmount / count : 0;

    // net z Stripe już zawiera potrącenie application_fee (prowizja platformy 5%)
    // oraz opłaty Stripe Terminal — nie odejmujemy ponownie
    const platformFee = totalAmount * PLATFORM_FEE_PERCENT;

    res.json({
      today: {
        total: totalAmount,
        count,
        average,
        stripeFee: totalStripeFee,
        platformFee,
        net: Math.max(0, totalNet),   // już po wszystkich potrąceniach
      },
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 7. PARAGON EMAILEM — potwierdzenie dla klienta
// ============================================
const escapeHtml = (str) => String(str)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

app.post('/api/send-receipt', authenticateToken, async (req, res) => {
  try {
    const { email, amount, last4, paymentMethod, date } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Nieprawidłowy adres email' });
    }
    if (typeof amount !== 'string' && (isNaN(Number(amount)) || Number(amount) < 0)) {
      return res.status(400).json({ error: 'Nieprawidłowa kwota' });
    }
    if (!last4 || typeof last4 !== 'string' || !/^(\d{4}|\*{4})$/.test(last4)) {
      return res.status(400).json({ error: 'Nieprawidłowy numer karty' });
    }
    if (!paymentMethod || typeof paymentMethod !== 'string' || paymentMethod.length > 100) {
      return res.status(400).json({ error: 'Nieprawidłowa metoda płatności' });
    }

    const safeAmount = escapeHtml(amount);
    const safeLast4 = escapeHtml(last4);
    const safeMethod = escapeHtml(paymentMethod);
    const safeDate = escapeHtml(date || '');

    await mailer.sendMail({
      from: `"Tip For Me" <${process.env.SMTP_USER}>`,
      to: email.trim(),
      subject: `Potwierdzenie napiwku — ${safeAmount} zł`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0c0a13;color:#f3f0ff;padding:40px 32px;border-radius:20px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:48px;margin-bottom:8px;">✓</div>
            <h1 style="font-size:28px;font-weight:900;color:#10B981;margin:0;">Płatność przyjęta</h1>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(149,76,233,0.2);border-radius:16px;padding:24px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">KWOTA</span>
              <span style="font-size:24px;font-weight:900;color:#10B981;">${safeAmount} zł</span>
            </div>
            <div style="border-top:1px solid rgba(149,76,233,0.15);padding-top:16px;display:flex;justify-content:space-between;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">KARTA</span>
              <span style="color:#A78BFA;font-weight:600;">${safeMethod} ••${safeLast4}</span>
            </div>
            <div style="border-top:1px solid rgba(149,76,233,0.15);padding-top:16px;margin-top:16px;display:flex;justify-content:space-between;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">DATA</span>
              <span style="color:#A78BFA;font-weight:600;">${safeDate}</span>
            </div>
          </div>
          <p style="color:#6B7280;font-size:12px;text-align:center;line-height:20px;">
            Napiwek przekazany za pomocą <strong style="color:#C084FC;">Tip For Me</strong>.<br/>
            Płatności obsługuje Stripe Payments Europe Ltd.
          </p>
        </div>
      `,
    });

    res.json({ sent: true });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 8. SALDO KONTA — ile jest dostępne do wypłaty
// ============================================
app.get('/api/balance/:accountId', authenticateToken, requireOwnership, async (req, res) => {
  try {
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: req.params.accountId }
    );

    const available = balance.available.find((b) => b.currency === 'pln');
    const pending = balance.pending.find((b) => b.currency === 'pln');

    res.json({
      available: (available?.amount || 0) / 100,
      pending: (pending?.amount || 0) / 100,
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 7a. SZCZEGÓŁY KONTA KELNERA
// ============================================
app.get('/api/account-details/:accountId', authenticateToken, requireOwnership, async (req, res) => {
  try {
    const account = await stripe.accounts.retrieve(req.params.accountId);
    const bankAccount = account.external_accounts?.data?.[0];
    res.json({
      email: account.email,
      displayName: account.settings?.dashboard?.display_name || '',
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      bankAccount: bankAccount ? {
        bankName: bankAccount.bank_name || 'Bank',
        last4: bankAccount.last4,
        currency: bankAccount.currency?.toUpperCase(),
      } : null,
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 7b. HISTORIA WYPŁAT
// ============================================
app.get('/api/payouts/:accountId', authenticateToken, requireOwnership, async (req, res) => {
  try {
    const payouts = await stripe.payouts.list(
      { limit: 20 },
      { stripeAccount: req.params.accountId }
    );
    res.json({
      payouts: payouts.data.map(p => ({
        id: p.id,
        amount: p.amount / 100,
        status: p.status,
        arrivalDate: p.arrival_date, // Unix timestamp — klient mnoży przez 1000
        created: p.created,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
  }
});

// ============================================
// 8. LINK DO STRIPE DASHBOARD — zarządzanie kontem
// ============================================
app.get('/api/dashboard-link/:accountId', authenticateToken, requireOwnership, async (req, res) => {
  try {
    const accountId = req.params.accountId;
    const account = await stripe.accounts.retrieve(accountId);

    if (!account.details_submitted) {
      // Onboarding niekompletny — wyślij z powrotem do formularza Stripe
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.APP_URL}/stripe/refresh`,
        return_url: `${process.env.APP_URL}/stripe/success`,
        type: 'account_onboarding',
      });
      return res.json({ url: accountLink.url, requiresOnboarding: true });
    }

    // Próbujemy createLoginLink (działa dla Express dashboard)
    // Jeśli konto ma dashboard: full (Standard-like), używamy głównego dashboardu Stripe
    try {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return res.json({ url: loginLink.url });
    } catch {
      // dashboard: full — kelner loguje się bezpośrednio na stripe.com
      return res.json({ url: 'https://dashboard.stripe.com/login' });
    }
  } catch (error) {
    console.error('Dashboard link error:', error.message);
    res.status(500).json({ error: safeError(error) });
  }
});

// Endpoint /api/payout usunięty — wypłaty są automatyczne (schedule: daily)
// Stripe sam przelewa dostępne środki co dzień na konto bankowe kelnera


// Webhook zarejestrowany na górze pliku (przed express.json())

// Globalny error handler — nie ujawnia stack trace w produkcji
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Błąd serwera' : err.message });
});


// ============================================
// START SERWERA
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   💜 Tip For Me Backend uruchomiony!     ║
  ║   Port: ${PORT}                         ║
  ║   Prowizja: ${PLATFORM_FEE_PERCENT * 100}%                      ║
  ╚══════════════════════════════════════╝
  `);
});
