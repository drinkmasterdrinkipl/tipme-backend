// ============================================
// Tip For Me Backend — server.js
// Node.js + Express + Stripe Connect
// ============================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
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
const allowedOrigins = ['https://tipforme.app', 'https://tipme-backend-2rcv.onrender.com'];
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

// Limit na reset hasła — zapobiega spamowaniu emaili i enumeracji kont
const forgotPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Za dużo prób. Poczekaj 15 minut.' } });
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth/reset-password', loginLimiter);

// Limit na wysyłanie emaili — zapobiega spamowaniu przez skompromitowany token
const receiptLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Zbyt wiele potwierdzeń. Poczekaj godzinę.' } });
app.use('/api/send-receipt', receiptLimiter);

// Limit na account-status — 60/15min pozwala na 2h polling co 30s (max 30 req)
// + margin na ręczne sprawdzenie statusu i kilka urządzeń jednocześnie
const accountStatusLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { error: 'Za dużo zapytań. Poczekaj chwilę.' } });
app.use('/api/account-status', accountStatusLimiter);

// ============================================
// POWIADOMIENIA WŁAŚCICIELA — „wpadła Ci prowizja"
// Dwa niezależne kanały, każdy włącza się osobno przez zmienną środowiskową:
//   NTFY_TOPIC          → natychmiastowy push przez ntfy.sh (apka na telefonie)
//   OWNER_NOTIFY_EMAIL  → e-mail na wskazany adres (domyślnie chwascinski@icloud.com)
// Oba są fire-and-forget — nie blokują odpowiedzi 200 dla Stripe.
// ============================================
async function sendNtfy(message) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { 'Title': 'Tip For Me', 'Tags': 'moneybag', 'Priority': 'default' },
      body: message,
    });
  } catch (e) { console.error('ntfy notify error:', e.message); }
}

async function sendOwnerEmail(subject, text) {
  const to = process.env.OWNER_NOTIFY_EMAIL || 'chwascinski@icloud.com';
  if (!to || !process.env.SMTP_USER) return;
  try {
    await mailer.sendMail({ from: `"Tip For Me" <${process.env.SMTP_USER}>`, to, subject, text });
  } catch (e) { console.error('owner email notify error:', e.message); }
}

function notifyOwnerNewTip(fee) {
  const commission = (fee.amount || 0) / 100;               // moja prowizja (grosze → zł)
  const tip = commission > 0 ? commission / PLATFORM_FEE_PERCENT : 0; // szacowana kwota napiwku
  const acct = fee.account ? String(fee.account).slice(-6) : '';
  const msg = `Nowy napiwek: ${tip.toFixed(2)} zł\nTwoja prowizja: ${commission.toFixed(2)} zł${acct ? `\nKonto: …${acct}` : ''}`;
  sendNtfy(`💰 ${msg}`).catch(() => {});
  sendOwnerEmail(`💰 Prowizja ${commission.toFixed(2)} zł — Tip For Me`, msg).catch(() => {});
}

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
  // Odpowiedz Stripe od razu, potem przetwarzaj (Stripe oczekuje szybkiego 2xx)
  res.json({ received: true });
  switch (event.type) {
    case 'application_fee.created':
      // Prowizja platformy naliczona = ktoś dostał napiwek → powiadom właściciela
      notifyOwnerNewTip(event.data.object);
      break;
    case 'payment_intent.succeeded':
    case 'account.updated':
    default:
      break;
  }
});

app.use(express.json());

