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

const JWT_SECRET = process.env.JWT_SECRET || 'changeme-set-JWT_SECRET-on-render';
const JWT_EXPIRES = '365d';

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

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
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

app.use(express.json());

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
const PLATFORM_FEE_PERCENT = 0.05; // 5% — zmień na ile chcesz

// ============================================
// 1. STRIPE CONNECT — Rejestracja użytkownika
// Tworzy konto Stripe dla nowego użytkownika
// ============================================
app.post('/api/create-connected-account', async (req, res) => {
  try {
    const { email, firstName, lastName, password } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
      return res.status(400).json({ error: 'Nieprawidłowy adres email' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków' });
    }

    // Sprawdź czy konto z tym emailem już istnieje
    const existing = await stripe.accounts.list({ limit: 100 });
    const found = existing.data.find(a => a.email === email.toLowerCase().trim());
    if (found) {
      if (found.charges_enabled) {
        return res.status(409).json({
          error: 'Konto z tym emailem już istnieje. Użyj opcji "Mam już konto — zaloguj się".',
        });
      }
      // Konto istnieje ale onboarding nie dokończony — wygeneruj nowy link
      const accountLink = await stripe.accountLinks.create({
        account: found.id,
        refresh_url: `${process.env.APP_URL}/stripe/refresh`,
        return_url: `${process.env.APP_URL}/stripe/success`,
        type: 'account_onboarding',
      });
      return res.json({ accountId: found.id, onboardingUrl: accountLink.url });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const accountData = {
      type: 'express',
      email: email.toLowerCase().trim(),
      country: 'PL',
      business_type: 'individual',
      business_profile: {
        name: 'Tip For Me',
        url: 'https://tipme.drinki.pl',
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: { schedule: { interval: 'manual' } },
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
    res.status(500).json({ error: error.message });
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

    // Znajdź konto po emailu — preferuj konta z charges_enabled i password_hash
    const accounts = await stripe.accounts.list({ limit: 100 });
    const allMatches = accounts.data.filter(a => a.email === email.toLowerCase().trim());
    if (!allMatches.length) {
      return res.status(404).json({ error: 'Nie znaleziono konta dla tego emaila' });
    }
    // Priorytet: enabled z hasłem > enabled bez hasła > z hasłem > pierwsze
    const match =
      allMatches.find(a => a.charges_enabled && a.metadata?.password_hash) ||
      allMatches.find(a => a.charges_enabled) ||
      allMatches.find(a => a.metadata?.password_hash) ||
      allMatches[0];

    // Weryfikuj hasło
    const hash = match.metadata?.password_hash;
    if (!hash) {
      // Konto założone przed wprowadzeniem auth — pozwól ustawić hasło
      return res.status(403).json({
        error: 'Konto wymaga ustawienia hasła.',
        needsPassword: true,
        accountId: match.id,
      });
    }
    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      return res.status(401).json({ error: 'Nieprawidłowe hasło' });
    }

    const token = match.charges_enabled ? createToken(match.id, email) : null;

    res.json({
      accountId: match.id,
      chargesEnabled: match.charges_enabled,
      detailsSubmitted: match.details_submitted,
      token,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CLEANUP — Usuń wszystkie Restricted (nieaktywne) konta
// Aktualizacja business_profile dla istniejącego konta
// ============================================
app.post('/api/update-business-profile/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    await stripe.accounts.update(accountId, {
      business_profile: {
        name: 'Tip For Me',
        url: 'https://tipme.drinki.pl',
      },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Jednorazowy endpoint — wywołaj raz, potem możesz go usunąć
// ============================================
app.delete('/api/cleanup-restricted-accounts', async (req, res) => {
  try {
    const accounts = await stripe.accounts.list({ limit: 100 });
    const restricted = accounts.data.filter(a => !a.charges_enabled);
    const deleted = [];
    const errors = [];
    for (const acc of restricted) {
      try {
        await stripe.accounts.del(acc.id);
        deleted.push(acc.id);
      } catch (e) {
        errors.push({ id: acc.id, error: e.message });
      }
    }
    res.json({ deleted, errors, total: deleted.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUTH — Ustawienie hasła dla kont bez hasła (migracja)
// ============================================
app.post('/api/auth/set-password', async (req, res) => {
  try {
    const { accountId, password } = req.body;
    if (!accountId || !password || password.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków' });
    }

    const account = await stripe.accounts.retrieve(accountId);
    if (account.metadata?.password_hash) {
      return res.status(409).json({ error: 'Konto ma już ustawione hasło. Użyj logowania.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await stripe.accounts.update(accountId, { metadata: { password_hash: passwordHash } });

    const token = account.charges_enabled ? createToken(accountId, account.email) : null;
    res.json({
      accountId,
      chargesEnabled: account.charges_enabled,
      token,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 2. SPRAWDZANIE STATUSU KONTA
// Czy użytkownik dokończył onboarding Stripe?
// ============================================
app.get('/api/account-status/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
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

    const token = account.charges_enabled ? createToken(account.id, account.email) : null;

    res.json({
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      capabilitiesStatus: caps.card_payments,
      token,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 3a. LOCATION — tworzenie lokalizacji dla Stripe Terminal
// Wymagane przed pierwszym użyciem Tap to Pay
// ============================================
app.post('/api/create-location', async (req, res) => {
  try {
    const { stripeAccountId, displayName } = req.body;

    if (!stripeAccountId || !stripeAccountId.startsWith('acct_')) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta Stripe' });
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
          line1: 'ul. Marszałkowska 1',
          postal_code: '00-001',
        },
      },
      { stripeAccount: stripeAccountId }
    );

    res.json({ locationId: location.id });
  } catch (error) {
    console.error('Create location error:', error);
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

    if (!amount || !Number.isInteger(amount) || amount < 100 || amount > 100000) {
      return res.status(400).json({ error: 'Nieprawidłowa kwota (100–100 000 groszy)' });
    }
    if (!stripeAccountId || !stripeAccountId.startsWith('acct_')) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta Stripe' });
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
    const rawLimit = parseInt(req.query.limit) || 20;
    const limit = Math.min(Math.max(rawLimit, 1), 100);

    const charges = await stripe.charges.list(
      { limit },
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

// Polska strefa: UTC+1 (zima) lub UTC+2 (lato)
function getPLOffset(date) {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  const isDST = date.getTimezoneOffset() < Math.max(jan, jul);
  return isDST ? 2 : 1;
}

// ============================================
// 6. STATYSTYKI — z obsługą daty i strefy PL
// ============================================
app.get('/api/stats/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { date } = req.query;

    const bounds = getPolandDayBounds(date || null);

    // balance_transactions zawierają dokładne opłaty pobrane przez Stripe
    const txns = await stripe.balanceTransactions.list(
      { created: bounds, limit: 100, type: 'payment' },
      { stripeAccount: accountId }
    );

    const successful = txns.data.filter((t) => t.status === 'available' || t.status === 'pending');

    const totalAmount   = successful.reduce((sum, t) => sum + t.amount, 0) / 100;
    const totalStripeFee = successful.reduce((sum, t) => sum + t.fee, 0) / 100;
    const totalNet      = successful.reduce((sum, t) => sum + t.net, 0) / 100;
    const count         = successful.length;
    const average       = count > 0 ? totalAmount / count : 0;

    // Prowizja platformy (5%) jest pobierana jako application_fee — już uwzględniona w net
    // Pokazujemy ją osobno dla przejrzystości
    const platformFee = totalAmount * PLATFORM_FEE_PERCENT;
    const netAfterAll = totalNet - platformFee;

    res.json({
      today: {
        total: totalAmount,
        count,
        average,
        stripeFee: totalStripeFee,       // dokładna opłata Stripe
        platformFee,                      // 5% prowizja Tip For Me
        net: Math.max(0, netAfterAll),    // rzeczywisty zarobek
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 7. PARAGON EMAILEM — potwierdzenie dla klienta
// ============================================
app.post('/api/send-receipt', async (req, res) => {
  try {
    const { email, amount, last4, paymentMethod, date } = req.body;

    await mailer.sendMail({
      from: `"Tip For Me" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Potwierdzenie napiwku — ${amount} zł`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0c0a13;color:#f3f0ff;padding:40px 32px;border-radius:20px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:48px;margin-bottom:8px;">✓</div>
            <h1 style="font-size:28px;font-weight:900;color:#10B981;margin:0;">Płatność przyjęta</h1>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(149,76,233,0.2);border-radius:16px;padding:24px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">KWOTA</span>
              <span style="font-size:24px;font-weight:900;color:#10B981;">${amount} zł</span>
            </div>
            <div style="border-top:1px solid rgba(149,76,233,0.15);padding-top:16px;display:flex;justify-content:space-between;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">KARTA</span>
              <span style="color:#A78BFA;font-weight:600;">${paymentMethod} ••${last4}</span>
            </div>
            <div style="border-top:1px solid rgba(149,76,233,0.15);padding-top:16px;margin-top:16px;display:flex;justify-content:space-between;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">DATA</span>
              <span style="color:#A78BFA;font-weight:600;">${date}</span>
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
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 8. SALDO KONTA — ile jest dostępne do wypłaty
// ============================================
app.get('/api/balance/:accountId', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 7a. SZCZEGÓŁY KONTA KELNERA
// ============================================
app.get('/api/account-details/:accountId', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 7b. HISTORIA WYPŁAT
// ============================================
app.get('/api/payouts/:accountId', async (req, res) => {
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
        arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
        created: new Date(p.created * 1000).toISOString(),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 8. LINK DO STRIPE DASHBOARD — zarządzanie kontem
// ============================================
app.get('/api/dashboard-link/:accountId', async (req, res) => {
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

    // Standard accounts używają głównego dashboardu Stripe — nie Express
    // createLoginLink działa tylko dla Express accounts
    res.json({ url: 'https://dashboard.stripe.com/' });
  } catch (error) {
    console.error('Dashboard link error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 9. WYPŁATA NA KONTO BANKOWE
// Wysyła dostępne środki na konto bankowe użytkownika
// ============================================
app.post('/api/payout/:accountId', async (req, res) => {
  try {
    const { amount } = req.body; // w złotówkach, null = wypłać wszystko

    // Pobierz dostępne saldo jeśli nie podano kwoty
    let payoutAmount = amount ? Math.round(amount * 100) : null;
    if (!payoutAmount) {
      const balance = await stripe.balance.retrieve(
        {},
        { stripeAccount: req.params.accountId }
      );
      const available = balance.available.find((b) => b.currency === 'pln');
      payoutAmount = available?.amount || 0;
    }

    if (payoutAmount < 200) { // min 2 zł
      return res.status(400).json({ error: 'Minimalna wypłata to 2 zł' });
    }

    const payout = await stripe.payouts.create(
      {
        amount: payoutAmount,
        currency: 'pln',
        description: 'Tip For Me — wypłata napiwków',
      },
      { stripeAccount: req.params.accountId }
    );

    res.json({
      id: payout.id,
      amount: payout.amount / 100,
      arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
      status: payout.status,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Webhook zarejestrowany na górze pliku (przed express.json())

// Health check — używany przez UptimeRobot żeby serwer nie zasypiał
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));


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
