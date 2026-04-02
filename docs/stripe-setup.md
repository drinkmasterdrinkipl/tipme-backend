# ⚡ Konfiguracja Stripe — Krok po kroku

## 1. Załóż konto Stripe

1. Wejdź na https://dashboard.stripe.com/register
2. Zarejestruj się podając email i dane firmy
3. Potwierdź email
4. Uzupełnij dane firmy (NIP, adres, konto bankowe)

## 2. Włącz Stripe Connect

1. W Stripe Dashboard idź do: **Settings → Connect**
2. Włącz Connect
3. Wybierz typ: **Standard accounts**
4. Ustaw branding platformy:
   - Nazwa: TipMe
   - Ikona: logo TipMe
   - Kolor: #a855f7

## 3. Włącz Stripe Terminal

1. W Dashboard idź do: **Payments → Terminal**
2. Włącz Terminal
3. Utwórz **Location** (lokalizacja):
   - Nazwa: "TipMe Default"
   - Adres: Twój adres firmy
4. Zapisz `location_id` — potrzebujesz go w TapScreen.tsx

## 4. Pobierz klucze API

1. Idź do: **Developers → API keys**
2. Skopiuj:
   - **Publishable key**: `pk_live_...` (lub `pk_test_...` do testów)
   - **Secret key**: `sk_live_...` (lub `sk_test_...` do testów)
3. Wklej je do pliku `.env` w backendzie

## 5. Skonfiguruj Webhooks (opcjonalnie)

1. Idź do: **Developers → Webhooks**
2. Dodaj endpoint: `https://your-backend.com/api/webhook`
3. Wybierz events:
   - `payment_intent.succeeded`
   - `account.updated`
4. Skopiuj **Webhook signing secret** do `.env`

## 6. Tap to Pay on iPhone — Wymagania

Aby używać Tap to Pay on iPhone:
- iPhone Xs lub nowszy
- iOS 16.4 lub nowszy
- Konto Stripe z włączonym Terminal
- Entitlement od Apple: `com.apple.developer.proximity-reader.payment.acceptance`

### Jak uzyskać entitlement od Apple:

1. Zaloguj się na https://developer.apple.com
2. Idź do: **Certificates, Identifiers & Profiles**
3. Wybierz swój App ID
4. Włącz capability: **Tap to Pay on iPhone**
5. Apple może wymagać dodatkowej weryfikacji

## 7. Testowanie

### Tryb testowy:
- Użyj kluczy `sk_test_...` i `pk_test_...`
- W TapScreen.tsx ustaw `simulated: true`
- Możesz testować bez prawdziwej karty

### Tryb produkcyjny:
- Zmień klucze na `sk_live_...` i `pk_live_...`
- Ustaw `simulated: false`
- Przetestuj z prawdziwą kartą

## 8. Prowizja (Twój zarobek)

W pliku `backend/server.js` jest linia:

```javascript
const PLATFORM_FEE_PERCENT = 0.05; // 5%
```

Zmień tę wartość na ile chcesz:
- `0.03` = 3%
- `0.05` = 5%
- `0.10` = 10%

Stripe automatycznie odlicza Twoją prowizję od każdego napiwku
i przelewa ją na Twoje konto platformy.

## 9. Checklist przed publikacją

- [ ] Konto Stripe zweryfikowane (dane firmy, konto bankowe)
- [ ] Connect włączony
- [ ] Terminal włączony
- [ ] Location utworzona
- [ ] Klucze produkcyjne w .env
- [ ] Backend wdrożony (Railway/Render)
- [ ] Entitlement Tap to Pay od Apple
- [ ] Testy z prawdziwą kartą
- [ ] App Store submission gotowy