// ============================================
// Widok panelu admina (HTML). Dane pobierane z /api/admin/overview (wymaga hasła).
// ============================================
const ADMIN_HTML = `<!doctype html>
<html lang="pl"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Panel — Tip For Me</title>
<style>
:root{--bg:#0b0817;--card:#141026;--bd:#241c3f;--txt:#e9e6f5;--mut:#9a91b8;--pur:#8b5cf6;--grn:#34d399;--yel:#fbbf24;--red:#f87171}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font-family:-apple-system,Inter,Segoe UI,Roboto,sans-serif;line-height:1.5;padding:24px}
.wrap{max-width:1100px;margin:0 auto}
h1{font-size:22px;font-weight:800;margin-bottom:4px}
.sub{color:var(--mut);font-size:13px;margin-bottom:24px}
.login{max-width:360px;margin:12vh auto;background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:28px}
.login h2{font-size:18px;margin-bottom:16px}
input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--bd);background:#0e0a1e;color:var(--txt);font-size:15px}
button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:10px;background:var(--pur);color:#fff;font-weight:700;font-size:15px;cursor:pointer}
button:hover{opacity:.92}
.err{color:var(--red);font-size:13px;margin-top:10px;min-height:16px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px 18px}
.card .lbl{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.card .val{font-size:24px;font-weight:800;margin-top:6px}
.card.hi{border-color:var(--pur)}.card.hi .val{color:var(--pur)}
.statline{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0 22px;color:var(--mut);font-size:13px}
.statline b{color:var(--txt)}
.tbl{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:14px;overflow:hidden}
th,td{text-align:left;padding:12px 14px;font-size:13px;border-bottom:1px solid var(--bd);vertical-align:top}
th{color:var(--mut);text-transform:uppercase;font-size:11px;letter-spacing:.5px}
tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.pill.verified{background:rgba(52,211,153,.15);color:var(--grn)}
.pill.pending{background:rgba(251,191,36,.15);color:var(--yel)}
.pill.incomplete{background:rgba(154,145,184,.15);color:var(--mut)}
.pill.restricted{background:rgba(248,113,113,.15);color:var(--red)}
.mono{font-family:ui-monospace,monospace;color:var(--mut);font-size:11px;word-break:break-all}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:12px}
.refresh{width:auto;padding:9px 14px;margin:0;font-size:13px;background:#1c1636}
@media(max-width:760px){.cards{grid-template-columns:1fr 1fr}body{padding:14px}.hidem{display:none}}
</style></head>
<body><div class="wrap">
  <div id="login" class="login">
    <h2>🔒 Panel Tip For Me</h2>
    <input id="pw" type="password" placeholder="Hasło administratora" autocomplete="current-password"/>
    <button onclick="login()">Wejdź</button>
    <div id="err" class="err"></div>
  </div>
  <div id="panel" style="display:none">
    <div class="top">
      <div><h1>Panel — Tip For Me</h1><div class="sub" id="gen"></div></div>
      <button class="refresh" onclick="load()">Odśwież</button>
    </div>
    <div class="cards" id="cards"></div>
    <div class="statline" id="statline"></div>
    <table class="tbl"><thead><tr>
      <th>Użytkownik</th><th>Status</th>
      <th class="num">Napiwki</th><th class="num">Zarobił</th><th class="num">Moja prowizja</th>
      <th class="hidem">Konto Stripe</th>
    </tr></thead><tbody id="tbody"></tbody></table>
  </div>
</div>
<script>
var KEY='';
function fmt(n){return (Number(n)||0).toFixed(2).replace('.',',')+' zł';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function plName(s){return s==='verified'?'✅ Zweryfikowany':s==='pending'?'⏳ W trakcie':s==='restricted'?'⛔ Zablokowany':'❌ Niedokończony';}
function fail(m){document.getElementById('err').textContent=m;sessionStorage.removeItem('tk');}
function login(){KEY=document.getElementById('pw').value;document.getElementById('err').textContent='Ładowanie…';load();}
function card(l,v,hi){return '<div class="card'+(hi?' hi':'')+'"><div class="lbl">'+l+'</div><div class="val">'+v+'</div></div>';}
function load(){
  fetch('/api/admin/overview',{headers:{'x-admin-key':KEY}}).then(function(r){
    if(r.status===401){fail('Błędne hasło');return;}
    if(r.status===503){fail('Serwer: brak ADMIN_PASSWORD (ustaw w Render)');return;}
    if(!r.ok){fail('Błąd serwera ('+r.status+')');return;}
    return r.json().then(render);
  }).catch(function(){fail('Błąd połączenia');});
}
function render(d){
  sessionStorage.setItem('tk',KEY);
  document.getElementById('login').style.display='none';
  document.getElementById('panel').style.display='block';
  var t=d.totals;
  document.getElementById('cards').innerHTML=card('Moja prowizja łącznie',fmt(t.commission),true)+card('Suma napiwków',fmt(t.volume))+card('Liczba napiwków',t.count)+card('Użytkownicy',t.users);
  document.getElementById('statline').innerHTML='✅ Zweryfikowani: <b>'+t.verified+'</b> · ⏳ W trakcie: <b>'+t.pending+'</b> · ❌ Niedokończeni: <b>'+t.incomplete+'</b> · ⛔ Zablokowani: <b>'+t.restricted+'</b>';
  var rows='';
  d.users.forEach(function(u){
    var who=esc(u.email||u.name||'—')+(u.name&&u.email?'<div class="mono">'+esc(u.name)+'</div>':'');
    rows+='<tr><td>'+who+'</td><td><span class="pill '+u.status+'">'+plName(u.status)+'</span></td><td class="num">'+u.count+'</td><td class="num">'+fmt(u.volume)+'</td><td class="num">'+fmt(u.commission)+'</td><td class="hidem mono">'+esc(u.id)+'</td></tr>';
  });
  document.getElementById('tbody').innerHTML=rows||'<tr><td colspan="6" style="color:#9a91b8">Brak kont</td></tr>';
  var dt=new Date((d.generatedAt||0)*1000);
  document.getElementById('gen').textContent='Dane na żywo ze Stripe · '+dt.toLocaleString('pl-PL');
}
var saved=sessionStorage.getItem('tk');
if(saved){KEY=saved;load();}
document.getElementById('pw').addEventListener('keydown',function(e){if(e.key==='Enter')login();});
</script></body></html>`;

// Health check przed API key — UptimeRobot nie wysyła X-Api-Key
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ============================================
// PANEL ADMINA (tylko właściciel) — PRZED strażnikiem API_SECRET
// Chroniony osobnym hasłem ADMIN_PASSWORD (ustaw w Render → Environment).
// Serwowany z tego samego origina co API → brak problemów z CORS.
// ============================================
function adminAuth(req, res, next) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return res.status(503).json({ error: 'ADMIN_PASSWORD nie jest ustawiony na serwerze.' });
  const provided = String(req.headers['x-admin-key'] || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(String(pass));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Błędne hasło.' });
  }
  next();
}

// Rate limit na logowanie do panelu — anty brute-force
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Za dużo prób. Poczekaj 15 minut.' } });
app.use('/api/admin/', adminLimiter);

