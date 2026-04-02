# 💜 TipMe — Kompletny Plan Projektu

## Czym jest TipMe?

Aplikacja mobilna na iPhone'a, która zamienia telefon w terminal do zbierania napiwków.
Klient przykłada kartę/telefon → napiwek trafia na konto użytkownika przez Stripe.

Każdy kelner, barman, fryzjer, taksówkarz czy muzyk uliczny może pobrać apkę z App Store,
podłączyć swoje konto Stripe i od razu zacząć zbierać napiwki.

---

## Jak zarabiasz (Twoja prowizja)

Przy każdym napiwku TipMe automatycznie pobiera prowizję:

| Napiwek klienta | Twoja prowizja (np. 5%) | Użytkownik dostaje |
|-----------------|-------------------------|--------------------|
| 10 zł           | 0,50 zł                 | 9,50 zł            |
| 20 zł           | 1,00 zł                 | 19,00 zł           |
| 50 zł           | 2,50 zł                 | 47,50 zł           |

Prowizję ustawiasz w kodzie (application_fee_amount w Stripe Connect).
Do tego Stripe pobiera swoją opłatę (~1.4% + opłata stała).

---

## Architektura

```
┌─────────────────────────────────────────┐
│              App Store                   │
│         Aplikacja TipMe (iOS)            │
│    React Native + Stripe Terminal SDK    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│          Backend (serwer API)            │
│         Node.js + Express                │
│    Stripe Connect + Auth + Database      │
│                                          │
│  Hosting: Railway / Render / Fly.io      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│             Stripe Connect               │
│                                          │
│  Twoje konto (platforma) ───► prowizja   │
│  Konto użytkownika ───► napiwki          │
└─────────────────────────────────────────┘
```

---

## Technologie

| Warstwa         | Technologia                              |
|-----------------|------------------------------------------|
| Aplikacja iOS   | React Native + Expo                      |
| Płatności NFC   | Stripe Terminal SDK (Tap to Pay on iPhone)|
| Backend/API     | Node.js + Express                        |
| Baza danych     | PostgreSQL (Supabase lub Railway)         |
| Autoryzacja     | Supabase Auth lub Firebase Auth           |
| Hosting backendu| Railway.app / Render.com / Fly.io        |
| Stripe          | Stripe Connect (Standard)                |

---

## Ekrany aplikacji

### 1. Onboarding (pierwszy raz)
- Ekran powitalny z logo TipMe
- "Zacznij zbierać napiwki" → rejestracja
- Rejestracja: email + hasło (lub Apple Sign In)
- Połączenie ze Stripe: przycisk "Połącz konto Stripe" → Stripe OAuth
- Gotowe! → przejście do głównego ekranu

### 2. Ekran główny — Zbieranie napiwków
- Kwoty presetowe: 5, 10, 15, 20, 30, 50 zł
- Pole na własną kwotę
- Duży przycisk "Pobierz napiwek"
- Podsumowanie dnia na górze (zebrano / liczba napiwków)

### 3. Ekran Tap to Pay
- Animacja NFC — "Przyłóż kartę"
- Klient przykłada kartę → Stripe Terminal przetwarza
- Ekran sukcesu z konfetti

### 4. Historia
- Lista dzisiejszych napiwków
- Kwota, metoda płatności, godzina

### 5. Statystyki
- Zebrano dziś / netto / prowizja Stripe
- Wykres godzinowy
- Metody płatności

### 6. Profil / Ustawienia
- Status konta Stripe (połączone / nie)
- Wyloguj się
- Pomoc / Kontakt

---

## Krok po kroku — Jak zbudować

### KROK 1: Konto Stripe Connect

1. Zaloguj się na https://dashboard.stripe.com
2. Idź do Settings → Connect
3. Włącz "Standard" connected accounts
4. Ustaw swoją prowizję (application fee)
5. Zapisz klucze API:
   - `STRIPE_SECRET_KEY` (sk_live_...)
   - `STRIPE_PUBLISHABLE_KEY` (pk_live_...)

### KROK 2: Backend (Node.js)

Backend obsługuje:
- Rejestrację użytkowników
- Tworzenie Stripe Connected Accounts (OAuth)
- Tworzenie Payment Intents z prowizją
- Tworzenie Connection Tokens dla Terminal SDK

Plik `server.js` — patrz plik: **backend/server.js**

### KROK 3: Aplikacja React Native

Plik główny — patrz: **app/App.tsx**

Wymaga:
- Expo SDK
- @stripe/stripe-terminal-react-native
- react-navigation

### KROK 4: Wgranie na App Store

1. Zbuduj aplikację: `eas build --platform ios`
2. Wyślij do App Store: `eas submit --platform ios`
3. Wypełnij opis, screenshoty, kategorię
4. Apple review (~1-3 dni)
5. Publikacja!

---

## Koszty uruchomienia

| Pozycja                    | Koszt              |
|----------------------------|--------------------|
| Apple Developer Account    | 99$/rok (masz już) |
| Hosting backendu (Railway) | ~5$/mies           |
| Baza danych (Supabase)     | 0$ (darmowy plan)  |
| Stripe                     | 1.4% + opłata/tx   |
| Domena (opcjonalnie)       | ~50 zł/rok         |
| **RAZEM start**            | **~25 zł/mies**    |

---

## Pliki projektu

```
tipme/
├── README.md              ← ten plik
├── backend/
│   ├── server.js          ← serwer API
│   ├── package.json
│   └── .env.example       ← zmienne środowiskowe
├── app/
│   ├── App.tsx            ← główna aplikacja
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── TapScreen.tsx
│   │   ├── SuccessScreen.tsx
│   │   ├── HistoryScreen.tsx
│   │   ├── StatsScreen.tsx
│   │   └── OnboardingScreen.tsx
│   ├── package.json
│   └── app.json           ← konfiguracja Expo
└── docs/
    └── stripe-setup.md    ← instrukcja konfiguracji Stripe
```