// Dane do panelu: konta, weryfikacja, zarobki, prowizje
app.get('/api/admin/overview', adminAuth, async (req, res) => {
  try {
    // 1) wszystkie konta połączone (paginacja, cap 1000)
    const accts = [];
    let sa = null;
    for (let i = 0; i < 10; i++) {
      const page = await stripe.accounts.list(sa ? { limit: 100, starting_after: sa } : { limit: 100 });
      accts.push(...page.data);
      if (!page.has_more || page.data.length === 0) break;
      sa = page.data[page.data.length - 1].id;
    }

    const users = [];
    let platVolumeGr = 0, platCommissionGr = 0, platCount = 0;

    for (const a of accts) {
      const rq = a.requirements || {};
      const dr = rq.disabled_reason || '';
      // "Naprawdę zablokowane" = odrzucone/wstrzymane przez Stripe (NIE zwykły brak danych)
      const hardBlocked = dr.startsWith('rejected') || ['platform_paused', 'listed', 'under_review', 'other'].includes(dr);
      let status;
      if (a.charges_enabled && a.payouts_enabled && a.details_submitted) status = 'verified';
      else if (hardBlocked) status = 'restricted';       // realnie zablokowane
      else if (!a.details_submitted) status = 'incomplete'; // nie dokończył rejestracji
      else status = 'pending';                            // wysłał dane, czeka na weryfikację/uzupełnienie

      // Zarobki + prowizja tylko dla kont, które mogą przyjmować płatności
      let volumeGr = 0, commissionGr = 0, count = 0;
      if (a.charges_enabled) {
        try {
          let csa = null;
          for (let j = 0; j < 5; j++) { // cap 500 płatności / konto
            const cp = await stripe.charges.list(
              csa ? { limit: 100, starting_after: csa } : { limit: 100 },
              { stripeAccount: a.id }
            );
            for (const c of cp.data) {
              if (c.paid && c.status === 'succeeded' && !c.refunded) {
                volumeGr += c.amount;
                commissionGr += (c.application_fee_amount || 0);
                count++;
              }
            }
            if (!cp.has_more || cp.data.length === 0) break;
            csa = cp.data[cp.data.length - 1].id;
          }
        } catch (e) { /* konto może odmówić dostępu — pomiń */ }
      }

      platVolumeGr += volumeGr;
      platCommissionGr += commissionGr;
      platCount += count;

      const name = (a.business_profile && a.business_profile.name)
        || (a.individual ? `${a.individual.first_name || ''} ${a.individual.last_name || ''}`.trim() : '')
        || '';

      users.push({
        id: a.id,
        email: a.email || (a.individual && a.individual.email) || '',
        name,
        status,
        chargesEnabled: !!a.charges_enabled,
        payoutsEnabled: !!a.payouts_enabled,
        detailsSubmitted: !!a.details_submitted,
        currentlyDue: (rq.currently_due || []).length,
        reason: dr,
        type: a.type || '',
        created: a.created,
        volume: volumeGr / 100,
        commission: commissionGr / 100,
        count,
      });
    }

    users.sort((x, y) => y.volume - x.volume || y.commission - x.commission);

    // === FINANSE PLATFORMY (Twoje) — saldo, prowizje, koszty Stripe, zysk netto ===
    let balAvailGr = 0, balPendGr = 0;
    try {
      const bal = await stripe.balance.retrieve();
      balAvailGr = (bal.available || []).reduce((s, x) => s + x.amount, 0);
      balPendGr = (bal.pending || []).reduce((s, x) => s + x.amount, 0);
    } catch (e) { /* pomiń */ }

    let revenueGr = 0, refundGr = 0;
    const costMap = {};
    try {
      let bsa = null;
      for (let i = 0; i < 15; i++) { // cap 1500 transakcji salda
        const bt = await stripe.balanceTransactions.list(bsa ? { limit: 100, starting_after: bsa } : { limit: 100 });
        for (const t of bt.data) {
          if (t.type === 'application_fee') revenueGr += t.net;
          else if (t.type === 'application_fee_refund') refundGr += Math.abs(t.amount);
          else if (t.type === 'stripe_fee' || (t.amount < 0 && t.reporting_category === 'fee')) {
            const key = t.description || 'Opłata Stripe';
            costMap[key] = (costMap[key] || 0) + Math.abs(t.amount);
          }
        }
        if (!bt.has_more || bt.data.length === 0) break;
        bsa = bt.data[bt.data.length - 1].id;
      }
    } catch (e) { /* pomiń */ }

    const costs = Object.entries(costMap)
      .map(([label, gr]) => ({ label, amount: gr / 100 }))
      .sort((a, b) => b.amount - a.amount);
    const totalCostsGr = Object.values(costMap).reduce((s, x) => s + x, 0);
    const netProfitGr = revenueGr - refundGr - totalCostsGr;

    res.json({
      totals: {
        commission: platCommissionGr / 100, // moja prowizja łącznie (z płatności)
        volume: platVolumeGr / 100,          // suma napiwków (obrót)
        count: platCount,
        users: users.length,
        verified: users.filter(u => u.status === 'verified').length,
        pending: users.filter(u => u.status === 'pending').length,
        incomplete: users.filter(u => u.status === 'incomplete').length,
        restricted: users.filter(u => u.status === 'restricted').length,
      },
      platform: {
        balanceAvailable: balAvailGr / 100,
        balancePending: balPendGr / 100,
        revenue: revenueGr / 100,      // prowizje netto (z salda)
        refunds: refundGr / 100,
        costs,                         // [{label, amount}] — Active Account Billing, Payout Fee, ...
        totalCosts: totalCostsGr / 100,
        netProfit: netProfitGr / 100,  // zysk = prowizje − zwroty − koszty Stripe
      },
      generatedAt: Math.floor(Date.now() / 1000),
      users,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Usuwanie konta połączonego (Express) — działa dla kont bez salda.
// Konta Standard mogą odmówić (Stripe zwróci błąd — pokazujemy go w panelu).
app.delete('/api/admin/account/:id', adminAuth, async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^acct_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: 'Nieprawidłowe ID konta.' });
  try {
    const del = await stripe.accounts.del(id);
    return res.json({ ok: true, deleted: del.deleted === true, method: 'deleted', id });
  } catch (e1) {
    // Konto Standard nie da się usunąć — spróbuj je ROZŁĄCZYĆ przez OAuth (jeśli ustawiony client_id)
    if (process.env.STRIPE_CLIENT_ID) {
      try {
        await stripe.oauth.deauthorize({ client_id: process.env.STRIPE_CLIENT_ID, stripe_user_id: id });
        return res.json({ ok: true, deleted: true, method: 'disconnected', id });
      } catch (e2) {
        return res.status(400).json({ error: e2.message || e1.message, standard: true });
      }
    }
    return res.status(400).json({ error: e1.message || 'Nie udało się usunąć konta.', standard: true, needClientId: true });
  }
});

// Strona panelu — kanoniczny adres to tipforme.app/admin (pełny panel).
// Backendowy /admin serwuje prosty panel zapasowy albo przekierowuje.
app.get('/admin', (req, res) => res.redirect(302, 'https://tipforme.app/admin'));

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
    return res.status(401).json({ error: 'Brak autoryzacji.' });
  }
  next();
});

// ============================================
// Twoja prowizja (w groszach!)
// 7% = mnożnik 0.07
// Przykład: napiwek 20 zł = 2000 gr → prowizja = 140 gr = 1.40 zł
// ============================================
const PLATFORM_FEE_PERCENT = 0.07; // 7% — prowizja platformy
const PER_AUTH_FEE = 0.40; // zł — opłata Stripe Tap to Pay za każdą faktyczną płatność (Per Auth Fee)

// ============================================
// RATE LIMITING — ochrona przed spamem
// Zapobiega płaceniu 0.40 zł Per Auth Fee
// za każde przypadkowe/testowe tapnięcie
// ============================================
// Opłata Stripe (~0,40 zł) naliczana jest tylko za FAKTYCZNĄ płatność (przyłożona karta),
// a nie za samo wybicie kwoty — więc długi cooldown był zbędny i blokował szybkie inkasowanie.
// Zostaje minimalny bufor (3 s) tylko jako zabezpieczenie przed przypadkowym podwójnym obciążeniem.
const PAYMENT_COOLDOWN_MS = 3 * 1000;    // 3 sekundy — tylko anty-podwójne-tapnięcie
const DAILY_PAYMENT_LIMIT = 200;         // realny zapas dla zapracowanej zmiany

const paymentLastTime = new Map();  // accountId -> timestamp ostatniej próby
const paymentDailyCount = new Map(); // accountId -> { count, date }

// Cleanup co 24h — zapobiega memory leak przy długim działaniu serwera
setInterval(() => {
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const [key, val] of paymentDailyCount.entries()) {
    if (val.date !== todayStr) paymentDailyCount.delete(key);
  }
  const cutoff = Date.now() - 60 * 60 * 1000; // usuń wpisy starsze niż 1h
  for (const [key, val] of paymentLastTime.entries()) {
    if (val < cutoff) paymentLastTime.delete(key);
  }
}, 24 * 60 * 60 * 1000);

function checkPaymentRateLimit(accountId) {
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Cooldown między płatnościami
  const lastTime = paymentLastTime.get(accountId);
  if (lastTime && (now - lastTime) < PAYMENT_COOLDOWN_MS) {
    const secsLeft = Math.ceil((PAYMENT_COOLDOWN_MS - (now - lastTime)) / 1000);
    return { allowed: false, error: `Poczekaj ${secsLeft} sekund przed kolejną płatnością.` };
  }

  // Dzienny limit
  const daily = paymentDailyCount.get(accountId);
  if (daily && daily.date === todayStr && daily.count >= DAILY_PAYMENT_LIMIT) {
    return { allowed: false, error: 'Przekroczono dzienny limit transakcji.' };
  }

  // Aktualizuj liczniki
  paymentLastTime.set(accountId, now);
  paymentDailyCount.set(accountId, {
    date: todayStr,
    count: (daily && daily.date === todayStr) ? daily.count + 1 : 1,
  });

  return { allowed: true };
}

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

    // Sprawdź czy konto z tym emailem już istnieje
    const found = await findStripeAccountByEmail(email);
    if (found) {
      // Niedokończona rejestracja (brak details_submitted) — pozwól wznowić
      if (!found.details_submitted) {
        return res.status(409).json({
          error: 'Masz niedokończoną rejestrację. Zaloguj się aby kontynuować.',
          incompleteRegistration: true,
        });
      }
      // Konto w pełni założone — przekieruj do logowania
      return res.status(409).json({
        error: 'Konto z tym emailem już istnieje. Użyj opcji "Mam już konto — zaloguj się".',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const normalizedEmail = email.toLowerCase().trim();
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || normalizedEmail.split('@')[0];

    const accountData = {
      type: 'express',
      country: 'PL',
      email: normalizedEmail,
      business_type: 'individual',
      business_profile: {
        name: displayName,
        mcc: '7299',
        url: 'https://tipforme.app', // auto-wypełnione — jedno pole mniej w rejestracji Stripe
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: { schedule: { interval: 'weekly', weekly_anchor: 'monday' } },
      },
      metadata: { password_hash: passwordHash },
    };

    if (firstName || lastName) {
      accountData.individual = {
        ...(firstName && { first_name: firstName.trim().slice(0, 50) }),
        ...(lastName && { last_name: lastName.trim().slice(0, 50) }),
        email: normalizedEmail,
      };
    }

    const account = await stripe.accounts.create(accountData);

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `https://tipforme.app/stripe/success.html`,
      return_url: `https://tipforme.app/stripe/success.html`,
      type: 'account_onboarding',
      collection_options: { fields: 'currently_due' },
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

    for (const account of sorted) {
      const hash = account.metadata?.password_hash;
      if (!hash) continue; // stare konto testowe bez hasła — pomijamy
      const valid = await bcrypt.compare(password, hash);
      if (valid) { match = account; break; }
    }

    // Konto z charges_enabled nie ma hasła — powinno użyć resetu
    const bestAccount = sorted[0];
    if (!match && bestAccount && !bestAccount.metadata?.password_hash) {
      return res.status(403).json({
        error: 'To konto nie ma jeszcze ustawionego hasła. Użyj opcji "Zapomniałeś hasła?" aby ustawić hasło przez email.',
        needsPasswordReset: true,
      });
    }
    if (!match) {
      return res.status(401).json({ error: 'Nieprawidłowe hasło' });
    }

    // Token wydawany zawsze gdy hasło poprawne — niezależnie od statusu Stripe
    const token = createToken(match.id, email);

    // Niedokończony onboarding — wygeneruj świeży link do Stripe
    let onboardingUrl = null;
    if (!match.details_submitted) {
      try {
        const accountLink = await stripe.accountLinks.create({
          account: match.id,
          refresh_url: `https://tipforme.app/stripe/success.html`,
          return_url: `https://tipforme.app/stripe/success.html`,
          type: 'account_onboarding',
          collection_options: { fields: 'currently_due' },
        });
        onboardingUrl = accountLink.url;
      } catch { /* nie blokuj logowania jeśli link się nie wygeneruje */ }
    }

    res.json({
      accountId: match.id,
      chargesEnabled: match.charges_enabled,
      detailsSubmitted: match.details_submitted,
      token,
      ...(onboardingUrl && { onboardingUrl }),
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
  }
});

// Endpointy administracyjne (update-business-profile, cleanup-restricted-accounts)
// zostały usunięte — były bez autentykacji i nie są potrzebne w produkcji

// ============================================
// AUTH — Ustawienie hasła dla kont bez hasła (migracja)
// set-password usunięty — zastąpiony przez forgot-password (weryfikacja przez email)

// ============================================
// AUTH — Reset hasła (krok 1: wyślij email)
// ============================================
app.post('/api/auth/forgot-password', async (req, res) => {
  // Zawsze zwracamy tę samą odpowiedź — nie ujawniamy czy email istnieje w systemie
  const safeOk = () => res.json({ message: 'Jeśli konto istnieje, wysłaliśmy link resetujący na podany email.' });

  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Nieprawidłowy adres email' });
    }
    const normalizedEmail = email.toLowerCase().trim();

    // Użyj WSZYSTKICH kont i posortuj tak samo jak login — charges_enabled pierwszy
    const accounts = await findAllStripeAccountsByEmail(normalizedEmail);
    if (!accounts.length) return safeOk();

    const sorted = accounts.sort((a, b) => {
      if (a.charges_enabled && !b.charges_enabled) return -1;
      if (!a.charges_enabled && b.charges_enabled) return 1;
      if (a.details_submitted && !b.details_submitted) return -1;
      if (!a.details_submitted && b.details_submitted) return 1;
      return 0;
    });

    // Preferuj aktywne konto z hasłem
    const account = sorted.find(a => a.charges_enabled && a.metadata?.password_hash)
      || sorted.find(a => a.metadata?.password_hash)
      || sorted[0];

    if (!account || !account.metadata?.password_hash) return safeOk();

    // Generuj losowy nonce (32 bajty = 64 hex znaków)
    const nonce = crypto.randomBytes(32).toString('hex');
    const nonceHash = crypto.createHash('sha256').update(nonce).digest('hex');
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 godzina

    // Zapisz hash nonce + czas wygaśnięcia w Stripe metadata (NIE surowy nonce)
    await stripe.accounts.update(account.id, {
      metadata: {
        reset_nonce_hash: nonceHash,
        reset_nonce_expires: String(expiresAt),
      },
    });

    // Podpisz JWT z accountId + surowy nonce (expiry 1h) — token do emaila
    const resetToken = jwt.sign(
      { accountId: account.id, nonce, sub: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const resetLink = `tipforme://reset-password?token=${encodeURIComponent(resetToken)}`;

    const html = `
<!DOCTYPE html>
<html lang="pl" style="background:#0c0a13;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style type="text/css">
    html, body, .bg { background-color: #0c0a13 !important; }
    .card { background-color: #13111c !important; }
    .sec { background-color: #1a1428 !important; }
    body { margin: 0 !important; padding: 0 !important; }
  </style>
</head>
<body class="bg" bgcolor="#0c0a13" style="margin:0;padding:0;background-color:#0c0a13 !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0c0a13" style="background-color:#0c0a13 !important;padding:40px 20px;">
    <tr><td align="center" bgcolor="#0c0a13" style="background-color:#0c0a13 !important;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" bgcolor="#0c0a13" style="background-color:#0c0a13 !important;padding-bottom:32px;">
          <div style="font-size:36px;margin-bottom:8px;">💜</div>
          <div style="font-size:22px;font-weight:900;color:#a855f7;letter-spacing:-0.5px;">Tip For Me</div>
        </td></tr>

        <!-- Karta główna -->
        <tr><td class="card" bgcolor="#13111c" style="background-color:#13111c !important;border:1px solid #2a1f3d;border-radius:20px;padding:36px 32px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#f0eef5;letter-spacing:-0.5px;">
            Reset hasła
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#9980b3;line-height:1.6;">
            Otrzymaliśmy prośbę o reset hasła do Twojego konta.<br>
            Kliknij przycisk poniżej, aby ustawić nowe hasło.
          </p>

          <!-- Przycisk -->
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
            <tr><td align="center" bgcolor="#a855f7" style="background-color:#a855f7 !important;border-radius:14px;">
              <a href="${resetLink}"
                 style="display:inline-block;padding:16px 36px;font-size:16px;font-weight:800;color:#ffffff !important;text-decoration:none;letter-spacing:-0.3px;">
                Ustaw nowe hasło →
              </a>
            </td></tr>
          </table>

          <!-- Bezpieczeństwo -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
            <tr><td class="sec" bgcolor="#1a1428" style="background-color:#1a1428 !important;border:1px solid #2a1f3d;border-radius:12px;padding:16px;">
              <p style="margin:0;font-size:13px;color:#9980b3;line-height:1.6;">
                🔒 <strong style="color:#c084fc;">Link jest jednorazowy i wygasa po 1 godzinie.</strong><br>
                Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość — Twoje konto jest bezpieczne.
              </p>
            </td></tr>
          </table>

        </td></tr>

        <!-- Stopka -->
        <tr><td align="center" bgcolor="#0c0a13" style="background-color:#0c0a13 !important;padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#6d5c8a;line-height:1.6;">
            Tip For Me · Bezpieczne płatności napiwkowe<br>
            Obsługiwane przez <a href="https://stripe.com" style="color:#a855f7;text-decoration:none;">Stripe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await mailer.sendMail({
      from: `"Tip For Me" <${process.env.SMTP_USER}>`,
      to: normalizedEmail,
      subject: 'Reset hasła — Tip For Me',
      html,
      text: `Reset hasła — Tip For Me\n\nOtrzymaliśmy prośbę o reset hasła. Otwórz ten link na urządzeniu z aplikacją:\n\n${resetLink}\n\nLink wygasa po 1 godzinie. Jeśli nie prosiłeś o reset, zignoruj tę wiadomość.`,
    });

    safeOk();
  } catch (error) {
    console.error('Forgot password error:', error);
    // Zwracamy safeOk() nawet przy błędzie — nie ujawniamy czy konto istnieje
    safeOk();
  }
});

// ============================================
// AUTH — Reset hasła (krok 2: ustaw nowe hasło)
// ============================================
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Brakuje tokenu resetującego.' });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków.' });
    }

    // Zweryfikuj JWT (podpis + expiry)
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Link wygasł lub jest nieprawidłowy. Poproś o nowy link resetujący.' });
    }

    if (payload.sub !== 'password-reset' || !payload.accountId || !payload.nonce) {
      return res.status(400).json({ error: 'Nieprawidłowy link resetujący.' });
    }
    if (!validateAccountId(payload.accountId)) {
      return res.status(400).json({ error: 'Nieprawidłowy link resetujący.' });
    }

    // Pobierz konto z Stripe — tu zmiana hasła jest FAKTYCZNIE wykonywana
    let account;
    try {
      account = await stripe.accounts.retrieve(payload.accountId);
    } catch {
      return res.status(400).json({ error: 'Konto nie istnieje lub zostało usunięte.' });
    }

    const storedHash = account.metadata?.reset_nonce_hash;
    const storedExpires = Number(account.metadata?.reset_nonce_expires || '0');

    // Sprawdź czy nonce w ogóle istnieje (może już był użyty)
    if (!storedHash) {
      return res.status(400).json({ error: 'Link został już użyty lub wygasł. Poproś o nowy.' });
    }

    // Sprawdź czy nie wygasł (dodatkowe sprawdzenie poza JWT)
    if (Date.now() > storedExpires) {
      return res.status(400).json({ error: 'Link wygasł. Poproś o nowy link resetujący.' });
    }

    // Porównaj hash nonce — timing-safe (zabezpieczenie przed timing attacks)
    const expectedHash = crypto.createHash('sha256').update(payload.nonce).digest('hex');
    let hashesMatch = false;
    try {
      hashesMatch = crypto.timingSafeEqual(
        Buffer.from(storedHash.padEnd(64, '0'), 'hex'),
        Buffer.from(expectedHash.padEnd(64, '0'), 'hex')
      ) && storedHash.length === expectedHash.length;
    } catch {
      hashesMatch = false;
    }

    if (!hashesMatch) {
      return res.status(400).json({ error: 'Nieprawidłowy link resetujący.' });
    }

    // Hashe się zgadzają — zmień hasło i unieważnij token (jednorazowy)
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Jedno wywołanie Stripe: nowe hasło + wyczyszczony nonce
    await stripe.accounts.update(payload.accountId, {
      metadata: {
        password_hash: newPasswordHash,
        reset_nonce_hash: '',      // puste string = usuń z metadata Stripe
        reset_nonce_expires: '',
      },
    });

    res.json({ success: true, message: 'Hasło zostało zmienione. Możesz się teraz zalogować.' });
  } catch (error) {
    console.error('Reset password error:', error);
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

    // Idempotentnie: jeśli konto ma już lokalizację, zwróć ją zamiast tworzyć kolejną.
    // Zapobiega mnożeniu lokalizacji i naprawia „Brak lokalizacji Stripe" przy ponownym logowaniu.
    const existingLocs = await stripe.terminal.locations.list({ limit: 1 }, { stripeAccount: stripeAccountId });
    if (existingLocs.data.length > 0) {
      return res.json({ locationId: existingLocs.data[0].id });
    }

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

    if (!amount || !Number.isInteger(amount) || amount < 500 || amount > 100000) {
      return res.status(400).json({ error: 'Minimalna kwota napiwku to 5 zł' });
    }
    if (!stripeAccountId || !stripeAccountId.startsWith('acct_')) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta Stripe' });
    }
    // Weryfikacja: użytkownik może tworzyć płatności tylko na swoim koncie
    if (req.user.accountId !== stripeAccountId) {
      return res.status(403).json({ error: 'Brak uprawnień do tego konta' });
    }

    // Rate limiting — ochrona przed spamem
    const rateLimit = checkPaymentRateLimit(stripeAccountId);
    if (!rateLimit.allowed) {
      return res.status(429).json({ error: rateLimit.error });
    }

    // amount w groszach (np. 2000 = 20 zł)
    const applicationFee = Math.round(amount * PLATFORM_FEE_PERCENT);

    // Idempotency key zapobiega podwójnym płatnościom przy ponowieniu requestu
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Brak idempotency-key' });
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amount,
        currency: 'pln',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        application_fee_amount: applicationFee,
        description: 'Tip For Me - napiwek',
        statement_descriptor_suffix: 'Tip For Me',
      },
      {
        stripeAccount: stripeAccountId,
        idempotencyKey,
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
// ZWROT NAPIWKU
// Tworzy refund na charge w imieniu connected account
// ============================================
app.post('/api/refund', authenticateToken, async (req, res) => {
  try {
    const { chargeId, stripeAccountId } = req.body;
    if (!chargeId || !stripeAccountId) {
      return res.status(400).json({ error: 'Brak chargeId lub stripeAccountId' });
    }
    if (!validateAccountId(stripeAccountId)) {
      return res.status(400).json({ error: 'Nieprawidłowe ID konta' });
    }
    if (req.user.accountId !== stripeAccountId) {
      return res.status(403).json({ error: 'Brak uprawnień do tego konta' });
    }

    const charge = await stripe.charges.retrieve(chargeId, { stripeAccount: stripeAccountId });

    // Sprawdź saldo przed zwrotem — opłata Stripe nie jest zwracana,
    // więc konto musi mieć available >= kwota zwrotu + bufor.
    // Jeśli środki są pending lub już wypłacone na konto bankowe, available = 0 → blokada.
    const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });
    const availableBalance = balance.available.find(b => b.currency === 'pln');
    const availableAmount = (availableBalance?.amount || 0) / 100;
    const refundAmount = charge.amount / 100;
    const STRIPE_FEE_BUFFER = 0.50;
    if (availableAmount < refundAmount + STRIPE_FEE_BUFFER) {
      return res.status(400).json({
        error: `Zwrot niemożliwy — środki jeszcze w rozliczeniu lub już wypłacone na konto bankowe. Dostępne saldo: ${availableAmount.toFixed(2)} zł.`
      });
    }

    const refund = await stripe.refunds.create(
      { charge: chargeId },
      { stripeAccount: stripeAccountId }
    );
    res.json({ refundId: refund.id, status: refund.status });
  } catch (error) {
    res.status(500).json({ error: safeError(error) });
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
      refunded: charge.refunded,
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

    const relevant = allTxns.filter((t) =>
      (t.status === 'available' || t.status === 'pending') &&
      (t.type === 'payment' || t.type === 'charge' || t.type === 'refund')
    );

    const payments       = relevant.filter(t => t.amount > 0);
    const totalAmount    = relevant.reduce((sum, t) => sum + t.amount, 0) / 100;
    const totalNet       = relevant.reduce((sum, t) => sum + t.net, 0) / 100;
    const count          = payments.length;
    const average        = count > 0 ? payments.reduce((sum, t) => sum + t.amount, 0) / 100 / count : 0;

    // Prowizja i opłata za przetworzenie czytane z PRAWDZIWEGO rozbicia Stripe (fee_details):
    // application_fee = nasza prowizja, stripe_fee = koszt przetworzenia. Dzięki temu jest zawsze
    // poprawne niezależnie od stawki użytej przy danym napiwku (historycznie 5%, obecnie 7%).
    let platformFeeGr = 0, stripeProcessingGr = 0;
    for (const t of relevant) {
      for (const fd of (t.fee_details || [])) {
        if (fd.type === 'application_fee') platformFeeGr += fd.amount;
        else if (fd.type === 'stripe_fee') stripeProcessingGr += fd.amount;
      }
    }
    const platformFee      = platformFeeGr / 100;       // realna prowizja (application_fee) — cokolwiek było ustawione
    const stripeProcessing = stripeProcessingGr / 100;  // realna opłata za przetworzenie karty

    // Osobna opłata Stripe Tap to Pay (~0,40 zł za każdą płatność) — powiązana z liczbą napiwków dnia.
    const perAuthFee = count * PER_AUTH_FEE;

    // Realne netto (tyle wpada na konto): po opłacie Stripe (już zawiera prowizję) minus opłata Tap to Pay.
    const net = Math.max(0, totalNet - perAuthFee);
    // Opłata Stripe pokazywana użytkownikowi = przetwarzanie + Tap to Pay (prowizja jest osobną pozycją).
    const stripeFee = stripeProcessing + perAuthFee;

    res.json({
      today: {
        total: totalAmount,
        count,
        average,
        stripeFee,
        platformFee,
        net,
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
    const { email, amount, last4, paymentMethod, date, status } = req.body;
    const isDeclined = status === 'declined';

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

    const subjectLine = isDeclined
      ? `Płatność odrzucona — ${safeAmount} zł`
      : `Potwierdzenie napiwku — ${safeAmount} zł`;

    const htmlBody = isDeclined ? `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0c0a13;color:#f3f0ff;padding:40px 32px;border-radius:20px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:48px;margin-bottom:8px;">✗</div>
            <h1 style="font-size:28px;font-weight:900;color:#f87171;margin:0;">Płatność odrzucona</h1>
            <p style="color:#6B7280;font-size:14px;margin-top:8px;">Transakcja nie została zrealizowana</p>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(248,113,113,0.2);border-radius:16px;padding:24px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">KWOTA</span>
              <span style="font-size:24px;font-weight:900;color:#f87171;">${safeAmount} zł</span>
            </div>
            <div style="border-top:1px solid rgba(248,113,113,0.15);padding-top:16px;display:flex;justify-content:space-between;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">KARTA</span>
              <span style="color:#A78BFA;font-weight:600;">${safeMethod} ••${safeLast4}</span>
            </div>
            <div style="border-top:1px solid rgba(248,113,113,0.15);padding-top:16px;margin-top:16px;display:flex;justify-content:space-between;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">DATA</span>
              <span style="color:#A78BFA;font-weight:600;">${safeDate}</span>
            </div>
            <div style="border-top:1px solid rgba(248,113,113,0.15);padding-top:16px;margin-top:16px;display:flex;justify-content:space-between;">
              <span style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:2px;">STATUS</span>
              <span style="color:#f87171;font-weight:700;">Odrzucono</span>
            </div>
          </div>
          <p style="color:#6B7280;font-size:12px;text-align:center;line-height:20px;">
            Żadne środki nie zostały pobrane z Twojej karty.<br/>
            Płatności obsługuje <strong style="color:#C084FC;">Stripe Payments Europe Ltd.</strong>
          </p>
        </div>
      ` : `
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
      `;

    await mailer.sendMail({
      from: `"Tip For Me" <${process.env.SMTP_USER}>`,
      to: email.trim(),
      subject: subjectLine,
      html: htmlBody,
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
      { limit: 10 },
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
// 7b. ROCZNE ZESTAWIENIE WYPŁAT — wszystkie wypłaty z danego roku
// ============================================
app.get('/api/payouts-annual/:accountId', authenticateToken, requireOwnership, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const gte = Math.floor(new Date(year, 0, 1).getTime() / 1000);
    const lt  = Math.floor(new Date(year + 1, 0, 1).getTime() / 1000);

    const allPayouts = [];
    let startingAfter;
    let hasMore = true;

    while (hasMore) {
      const params = { limit: 100, created: { gte, lt } };
      if (startingAfter) params.starting_after = startingAfter;
      const result = await stripe.payouts.list(params, { stripeAccount: req.params.accountId });
      for (const p of result.data) {
        allPayouts.push({
          id: p.id,
          amount: p.amount / 100,
          status: p.status,
          arrivalDate: p.arrival_date,
        });
      }
      hasMore = result.has_more;
      if (result.data.length > 0) startingAfter = result.data[result.data.length - 1].id;
    }

    res.json({ payouts: allPayouts, year });
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
        refresh_url: `https://tipforme.app/stripe/success.html`,
        return_url: `https://tipforme.app/stripe/success.html`,
        type: 'account_onboarding',
        collection_options: { fields: 'currently_due' },
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

// Endpoint /api/payout usunięty — wypłaty są automatyczne (schedule: weekly, poniedziałek)
// Stripe sam przelewa dostępne środki każdego dnia roboczego na konto bankowe użytkownika


// Webhook zarejestrowany na górze pliku (przed express.json())

// Globalny error handler — nie ujawnia stack trace w produkcji
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Błąd serwera' : err.message });
});


// ============================================
// USUNIĘCIE KONTA — wymaganie Apple 5.1.1 + RODO
// ============================================
app.delete('/api/delete-account', authenticateToken, async (req, res) => {
  try {
    const accountId = req.user.accountId;
    if (!accountId) return res.status(400).json({ error: 'Brak ID konta' });

    // Sprawdź saldo — Stripe nie pozwala usunąć konta z dodatnim saldem
    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0);
    if (available > 0 || pending > 0) {
      return res.status(400).json({
        error: 'Nie można usunąć konta z niezerowym saldem. Wypłać środki przed usunięciem konta.',
        balance: { available: available / 100, pending: pending / 100 },
      });
    }

    // Usuń konto Stripe Connect — usuwa wszystkie dane użytkownika
    await stripe.accounts.del(accountId);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: safeError(error) });
  }
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
